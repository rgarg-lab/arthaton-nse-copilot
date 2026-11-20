/**
 * Stage 5 — record the real app.
 *
 * Drives the running application with Playwright and records genuine browser
 * video of it. Nothing here reconstructs or approximates the UI: every frame is
 * the real Next.js app talking to the real FastAPI model service, and the script
 * fails loudly rather than producing a recording if either is down.
 *
 * Two deliberate additions to the recording, both cosmetic and both logged:
 *   - a drawn cursor dot, because Playwright's video does not capture the real
 *     pointer and the reference keeps a visible cursor throughout
 *   - `scrollbar-width: none`, so a scrollbar does not flicker through the cut
 *
 * Neither adds, hides or alters a figure. Run with the stack up:
 *   npm start           (root, :3000)
 *   python ml/tasks.py serve   (:8000)
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(HERE, "..", "public", "captures");
const RAW_DIR = join(HERE, "..", ".capture-raw");

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3000";
const W = 1920;
const H = 1080;

/** A visible pointer, since Playwright video does not record the real one. */
const CURSOR = `
  (() => {
    const d = document.createElement('div');
    d.id = '__cap_cursor';
    d.style.cssText = [
      'position:fixed','z-index:2147483647','width:22px','height:22px',
      'margin:-11px 0 0 -11px','border-radius:50%','pointer-events:none',
      'background:rgba(23,40,98,0.22)','border:2px solid rgba(23,40,98,0.75)',
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
async function glide(page, from, to, steps = 26) {
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

async function preflight() {
  const checks = [
    [`${BASE}/signals`, "the Next.js app (npm start)"],
    ["http://127.0.0.1:8000/health", "the ML service (python ml/tasks.py serve)"],
  ];
  for (const [url, what] of checks) {
    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) {
      throw new Error(
        `${what} is not answering at ${url}. ` +
          `Refusing to record: a capture of an error state is not a capture of the app.`,
      );
    }
  }
}

/**
 * One recording per shot. Each gets its own context so the video file maps
 * one-to-one onto a `<Capture name=...>` in the edit.
 */
const SHOTS = [
  {
    name: "signals-board",
    route: "/signals",
    shows: "the signals board, scrolled through the committed panel",
    seconds: 9,
    async act(page) {
      let p = [960, 300];
      await sleep(900);
      p = await glide(page, p, [960, 620]);
      await page.mouse.wheel(0, 420);
      await sleep(900);
      await page.mouse.wheel(0, 420);
      await sleep(900);
      await glide(page, p, [700, 500]);
      await sleep(700);
      await page.mouse.wheel(0, 380);
      await sleep(1200);
    },
  },
  {
    name: "signals-tiles",
    route: "/signals",
    shows: "the calls-today and abstentions tiles at the top of the board",
    seconds: 8,
    async act(page) {
      let p = [500, 260];
      await sleep(800);
      p = await glide(page, p, [420, 380]);
      await sleep(900);
      p = await glide(page, p, [900, 380]);
      await sleep(900);
      await glide(page, p, [1300, 380]);
      await sleep(1600);
    },
  },
  {
    name: "signals-threshold",
    route: "/signals",
    shows: "the frozen-threshold chip and conviction readout on a card",
    seconds: 8,
    async act(page) {
      let p = [960, 300];
      await page.mouse.wheel(0, 500);
      await sleep(900);
      p = await glide(page, p, [760, 560]);
      await sleep(1400);
      await glide(page, p, [1100, 620]);
      await sleep(1800);
    },
  },
  {
    name: "abstention-card",
    route: "/signals",
    shows: "a single abstention card and the model's stated reason",
    seconds: 8,
    async act(page) {
      let p = [960, 400];
      await page.mouse.wheel(0, 650);
      await sleep(1000);
      p = await glide(page, p, [700, 520]);
      await sleep(2200);
      await glide(page, p, [980, 640]);
      await sleep(1600);
    },
  },
  {
    // The Next app has no signals route of its own — it calls the model service
    // server-side. This records that service directly, which is the stronger
    // shot anyway: the raw payload, with no `direction` key in it at all.
    name: "abstention-payload",
    absolute: "http://127.0.0.1:8000/signals/RELIANCE.NS",
    route: "ML service /signals/{ticker}",
    shows: "the raw API payload for an abstaining name — no `direction` key",
    seconds: 9,
    async act(page) {
      await sleep(1200);
      await page.mouse.wheel(0, 300);
      await sleep(1400);
      await page.mouse.wheel(0, 300);
      await sleep(1400);
      await page.mouse.wheel(0, 300);
      await sleep(1600);
    },
  },
  {
    name: "evidence",
    route: "/evidence",
    shows: "the closest historical sessions with real dates and real returns",
    seconds: 15,
    async act(page) {
      let p = [960, 300];
      await sleep(1200);
      p = await glide(page, p, [860, 520]);
      await sleep(1000);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 360);
        await sleep(1300);
      }
      await glide(page, p, [1200, 600]);
      await sleep(1800);
    },
  },
  {
    name: "dashboard",
    route: "/dashboard",
    shows: "the model card: baselines, calibration curve, coverage curve",
    seconds: 12,
    async act(page) {
      let p = [960, 300];
      await sleep(1000);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 400);
        await sleep(1200);
      }
      await glide(page, p, [900, 560]);
      await sleep(1200);
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

  const manifest = {};
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      recordVideo: { dir: RAW_DIR, size: { width: W, height: H } },
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    const page = await ctx.newPage();
    const url = shot.absolute ?? `${BASE}${shot.route}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.addStyleTag({ content: "*{scrollbar-width:none !important}" }).catch(() => {});
    await page.evaluate(CURSOR).catch(() => {});
    await sleep(600);

    await shot.act(page);
    await sleep(400);

    const video = page.video();
    await ctx.close();
    const raw = await video.path();
    const dest = join(VIDEO_DIR, `${shot.name}.webm`);
    if (existsSync(dest)) rmSync(dest);
    renameSync(raw, dest);
    manifest[shot.name] = {
      file: `captures/${shot.name}.webm`,
      shows: shot.shows,
      route: shot.route,
    };
    console.log(`recorded ${shot.name}  (${shot.route})`);
  }

  await browser.close();
  rmSync(RAW_DIR, { recursive: true, force: true });
  console.log("\nMANIFEST\n" + JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error("capture failed:", e.message);
  process.exit(1);
});
