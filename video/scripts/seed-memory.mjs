/**
 * Put something in the agent's memory, the way a user would.
 *
 * `/memory` rendered its empty state in the first v6 cut — "Nothing remembered
 * yet" — under a caption saying "what it remembers, and what it retrieved to
 * answer you". A caption that claims more than the screen shows is the exact
 * failure this project exists to avoid, so either the caption or the screen had
 * to change. The screen is the honest one to change: the memory store is real,
 * it was simply empty because nobody had used it.
 *
 * This asks the agent to remember things in its own chat, which is what the
 * empty state itself tells you to do ("Ask the agent to remember something").
 * The agent decides what to store and stores it through `save_memory`. Nothing
 * is written to the database behind its back — same principle as the watchlist
 * and outbox seeding in `capture.mjs`.
 *
 * Run with the stack up, then re-record the memory shot.
 */
import { chromium } from "playwright";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ASKS = [
  "Remember that I only want to see calls where conviction clears sixty-five percent — " +
    "below that I would rather you said nothing.",
  "Also remember that I track the private banks most closely, and that I care more " +
    "about being told when you don't know than about getting a number every day.",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "dark" });
const page = await ctx.newPage();

await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle", timeout: 60000 });

for (const ask of ASKS) {
  // Focus by label: the rotating suggestion overlays the composer and swallows
  // clicks aimed at the textarea (CLAUDE.md).
  const box = page.getByLabel(/^Message /);
  await box.focus();
  await box.fill(ask);
  await page.locator('[data-testid="chat-send"]').click();
  await page
    .locator('[data-testid="chat-send"][aria-label="Send"]')
    .waitFor({ state: "visible", timeout: 120000 });
  console.log(`asked: ${ask.slice(0, 60)}…`);
  await sleep(2500);
}

await page.goto(`${BASE}/memory`, { waitUntil: "networkidle", timeout: 60000 });
const stored = await page.locator("main ul > li").count();
await browser.close();

if (stored === 0) {
  console.error(
    "memory is still empty — the agent answered without calling save_memory. " +
      "Do not record the memory shot: the caption would claim more than the screen shows.",
  );
  process.exit(1);
}
console.log(`memory now holds ${stored} item(s)`);
