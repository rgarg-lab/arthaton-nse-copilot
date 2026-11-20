/**
 * Supervised render: run chunks, and restart any that stop making progress.
 *
 * The renderer on this machine hangs intermittently and unpredictably — not
 * slowly, but completely: Chromium and node alive, RAM/disk/CPU all idle, no
 * progress, no error, no timeout, and no correlation with what is on screen.
 * The same 300-frame range that hangs once will render in 80 seconds on the
 * next attempt. Five separate real causes were found and fixed before this
 * (BUILD_LOG D7.9, D7.11–D7.18); this is what remains after all of them.
 *
 * Rather than keep hunting a cause that does not reproduce, this supervises:
 * it watches the frame count, and if nothing new lands for `STALL_S` it kills
 * the render tree and retries the chunk. Frames already on disk are kept, so
 * every attempt makes forward progress and a hang costs `STALL_S`, not a
 * session.
 *
 * Deterministic output is unaffected: a frame is a pure function of its index,
 * so a retried frame is identical to a first-attempt one.
 *
 *   node scripts/render-supervised.mjs [chunkSize]
 */
import { bundle } from "@remotion/bundler";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "out");
const FRAMES = join(OUT, "frames");

const TOTAL = 10800;
const FPS = 60;
const CHUNK = Number(process.argv[2] ?? 300);
const CONCURRENCY = process.env.RENDER_CONCURRENCY ?? "2";
/** Kill and retry if no new frame lands for this long. */
const STALL_S = Number(process.env.STALL_S ?? 150);
/**
 * Hard cap on one attempt. The stall watchdog only catches a *full* stop, and
 * the failure mode here is often a crawl — frames trickling in just fast enough
 * to keep resetting the stall timer while throughput sits at a tenth of normal.
 * Since a fresh process is reliably fast, capping the attempt and restarting
 * converts a crawl into a burst. Partial frames are kept, so a restart resumes.
 */
const ATTEMPT_S = Number(process.env.ATTEMPT_S ?? 210);
const MAX_ATTEMPTS = 40;

/**
 * Intermediate JPEG quality. **Do not lower this below 95.**
 *
 * This was 90, and it was the cause of the judder in the first cut. At q90 the
 * quantiser is coarse enough that two *different* rendered frames compress to
 * byte-identical JPEGs whenever the motion between them is sub-pixel — which is
 * most of a slow camera move. Measured over frames 3600-3719:
 *
 *   png (lossless)  5/119 duplicate frames   4%   806 KB/frame
 *   jpeg q95        5/119 duplicate frames   4%   306 KB/frame
 *   jpeg q90       ~30/119 duplicate frames ~25%  219 KB/frame
 *
 * So a quarter of the motion was being destroyed before x264 ever ran, and the
 * result was a 60fps file carrying ~45fps of actual change, unevenly — which
 * reads as lag. q95 matches lossless exactly at 38% of the size. The encode was
 * never the problem: the shipped MP4 measured SSIM 0.9948 against its own
 * source frames.
 */
const JPEG_QUALITY = Number(process.env.JPEG_QUALITY ?? 95);

const DEST = join(OUT, "arthaton-submission.mp4");
const MIX = join(ROOT, "audio", "mix.wav");
/** NO_AUDIO=1 renders the picture only, for a voice-over added later by hand. */
const NO_AUDIO = process.env.NO_AUDIO === "1" || !existsSync(MIX);

const resolveFfmpeg = () => {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  for (const py of [
    "python",
    "py",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python312", "python.exe"),
  ]) {
    try {
      return execFileSync(py, ["-c", "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      /* next */
    }
  }
  throw new Error("set FFMPEG to the ffmpeg binary");
};

const ffmpeg = resolveFfmpeg();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

mkdirSync(FRAMES, { recursive: true });

/**
 * Remotion pads sequence filenames to the width of the largest frame index in
 * *that* render, so `--frames=0-299` writes `element-000.jpeg` while
 * `--frames=900-1199` writes `element-1199.jpeg`. Mixing chunk sizes therefore
 * produces a directory with several paddings in it, which silently broke both
 * the resume check (it never matched) and ffmpeg's `%d` pattern.
 *
 * Everything is normalised to a fixed 5-digit name after each attempt, and the
 * resume check only ever looks for that.
 */
const PAD = 5;
const framePath = (i) => join(FRAMES, `element-${String(i).padStart(PAD, "0")}.jpeg`);
const have = (i) => existsSync(framePath(i)) && statSync(framePath(i)).size > 2000;

const normaliseNames = () => {
  for (const f of readdirSync(FRAMES)) {
    const m = /^element-(\d+)\.jpeg$/.exec(f);
    if (!m) continue;
    const want = `element-${String(Number(m[1])).padStart(PAD, "0")}.jpeg`;
    if (f !== want) {
      try {
        renameSync(join(FRAMES, f), join(FRAMES, want));
      } catch {
        /* target already present */
      }
    }
  }
};
const countMissing = (a, b) => {
  let n = 0;
  for (let i = a; i <= b; i++) if (!have(i)) n++;
  return n;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reap every leftover headless Chromium.
 *
 * `taskkill /T` on the shell wrapper does not reliably reach the browsers
 * Remotion spawns, and they accumulate: ten of them were alive after a handful
 * of attempts at concurrency 2, each holding memory and GPU state, which is
 * what made every restart fast and every continuation slow. These are
 * Remotion's own bundled binary (`chrome-headless-shell`), not the user's
 * browser — Chrome and Edge run under different image names and are untouched.
 */
const reapRenderers = () => {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/IM", "chrome-headless-shell.exe", "/F", "/T"], {
        stdio: "ignore",
      });
    } else {
      execFileSync("pkill", ["-f", "chrome-headless-shell"], { stdio: "ignore" });
    }
  } catch {
    /* none running */
  }
};

/** Kill the whole process tree; a detached Chromium outlives its parent. */
const killTree = (pid) => {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    /* already gone */
  }
};

console.log("bundling once...");
const serveUrl = await bundle({
  entryPoint: join(ROOT, "src", "index.ts"),
  publicDir: join(ROOT, "public"),
  onProgress: () => undefined,
});
console.log("bundle ready\n");

/**
 * Frames on disk are only resumable if they were rendered at the quality this
 * run is asking for. Without this stamp the resume check sees 10,800 existing
 * files, skips every chunk, and re-encodes the old frames — so a quality fix
 * appears to work, takes thirty seconds, and changes nothing.
 */
const STAMP = join(FRAMES, ".jpeg-quality");
const stamped = existsSync(STAMP) ? readFileSync(STAMP, "utf8").trim() : null;
if (stamped !== String(JPEG_QUALITY)) {
  const stale = readdirSync(FRAMES).filter((f) => f.endsWith(".jpeg"));
  if (stale.length) {
    console.log(
      `frames on disk were rendered at quality ${stamped ?? "unknown"}, this run wants ` +
      `${JPEG_QUALITY} — discarding ${stale.length} stale frames`
    );
    for (const f of stale) rmSync(join(FRAMES, f), { force: true });
  }
  writeFileSync(STAMP, String(JPEG_QUALITY));
}

reapRenderers();
normaliseNames();
const t0 = Date.now();

/** One attempt at a chunk, with a no-progress watchdog. Resolves 'done' | 'stalled'. */
const attempt = (start, end) =>
  new Promise((resolve) => {
    // One quoted command string, not an argv array: `shell: true` does not
    // quote array args, and both the bundle path and the output path contain
    // a space on this machine — which silently produced a malformed command
    // and an instant no-op exit.
    const cmd =
      `${npx} remotion render "${serveUrl}" MainComposition "${FRAMES}" --sequence ` +
      `--image-format=jpeg --jpeg-quality=${JPEG_QUALITY} ` +
      `--frames=${start}-${end} --concurrency=${CONCURRENCY} --log=error`;
    const child = spawn(cmd, {
      cwd: ROOT,
      stdio: "ignore",
      shell: true,
      detached: process.platform !== "win32",
    });

    const started = Date.now();
    let lastCount = countMissing(start, end);
    let lastChange = Date.now();
    let settled = false;

    const finish = (how) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      resolve(how);
    };

    const timer = setInterval(() => {
      const missing = countMissing(start, end);
      if (missing !== lastCount) {
        lastCount = missing;
        lastChange = Date.now();
      }
      if (missing === 0) {
        killTree(child.pid);
        finish("done");
      } else if (Date.now() - lastChange > STALL_S * 1000) {
        killTree(child.pid);
        finish("stalled");
      } else if (Date.now() - started > ATTEMPT_S * 1000) {
        killTree(child.pid);
        finish("slow");
      }
    }, 5000);

    child.on("exit", () => {
      setTimeout(() => finish(countMissing(start, end) === 0 ? "done" : "stalled"), 1500);
    });
  });

for (let start = 0; start < TOTAL; start += CHUNK) {
  const end = Math.min(start + CHUNK - 1, TOTAL - 1);
  if (countMissing(start, end) === 0) {
    console.log(`skip  ${start}-${end}`);
    continue;
  }

  let attempts = 0;
  while (countMissing(start, end) > 0 && attempts < MAX_ATTEMPTS) {
    attempts++;
    const t = Date.now();
    const before = countMissing(start, end);
    const how = await attempt(start, end);
    reapRenderers();
    normaliseNames();
    const after = countMissing(start, end);
    const secs = ((Date.now() - t) / 1000).toFixed(0);
    console.log(
      `${how === "done" ? "done " : how === "slow" ? "slow " : "retry"} ` +
        `${start}-${end}  ${secs}s  ` +
        `(${before - after} frames, ${after} still missing, attempt ${attempts})`,
    );
    // A stalled attempt that produced nothing at all gets a moment before the
    // next try rather than spinning.
    if (how === "stalled" && before === after) await sleep(5000);
  }

  if (countMissing(start, end) > 0) {
    console.error(`giving up on ${start}-${end} after ${attempts} attempts`);
    process.exit(1);
  }
}

const rendered = readdirSync(FRAMES).filter((f) => f.endsWith(".jpeg")).length;
console.log(`\nall ${rendered} frames rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min; encoding`);

execFileSync(
  ffmpeg,
  [
    "-v", "error", "-y",
    "-framerate", String(FPS),
    "-start_number", "0",
    "-i", join(FRAMES, `element-%0${PAD}d.jpeg`),
    ...(NO_AUDIO ? [] : ["-i", MIX]),
    // crf 16 rather than 18: now that the source frames actually carry the
    // per-frame motion, it is worth not re-quantising it away. On this content
    // that is a few MB, not a doubling.
    "-c:v", "libx264", "-preset", "slow", "-crf", "16",
    // Animation tuning: deblocking is backed off, which is what preserves hard
    // type edges and flat gradients on a graphics render rather than smearing
    // them the way the photographic defaults do.
    "-tune", "animation",
    "-pix_fmt", "yuv420p",
    ...(NO_AUDIO
      ? ["-an"]
      : ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest"]),
    "-movflags", "+faststart",
    DEST,
  ],
  { stdio: "inherit" },
);

console.log(
  `\n${DEST}\n  ${(statSync(DEST).size / 1e6).toFixed(1)} MB  ` +
    `in ${((Date.now() - t0) / 60000).toFixed(1)} min total`,
);
