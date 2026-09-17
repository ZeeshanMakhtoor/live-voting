#!/usr/bin/env node
/**
 * Generates the audience QR code and a projection/print poster.
 *
 *   node scripts/qr/make-qr.mjs https://live-voting-phi.vercel.app
 *
 * Writes into qr-out/:
 *   vote-qr.svg     the bare code, vector, for slides or print
 *   vote-poster.html the poster; open it and print, or screenshot it
 *
 * Error correction is set to H (recovers ~30% damage) because this gets
 * projected, photographed at an angle and scanned across a dark room —
 * conditions where a denser, more forgiving code is worth the extra modules.
 *
 * Re-run it with a different URL if the domain ever changes. Circulate ONE
 * address: a voter's identity is stored per domain, so someone arriving on a
 * different hostname counts as a new person.
 */
import QRCode from "qrcode";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error("Usage: node scripts/qr/make-qr.mjs <https://your-url>");
  process.exit(1);
}

const OUT = "qr-out";
await mkdir(OUT, { recursive: true });

const svg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "H",
  margin: 2,
  color: { dark: "#1a1714", light: "#f3efe7" },
});
await writeFile(`${OUT}/vote-qr.svg`, svg);

// The poster uses the app's own typefaces so the printed sheet and the
// phone screen read as one thing.
const poster = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Scan to vote</title>
<style>
  @font-face { font-family:"Fraunces"; src:url("../public/fonts/fraunces-latin.woff2") format("woff2");
               font-weight:100 900; font-display:swap; }
  @font-face { font-family:"Space Grotesk"; src:url("../public/fonts/space-grotesk-latin.woff2") format("woff2");
               font-weight:300 700; font-display:swap; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:1600px; background:#f3efe7; color:#1a1714;
         font-family:"Space Grotesk",system-ui,sans-serif;
         display:flex; flex-direction:column; }
  .masthead { border-bottom:8px solid #1a1714; padding:48px 64px; }
  .masthead p { font-size:26px; font-weight:700; letter-spacing:.3em; text-transform:uppercase; }
  main { flex:1; display:flex; flex-direction:column; align-items:center;
         justify-content:center; padding:56px 64px; text-align:center; }
  .eyebrow { font-size:24px; font-weight:700; letter-spacing:.22em;
             text-transform:uppercase; color:#5a534c; }
  h1 { font-family:"Fraunces",Georgia,serif; font-weight:900; font-size:124px;
       line-height:.95; letter-spacing:-.02em; margin-top:16px; }
  .qr { border:10px solid #1a1714; padding:28px; background:#f3efe7; margin:52px 0 40px; }
  .qr svg { display:block; width:620px; height:620px; }
  .url { font-size:34px; font-weight:700; letter-spacing:.02em; word-break:break-all; }
  .url-label { font-size:22px; letter-spacing:.18em; text-transform:uppercase;
               color:#5a534c; margin-bottom:12px; }
  footer { border-top:8px solid #1a1714; padding:36px 64px; text-align:center;
           font-size:26px; letter-spacing:.14em; text-transform:uppercase; color:#5a534c; }
</style>
</head>
<body>
  <div class="masthead"><p>Literary Club</p></div>
  <main>
    <p class="eyebrow">Vote from your phone</p>
    <h1>Scan to vote</h1>
    <div class="qr">${svg}</div>
    <p class="url-label">Or open</p>
    <p class="url">${url.replace(/^https?:\/\//, "")}</p>
  </main>
  <footer>One vote per performer &nbsp;·&nbsp; No sign-in needed</footer>
</body>
</html>`;
await writeFile(`${OUT}/vote-poster.html`, poster);

console.log(`QR for ${url}`);
console.log(`  ${OUT}/vote-qr.svg`);
console.log(`  ${OUT}/vote-poster.html`);
