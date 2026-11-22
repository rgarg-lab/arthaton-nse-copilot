/**
 * Print `audio/read-aloud.html` to `audio/NSE-Copilot-VO-script.pdf`.
 *
 * Uses the Chromium that Playwright already installed for `capture.mjs`, so
 * there is no new dependency and no LaTeX. Run it after editing the HTML:
 *
 *   node scripts/build_script_pdf.mjs
 */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "audio", "read-aloud.html");
const DEST = join(ROOT, "audio", "NSE-Copilot-VO-script.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(SRC).href, { waitUntil: "networkidle" });
// Margins are declared here and nowhere else — see the note in read-aloud.css.
await page.pdf({
  path: DEST,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", right: "15mm", bottom: "14mm", left: "15mm" },
});
await browser.close();
console.log(`wrote ${DEST}`);
