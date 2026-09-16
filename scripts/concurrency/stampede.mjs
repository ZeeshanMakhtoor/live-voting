// Browser-level concurrency test: N independent phones, one simultaneous tap.
//
// This drives the REAL audience app in N real browser contexts (each with its
// own localStorage, so each is a distinct voter) and fires every Submit click
// in the same tick. It covers the client half of concurrency — React state,
// the double-submit guard, and what each voter is actually told — which the
// SQL and HTTP tests cannot see.
//
// It runs against scripts/concurrency/mock-supabase.mjs, which enforces the
// same invariants cast_vote() does. For the real backend over HTTPS, use
// scripts/load-test.mjs instead.
//
//   npm install -D playwright && npx playwright install chromium
//   node scripts/concurrency/mock-supabase.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=local NEXT_PUBLIC_ADMIN_HOST=admin.localhost:3000 \
//     npm run build && npx next start -p 3000 &
//   N=100 MODE=single node scripts/concurrency/stampede.mjs
//
// MODE=single  every voter taps Submit once, at the same instant
// MODE=double  every voter double-taps (impatience / flaky touch)
// MODE=closed  the admin closes voting a moment before the stampede lands
import { chromium } from "playwright";

const N = Number(process.env.N ?? 100);
const MODE = process.env.MODE ?? "single";   // single | double | closed
const APP = "http://127.0.0.1:3000/";
const MOCK = "http://127.0.0.1:54321";

const reset = async (voting = "open") =>
  (await fetch(`${MOCK}/__test/reset?voting=${voting}`)).json();
const stats = async () => (await fetch(`${MOCK}/__test/stats`)).json();

console.log(`\n=== ${N} simultaneous voters — mode: ${MODE} ===`);
await reset(MODE === "closed" ? "open" : "open");

const browser = await chromium.launch({
  // Only needed where Playwright's bundled browser isn't on the default path.
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const pageErrors = [];
const voters = [];

// Each voter gets its own browser context, so each has its own localStorage
// and therefore its own voter id — 100 separate people, not 100 tabs.
process.stdout.write("opening voters: ");
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`voter${i}: ${e.message}`));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  // Wait until this voter's app is actually ready to vote.
  await page.locator('label:has(input[value="4"])').waitFor({ state: "visible", timeout: 30000 });
  await page.locator(`label:has(input[value="${1 + (i % 5)}"])`).click();
  voters.push({ i, ctx, page });
  if ((i + 1) % 20 === 0) process.stdout.write(`${i + 1} `);
}
console.log(`\nall ${N} voters primed and holding a rating.`);

if (MODE === "closed") {
  // The admin closes voting while every phone is sitting on the submit
  // button, about to press it.
  await reset("closed");
  console.log("admin closed voting a moment before the stampede.");
}

// The stampede: every page fires its click in the same tick. No awaits
// between them, so the clicks are issued together rather than in sequence.
const t0 = Date.now();
const clicks = voters.map(({ page }) => {
  const btn = page.getByRole("button", { name: /^Submit \d$/ });
  return MODE === "double"
    ? btn.click({ timeout: 30000 }).then(() => btn.click({ timeout: 2000 }).catch(() => {}))
    : btn.click({ timeout: 30000 });
});
await Promise.allSettled(clicks);
const clickMs = Date.now() - t0;

// Wait for every page to settle into a terminal state.
const outcomes = await Promise.all(
  voters.map(async ({ page }) => {
    try {
      await page
        .locator("text=/Rating submitted|Already rated|Something went wrong|not open|no longer active|closed/i")
        .first()
        .waitFor({ timeout: 30000 });
      const body = await page.locator("main").innerText();
      if (/Rating submitted/i.test(body)) return "submitted";
      if (/Already rated/i.test(body)) return "already_rated";
      if (/closed/i.test(body)) return "voting_closed";
      if (/not open/i.test(body)) return "voting_not_open";
      return "error_shown";
    } catch {
      return "stuck_no_feedback";
    }
  }),
);
const totalMs = Date.now() - t0;

const tally = outcomes.reduce((a, o) => ((a[o] = (a[o] ?? 0) + 1), a), {});
const s = await stats();

console.log(`\nclicks issued in ${clickMs}ms; all pages settled by ${totalMs}ms`);
console.log("UI outcome per voter:", tally);
console.log("server saw:", s);
console.log(pageErrors.length ? `PAGE ERRORS:\n${pageErrors.slice(0, 5).join("\n")}` : "no page errors");

await browser.close();

// Assertions differ by what the scenario is supposed to prove.
const fail = [];
if (MODE === "single") {
  if (tally.submitted !== N) fail.push(`expected ${N} submitted, got ${tally.submitted ?? 0}`);
  if (s.votes !== N) fail.push(`expected ${N} votes stored, got ${s.votes}`);
  if (s.distinctVoters !== N) fail.push(`expected ${N} distinct voters, got ${s.distinctVoters}`);
} else if (MODE === "double") {
  if (s.votes !== N) fail.push(`double-click created ${s.votes} votes, expected ${N}`);
  if ((tally.submitted ?? 0) + (tally.already_rated ?? 0) !== N)
    fail.push("some voters ended in neither submitted nor already-rated");
} else if (MODE === "closed") {
  if (s.votes !== 0) fail.push(`${s.votes} votes landed after voting closed, expected 0`);
  if (tally.stuck_no_feedback) fail.push(`${tally.stuck_no_feedback} voters got no feedback at all`);
}
if (tally.stuck_no_feedback) fail.push(`${tally.stuck_no_feedback} voters left with no feedback`);
if (pageErrors.length) fail.push(`${pageErrors.length} page errors`);

console.log(fail.length ? `\nFAILED:\n - ${fail.join("\n - ")}` : "\nPASS");
process.exit(fail.length ? 1 : 0);
