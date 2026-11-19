/**
 * Render public/walkthrough.html to a video file, offline and frame-exact.
 *
 * ## Why not just screen-record it
 *
 * A screen recorder races the compositor. When it cannot keep up it drops
 * frames and pads them back as duplicates, which is exactly the judder in a
 * typical capture — and it has to encode live, so the bitrate is whatever fits
 * in the time available (the first attempt at this came out at ~930 kbps for
 * 1080p60, roughly a tenth of what that format needs).
 *
 * Here nothing races anything. `?render=1` pauses every CSS transition and
 * animation on the page and exposes `window.__deck`, so this script sets an
 * exact timestamp, screenshots, and repeats. Capture can take as long as it
 * likes; the output is identical either way.
 *
 * ## Why it is not 6,000 screenshots
 *
 * The deck is ~204s long but only ~1.6s of each scene is actually moving. Only
 * motion frames are captured; the still hold after each one is the same frame
 * written to the encoder N times. Costs nothing, and VP8 collapses the
 * identical frames into near-zero bits.
 *
 *   node scripts/render-walkthrough.mjs [--fps 30] [--scale 1] [--out <path>]
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const FPS = Number(flag("fps", 30));
const SCALE = Number(flag("scale", 1));
const WIDTH = Math.round(1920 * SCALE);
const HEIGHT = Math.round(1080 * SCALE);
const OUT = resolve(flag("out", "dist/walkthrough.webm"));
const PAGE = resolve("public/walkthrough.html");

// Playwright ships its own ffmpeg. It is a deliberately stripped build — JPEG in
// via image2pipe, VP8 out via libvpx, webm muxer, and nothing else. That is
// enough to encode, and it means there is no external dependency to install.
const FFMPEG = (() => {
  const base = process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}/ms-playwright`
    : `${process.env.HOME}/.cache/ms-playwright`;
  for (const name of ["ffmpeg-win64.exe", "ffmpeg-linux", "ffmpeg-mac"]) {
    for (const v of ["ffmpeg-1011", "ffmpeg-1010", "ffmpeg-1009"]) {
      const p = resolve(base, v, name);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`No bundled ffmpeg under ${base}. Run: npx playwright install`);
})();

mkdirSync(dirname(OUT), { recursive: true });

console.log(`render  ${WIDTH}x${HEIGHT} @ ${FPS}fps  ->  ${OUT}`);
console.log(`ffmpeg  ${FFMPEG}\n`);

const ff = spawn(FFMPEG, [
  "-y",
  "-f", "image2pipe",
  // The input codec must be named. This ffmpeg is built with --disable-everything
  // and has no image2 probe, so without it the stream is read as
  // "Video: none, none: unknown codec" and the output gets no stream at all.
  "-c:v", "mjpeg",
  "-framerate", String(FPS),
  "-i", "pipe:0",
  "-c:v", "libvpx",
  // Quality, not realtime. -b:v is a target; -crf with -qmin/-qmax lets VP8 spend
  // bits where the gradients are and almost none on the long still holds.
  "-b:v", "12M",
  "-crf", "8",
  "-qmin", "0",
  "-qmax", "24",
  "-g", String(FPS * 4),
  "-threads", "8",
  // VP8 cpu-used. 0 is best-quality but runs well under 1x on 1080p and would
  // take over an hour here; 2 is visually indistinguishable on flat UI frames.
  "-speed", "2",
  "-pix_fmt", "yuv420p",
  "-f", "webm",
  OUT,
]);

let ffErr = "";
let ffDead = null;
ff.stderr.on("data", (d) => { ffErr += d.toString(); });
ff.on("error", (e) => { console.error("ffmpeg failed to start:", e.message); process.exit(1); });
// Without this, an encoder that dies on frame 1 is not noticed until the capture
// loop finishes — thousands of frames written into a closed pipe.
ff.on("close", (code) => { if (code !== 0) ffDead = code; });
ff.stdin.on("error", () => { ffDead = ffDead ?? -1; });

const write = (buf) => {
  if (ffDead !== null) {
    console.error(`\nffmpeg exited (${ffDead}):\n${ffErr.split("\n").slice(-20).join("\n")}`);
    process.exit(1);
  }
  // Only a "drain" listener, and only when the pipe is actually full. Attaching
  // a one-shot "error" handler per write leaks one listener per frame — six
  // thousand of them over a full render, plus a MaxListeners warning. Errors are
  // handled once, on the stream, above.
  return new Promise((ok) => {
    if (ff.stdin.write(buf)) return ok();
    ff.stdin.once("drain", ok);
  });
};

const browser = await chromium.launch({
  args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});

page.on("pageerror", (e) => console.error("page error:", e.message));

await page.goto(`${pathToFileURL(PAGE).href}?render=1`);
// The deck must be fully typeset before the first frame; a font swap landing
// mid-render would be baked into the file permanently.
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => Boolean(window.__deck));
await page.evaluate(() => window.__deck.begin());

const { count, durations } = await page.evaluate(() => ({
  count: window.__deck.count,
  durations: window.__deck.durations,
}));

const shot = () => page.screenshot({ type: "jpeg", quality: 95, animations: "allow" });

const frameMs = 1000 / FPS;
let written = 0;
let unique = 0;
let globalMs = 0;
const started = Date.now();

for (let i = 0; i < count; i += 1) {
  const motion = await page.evaluate((n) => window.__deck.cue(n), i);
  const hold = Math.max(0, durations[i] - motion);

  // Motion: one true sample per frame boundary.
  let last = null;
  for (let t = 0; t <= motion; t += frameMs) {
    await page.evaluate(([a, b]) => window.__deck.seek(a, b), [t, globalMs + t]);
    last = await shot();
    await write(last);
    written += 1;
    unique += 1;
  }

  // Hold: the scene is at rest, so re-send the same frame. The floor keeps
  // drifting under it, so re-sample that at a low rate rather than freezing it.
  const holdFrames = Math.round(hold / frameMs);
  const resampleEvery = Math.max(1, Math.round(FPS / 10)); // ~10 real samples/s
  for (let f = 0; f < holdFrames; f += 1) {
    if (f % resampleEvery === 0) {
      await page.evaluate(([a, b]) => window.__deck.seek(a, b), [motion, globalMs + motion + f * frameMs]);
      last = await shot();
      unique += 1;
    }
    await write(last);
    written += 1;
  }

  globalMs += durations[i];
  const secs = (Date.now() - started) / 1000;
  process.stdout.write(
    `  scene ${String(i + 1).padStart(2)}/${count}  motion ${String(motion).padStart(4)}ms  ` +
    `frames ${String(written).padStart(5)}  unique ${String(unique).padStart(5)}  ${secs.toFixed(0)}s\n`
  );
}

await browser.close();
ff.stdin.end();

const code = await new Promise((ok) => ff.on("close", ok));
if (code !== 0) {
  console.error(ffErr.split("\n").slice(-25).join("\n"));
  process.exit(code);
}

const bytes = statSync(OUT).size;
const seconds = written / FPS;
console.log(
  `\ndone  ${OUT}\n` +
  `      ${(bytes / 1e6).toFixed(1)} MB · ${seconds.toFixed(1)}s · ${written} frames ` +
  `(${unique} rendered) · ${((bytes * 8) / seconds / 1e6).toFixed(1)} Mbps`
);
