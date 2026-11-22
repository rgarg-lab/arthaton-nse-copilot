/**
 * Stage 5 — record the real app.
 *
 * Drives the running application with Playwright and records genuine browser
 * video. Nothing here reconstructs or approximates the UI: every frame is the
 * real Next.js app talking to the real FastAPI model service, and the script
 * refuses to record if either is down.
 *
 * **Seeding is real usage, not fabrication.** `/watchlist` and `/outbox` start
 * empty, because they hold the *user's* state rather than the model's. So the
 * script does what a user would do — adds four names, queues a digest, delivers
 * it — and then records the result. Every figure that appears is still computed
 * by the app from the committed artifacts.
 *
 * Two cosmetic additions to the recording, both logged in BUILD_LOG D5.3: a
 * drawn cursor dot (Playwright's video does not capture the real pointer) and
 * hidden scrollbars. Neither adds, hides or alters a figure.
 *
 * Run with the stack up:
 *   python ml/tasks.py serve   (:8000)
 *   npm start                  (:3000)
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(HERE, "..", "captures", "originals");
const RAW_DIR = join(HERE, "..", ".capture-raw");

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3000";
const W = 1920;
const H = 1080;

/** A visible pointer, since Playwright video does not record the real one. */
const CURSOR = `
  (() => {
    if (document.getElementById('__cap_cursor')) return;
    const d = document.createElement('div');
    d.id = '__cap_cursor';
    d.style.cssText = [
      'position:fixed','z-index:2147483647','width:22px','height:22px',
      'margin:-11px 0 0 -11px','border-radius:50%','pointer-events:none',
      'background:rgba(135,204,247,0.25)','border:2px solid rgba(135,204,247,0.9)',
      'transition:transform 60ms linear','left:0','top:0',
    ].join(';');
    document.documentElement.appendChild(d);
    window.__capMove = (x, y) => {
      d.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    };
    const s = document.createElement('style');
    s.textContent = '*{scrollbar-width:none !important}*::-webkit-scrollbar{display:none !important}';
    document.head.appendChild(s);
  })();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Move the real mouse and the drawn dot together, in eased steps. */
async function glide(page, from, to, steps = 24) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = from[0] + (to[0] - from[0]) * e;
    const y = from[1] + (to[1] - from[1]) * e;
    await page.mouse.move(x, y);
    await page.evaluate(([a, b]) => window.__capMove?.(a, b), [x, y]).catch(() => {});
    await sleep(16);
  }
  return to;
}

/** Slow, readable scroll — several small steps rather than one jump. */
async function creep(page, total, steps = 6, pause = 260) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, total / steps);
    await sleep(pause);
  }
}

async function preflight() {
  for (const [url, what] of [
    [`${BASE}/signals`, "the Next.js app (npm start)"],
    ["http://127.0.0.1:8000/health", "the ML service (python ml/tasks.py serve)"],
  ]) {
    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) {
      throw new Error(
        `${what} is not answering at ${url}. Refusing to record: ` +
          `a capture of an error state is not a capture of the app.`,
      );
    }
  }
}

/**
 * Put the user's own state into the app the way a user would.
 *
 * Idempotent: adding a name that is already tracked is a no-op, and the digest
 * is queued fresh each run. Runs once, before any recording.
 */
async function seed(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "dark" });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/watchlist`, { waitUntil: "networkidle", timeout: 60000 });
  for (const t of ["RELIANCE", "HDFCBANK", "INFY", "TCS"]) {
    try {
      await page.selectOption("select", { label: t });
      await page.getByRole("button", { name: "Add" }).click();
      await sleep(700);
    } catch {
      /* already tracked */
    }
  }

  await page.goto(`${BASE}/outbox`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "Queue a digest" }).click().catch(() => {});
  await sleep(1800);
  await page.getByRole("button", { name: "Deliver due now" }).click().catch(() => {});
  await sleep(2200);

  await ctx.close();
  console.log("seeded watchlist + outbox");
}

/**
 * The shot list.
 *
 * ## v6: the product is now shown working
 *
 * Until v6 this recorded eight passive page views and never once showed anybody
 * *using* the thing. `/workspace` — where the chat, the trace panel and the four
 * panes live — had never been filmed at all, which made the AI the one part of an
 * AI submission that stayed off camera.
 *
 * The chat is recorded as **one continuous take**, not three. A conversation has
 * history, and Playwright gives each context its own recording, so filming the
 * beats separately would have meant three first messages in an empty thread.
 * `workspace-chat` records the whole exchange and `extract-capture-frames.mjs`
 * slices it into beats at offsets taken from the marks written beside it —
 * measured, not guessed, because live answer latency is not predictable.
 *
 * Deliberately **not** here: the raw `/signals/{ticker}` JSON response, which read
 * as a broken page; `/alerts`, which 404s (BUILD_LOG D5.7). Dropped in v6:
 * `signals-board`, `signals-tiles`, `evidence` and `abstention-card`, because the
 * workspace tabs show the same data and showing it twice is what made the cut feel
 * like a slideshow.
 */

/**
 * Pick the two names the demo asks about, from the model rather than from memory.
 *
 * Reads the **running ML service**, not `ml/artifacts/latest_signals.json`. The
 * committed artifact is a snapshot written on 16 Nov quoting the 11 Nov session,
 * while the app computes from the live panel and is on 19 Nov — so the artifact
 * and the screen disagree, and the artifact says every name abstains while the
 * screen shows eight calls. Hardcoding either would have put a false number in
 * the film.
 *
 * Throws rather than falling back: a demo that silently asks about the wrong kind
 * of name is worse than one that fails to record.
 */
async function pickNames() {
  const res = await fetch("http://127.0.0.1:8000/signals").catch(() => null);
  if (!res || !res.ok) throw new Error("ML service did not answer /signals");
  const body = await res.json();
  const rows = Array.isArray(body) ? body : body.signals;

  // The callback: the name beat 3.5 proved it was right about in April 2022. It
  // is declined today, which is a better demo than a call would have been — the
  // film's whole argument is that being right once does not license an answer
  // every time. If it is ever called again, fall back to the nearest miss.
  const bajaj = rows.find((r) => r.ticker === "BAJFINANCE.NS");
  const declined = bajaj?.abstain
    ? bajaj
    : rows.filter((r) => r.abstain).sort((a, b) => b.conviction - a.conviction)[0];
  const called = rows
    .filter((r) => !r.abstain)
    .sort((a, b) => b.conviction - a.conviction)[0];

  if (!declined) throw new Error("no abstaining name today — the refusal beat cannot be filmed");
  if (!called) throw new Error("no called name today — the demo has nothing to contrast");

  console.log(
    `  demo names: declines ${declined.name} (${declined.conviction.toFixed(4)}), ` +
      `calls ${called.name} (${called.conviction.toFixed(4)})`,
  );
  return { declined, called };
}

/** Type like a person: visible, unhurried, not a paste. */
async function typeInto(page, text) {
  // CLAUDE.md, "things that will bite you": the rotating suggestion sits over the
  // composer and is itself a button, so a click at the textarea's coordinates is
  // intercepted by it. Focus by label instead of clicking.
  const box = page.getByLabel(/^Message /);
  await box.focus();
  await box.type(text, { delay: 55 });
}

/**
 * Send, then wait for the answer.
 *
 * The send button's aria-label flips to "<name> is answering" while the turn runs
 * and back to "Send" when it finishes, so that is the signal — not a fixed sleep,
 * which would either clip a slow answer or sit on dead air after a fast one.
 */
async function sendAndWait(page, marks, label, t0) {
  await page.locator('[data-testid="chat-send"]').click();
  marks.push({ label: `${label}-sent`, at: (Date.now() - t0) / 1000 });
  await page
    .locator('[data-testid="chat-send"][aria-label="Send"]')
    .waitFor({ state: "visible", timeout: 120000 });
  marks.push({ label: `${label}-answered`, at: (Date.now() - t0) / 1000 });
}

const SHOTS = [
  {
    // The centrepiece. One take: open the workspace, put the trace on screen, ask
    // about the name the film has just proved it was right about, watch it refuse,
    // then ask about one it will call.
    name: "workspace-chat",
    route: "/workspace",
    shows: "the real chat: a live refusal on the 2022 name, then a real call",
    async act(page, ctx) {
      const { declined, called } = ctx.names;
      const marks = ctx.marks;
      const t0 = ctx.t0;

      await sleep(1200);
      // Agent tab first, so the trace panel is on screen while the tools fire —
      // that animation is the content of the beat, not a loading state.
      await page.locator('[data-testid="tab-agent"]').click();
      await sleep(1700);
      marks.push({ label: "agent-tab", at: (Date.now() - t0) / 1000 });

      await typeInto(page, `What's your call on ${declined.name} for tomorrow?`);
      await sleep(700);
      await sendAndWait(page, marks, "q1", t0);
      await sleep(13000); // beat 4.3 is 12.6 s of this refusal; the hold must outlast it

      await typeInto(page, `And ${called.name}?`);
      await sleep(600);
      await sendAndWait(page, marks, "q2", t0);
      await sleep(13000); // likewise beat 4.4
    },
  },
  {
    name: "workspace-tabs",
    route: "/workspace",
    shows: "the four panes — Signals, Evidence, Model card — beside the Copilot",
    async act(page) {
      await sleep(1200);
      for (const [id, dwell] of [
        ["tab-signals", 3800],
        ["tab-evidence", 3800],
        ["tab-model", 4200],
      ]) {
        await page.locator(`[data-testid="${id}"]`).click();
        await sleep(dwell);
      }
      await creep(page, 420, 2, 320);
      await sleep(1500);
    },
  },
  {
    name: "memory",
    route: "/memory",
    shows: "the vector store the assistant recalls from",
    async act(page) {
      await glide(page, [960, 300], [760, 430]);
      await sleep(2000);
      await creep(page, 520, 3, 340);
      await sleep(1900);
    },
  },
  {
    // The landing page is the best-designed screen in the app and was absent
    // from the first four cuts. Two shots: the hero statement, then the
    // Copilot panel and the basket deck below it.
    name: "landing-hero",
    route: "/",
    shows: "the landing hero — the product stating its own thesis",
    async act(page) {
      let p = [960, 300];
      await sleep(1300);
      p = await glide(page, p, [700, 430]);
      await sleep(1800);
      await glide(page, p, [700, 620]);
      await sleep(1600);
      await creep(page, 280, 2, 320);
      await sleep(1400);
    },
  },
  {
    name: "landing-deck",
    route: "/",
    shows: "the Copilot panel, its tool chips, and the basket of names",
    async act(page) {
      let p = [960, 300];
      await sleep(800);
      await creep(page, 900, 4, 300);
      p = await glide(page, p, [1250, 520]);
      await sleep(1700);
      await creep(page, 700, 3, 320);
      await glide(page, p, [860, 600]);
      await sleep(1700);
    },
  },
  {
    // The hero shot. Two names called at 61.2% confidence and two declined,
    // on one screen — the product's whole argument in a single frame.
    name: "watchlist",
    route: "/watchlist",
    shows: "4 tracked · 2 called at 61.2% · 2 abstained, side by side",
    async act(page) {
      let p = [960, 300];
      await sleep(1100);
      p = await glide(page, p, [380, 400]);
      await sleep(1600);
      p = await glide(page, p, [380, 560]);
      await sleep(1700);
      await glide(page, p, [1040, 480]);
      await sleep(1900);
      await creep(page, 420, 3, 300);
      await sleep(1200);
    },
  },
  {
    name: "dashboard",
    route: "/dashboard",
    shows: "the model card — 60.20%, 63.06%, accuracy by confidence, 55.50% holdout",
    async act(page) {
      let p = [960, 300];
      await sleep(1000);
      p = await glide(page, p, [430, 330]);
      await sleep(1500);
      p = await glide(page, p, [1060, 330]);
      await sleep(1500);
      await creep(page, 700, 3, 340);
      await glide(page, p, [700, 560]);
      await sleep(2000);
      await creep(page, 900, 4, 320);
      await sleep(1400);
    },
  },
  {
    name: "outbox",
    route: "/outbox",
    shows: "a delivered digest — nothing leaves without an approval",
    async act(page) {
      let p = [960, 260];
      await sleep(1100);
      p = await glide(page, p, [700, 300]);
      await sleep(1500);
      await glide(page, p, [700, 430]);
      await sleep(2200);
      await creep(page, 300, 2, 320);
      await sleep(1500);
    },
  },
];

async function main() {
  await preflight();
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(RAW_DIR, { recursive: true, force: true });

  const browser = await chromium.launch({
    args: [`--window-size=${W},${H}`, "--hide-scrollbars", "--force-device-scale-factor=1"],
  });

  await seed(browser);
  const names = await pickNames();

  const manifest = {};
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      recordVideo: { dir: RAW_DIR, size: { width: W, height: H } },
      colorScheme: "dark",
      reducedMotion: "no-preference",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${shot.route}`, { waitUntil: "networkidle", timeout: 60000 });

    // Refuse to record a page that rendered an error state.
    const bad = await page
      .locator("text=/service not answering|failed to load|something went wrong/i")
      .count();
    if (bad > 0) {
      await ctx.close();
      throw new Error(`${shot.route} rendered an error state — not recording it.`);
    }

    await page.addStyleTag({ content: "*{scrollbar-width:none !important}" }).catch(() => {});
    await page.evaluate(CURSOR).catch(() => {});
    await sleep(700);

    // `t0` is as close to the first recorded frame as this can get, so the marks
    // are offsets into the video rather than wall-clock times.
    const marks = [];
    const t0 = Date.now();
    await shot.act(page, { names, marks, t0 });
    await sleep(500);

    if (shot.name === "workspace-chat") {
      const steps = await page.locator('[data-testid="agent-section"] li').count();
      if (steps === 0) {
        await ctx.close();
        throw new Error(
          "the chat produced no trace steps — the agent answered without calling a " +
            "tool, or fell back to the mock. Not recording a demo of nothing.",
        );
      }
    }

    const video = page.video();
    await ctx.close();
    const raw = await video.path();
    const dest = join(VIDEO_DIR, `${shot.name}.webm`);
    if (existsSync(dest)) rmSync(dest);
    renameSync(raw, dest);
    manifest[shot.name] = { shows: shot.shows, route: shot.route, marks };
    if (marks.length > 0) {
      // The slice points for extract-capture-frames.mjs. Written to disk because
      // live answer latency varies from take to take, and guessing offsets is how
      // a beat ends up frozen on a loading spinner.
      writeFileSync(
        join(VIDEO_DIR, `${shot.name}.marks.json`),
        JSON.stringify(marks, null, 2),
        "utf8",
      );
      console.log(
        `  marks: ${marks.map((m) => `${m.label}@${m.at.toFixed(1)}s`).join("  ")}`,
      );
    }
    console.log(`recorded ${shot.name.padEnd(18)} ${shot.route}`);
  }

  await browser.close();
  rmSync(RAW_DIR, { recursive: true, force: true });
  console.log("\n" + JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error("capture failed:", e.message);
  process.exit(1);
});
