#!/usr/bin/env node
/**
 * Repeatable concurrency test against a real Supabase project.
 *
 * This exercises the full production path — HTTPS, PostgREST, connection
 * pooling, RLS, cast_vote — which the SQL suite deliberately does not.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   LOADTEST_CONFIRM=1 node scripts/load-test.mjs [--voters 100]
 *
 * Optional, enables the server-side integrity check and richer output:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=...
 *
 * RUN THIS AGAINST A REHEARSAL EVENT, NOT THE REAL ONE. It casts real
 * votes that it cannot delete (nothing is allowed to delete votes, by
 * design), so the event it targets is no longer clean afterwards. Set up
 * a throwaway event, start it, open voting, then run this.
 *
 * Expected result at the default 100 voters:
 *   - exactly 100 accepted votes, 0 duplicates, 0 unexpected errors
 *   - the duplicate burst yields exactly 1 accepted and N-1 ALREADY_VOTED
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const VOTERS = Number(argOf("voters", 100));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (process.env.LOADTEST_CONFIRM !== "1") {
  console.error(
    "Refusing to run without LOADTEST_CONFIRM=1.\n" +
      "This casts real, undeletable votes. Point it at a rehearsal event.",
  );
  process.exit(1);
}

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const tally = (rows) =>
  rows.reduce((acc, r) => ((acc[r.outcome] = (acc[r.outcome] ?? 0) + 1), acc), {});

async function castVote(client, participantId, voterId, rating) {
  const started = performance.now();
  const { error } = await client.rpc("cast_vote", {
    p_participant_id: participantId,
    p_voter_id: voterId,
    p_rating: rating,
  });
  return {
    outcome: error ? error.message : "ACCEPTED",
    ms: performance.now() - started,
  };
}

/** Fires every request before awaiting any of them, so they truly overlap. */
async function burst(participantId, voterIds) {
  const client = anon();
  const inFlight = voterIds.map((voterId, i) =>
    castVote(client, participantId, voterId, 1 + (i % 5)),
  );
  return Promise.all(inFlight);
}

function report(title, rows) {
  const latencies = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n── ${title}`);
  for (const [outcome, count] of Object.entries(tally(rows)).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(count).padStart(5)}  ${outcome}`);
  }
  console.log(
    `   latency  p50 ${pct(latencies, 50).toFixed(0)}ms   ` +
      `p95 ${pct(latencies, 95).toFixed(0)}ms   max ${latencies.at(-1).toFixed(0)}ms`,
  );
  return tally(rows);
}

const failures = [];
const expect = (label, condition, detail) => {
  if (condition) {
    console.log(`   PASS  ${label}`);
  } else {
    console.log(`   FAIL  ${label}${detail ? ` (${detail})` : ""}`);
    failures.push(label);
  }
};

async function main() {
  const client = anon();

  const { data: event, error: eventError } = await client
    .from("events")
    .select("id, status, voting_state, active_participant_id")
    .eq("status", "live")
    .maybeSingle();

  if (eventError) throw new Error(`Could not read event: ${eventError.message}`);
  if (!event) throw new Error("No live event. Start one and open voting first.");
  if (event.voting_state !== "open") {
    throw new Error(`Voting is '${event.voting_state}', expected 'open'. Open voting first.`);
  }
  if (!event.active_participant_id) throw new Error("No active participant.");

  const participantId = event.active_participant_id;
  const run = `lt${Date.now().toString(36)}`;
  console.log(`Target participant ${participantId}`);
  console.log(`Run id ${run} — ${VOTERS} concurrent voters`);

  // ── 1. distinct voters, all at once ────────────────────────────────
  const distinct = Array.from({ length: VOTERS }, (_, i) => `${run}d${String(i).padStart(12, "0")}`);
  const wallStart = performance.now();
  const distinctRows = await burst(participantId, distinct);
  const wall = performance.now() - wallStart;
  const distinctTally = report(`${VOTERS} simultaneous distinct voters`, distinctRows);
  console.log(`   wall ${wall.toFixed(0)}ms  (${((VOTERS / wall) * 1000).toFixed(0)} votes/sec)`);

  expect("every distinct voter is accepted", distinctTally.ACCEPTED === VOTERS,
    `accepted ${distinctTally.ACCEPTED ?? 0}/${VOTERS}`);
  expect("no unexpected errors", Object.keys(distinctTally).every((k) => k === "ACCEPTED"),
    Object.keys(distinctTally).filter((k) => k !== "ACCEPTED").join(", "));

  // ── 2. one voter, many simultaneous submissions (double-click/retry) ─
  const dupCount = Math.min(25, VOTERS);
  const dupRows = await burst(participantId, Array(dupCount).fill(`${run}dup000000000`));
  const dupTally = report(`${dupCount} simultaneous submissions from ONE voter`, dupRows);

  expect("exactly one submission is accepted", dupTally.ACCEPTED === 1,
    `accepted ${dupTally.ACCEPTED ?? 0}`);
  expect("every other submission returns ALREADY_VOTED",
    dupTally.ALREADY_VOTED === dupCount - 1,
    `got ${dupTally.ALREADY_VOTED ?? 0} of ${dupCount - 1}`);
  // The audience UI keys its "you have already rated this" state off this
  // exact string, so a change in how PostgREST surfaces it would silently
  // downgrade that message to a generic error.
  expect("duplicate error surfaces as the exact ALREADY_VOTED sentinel",
    dupRows.some((r) => r.outcome === "ALREADY_VOTED"));

  // ── 3. server-side integrity (needs admin) ─────────────────────────
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("\n── Server-side integrity check skipped (set ADMIN_EMAIL/ADMIN_PASSWORD)");
  } else {
    const admin = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: signInError } = await admin.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`Admin sign-in failed: ${signInError.message}`);

    const { data: votes, error: votesError } = await admin
      .from("votes")
      .select("voter_id, rating, participant_id")
      .like("voter_id", `${run}%`);
    if (votesError) throw new Error(`Could not read votes: ${votesError.message}`);

    console.log("\n── Server-side integrity");
    const voterIds = votes.map((v) => v.voter_id);
    expect("stored vote count matches accepted count", votes.length === VOTERS + 1,
      `stored ${votes.length}, expected ${VOTERS + 1}`);
    expect("no duplicate voter ids in the database",
      new Set(voterIds).size === voterIds.length);
    expect("every vote landed on the intended participant",
      votes.every((v) => v.participant_id === participantId));
    expect("every stored rating is an integer 1-5",
      votes.every((v) => Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 5));

    const { data: board } = await admin.rpc("get_leaderboard", { p_event_id: event.id });
    const row = board?.find((b) => b.participant_id === participantId);
    if (row) {
      const expectedAvg = row.total_rating_points / row.vote_count;
      expect("leaderboard average matches points/count exactly",
        Math.abs(Number(row.average_rating) - expectedAvg) < 1e-9,
        `${row.average_rating} vs ${expectedAvg}`);
    }
    await admin.auth.signOut();
  }

  console.log(
    failures.length === 0
      ? "\nALL CHECKS PASSED"
      : `\n${failures.length} CHECK(S) FAILED:\n  - ${failures.join("\n  - ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nLoad test aborted: ${err.message}`);
  process.exit(1);
});
