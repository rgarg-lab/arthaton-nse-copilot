/**
 * Render the submission as an image sequence, then encode once with ffmpeg.
 *
 * Why not `remotion render` straight to MP4 — three separate things went wrong
 * on this machine, in this order (BUILD_LOG D7.9, D7.11–D7.15):
 *
 *   1. sparse keyframes in the captures made `<OffthreadVideo>` seeks decode
 *      seconds of video per frame;
 *   2. six concurrent Chromium tabs exhausted 16 GB and the machine swapped;
 *   3. and finally, with rendering healthy, Remotion's **encode** step would
 *      sit for half an hour after reporting `Rendered 600/600`.
 *
 * (3) is what this script is shaped around. Rendering to JPEGs takes the
 * encoder out of the render loop entirely: frames land on disk one by one, so
 * progress is directly observable, a stall is unambiguous, and a resume costs
 * only the frames that are actually missing. ffmpeg then encodes all 10,800
 * frames in a single pass, which it does in a couple of minutes.
 *
 * The audio is muxed from `public/audio/mix.wav` untouched, so what ships is
 * bit-for-bit the mix that `build_audio.py` measured against the reference.
 *
 *   node scripts/render-chunked.mjs [chunkSize]
 */
import { bundle } from "@remotion/bundler";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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
const DEST = join(OUT, "arthaton-submission.mp4");
const MIX = join(ROOT, "audio", "mix.wav");

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

const framePath = (i) => join(FRAMES, `element-${i}.jpeg`);
const have = (i) => existsSync(framePath(i)) && statSync(framePath(i)).size > 2000;

const t0 = Date.now();

// Bundle ONCE. `npx remotion render` otherwise re-bundles and re-copies
// `public/` (284 MB) on every invocation, which with chunks small enough to
// stay fast would cost more than the rendering. Each chunk below renders
// against this prebuilt serve directory instead.
console.log("bundling once...");
const serveUrl = await bundle({
  entryPoint: join(ROOT, "src", "index.ts"),
  publicDir: join(ROOT, "public"),
  onProgress: () => undefined,
});
console.log(`bundle ready
`);
for (let start = 0; start < TOTAL; start += CHUNK) {
  const end = Math.min(start + CHUNK - 1, TOTAL - 1);

  // Resume at frame granularity: only render a chunk if something in it is
  // actually missing, and report how much.
  let missing = 0;
  for (let i = start; i <= end; i++) if (!have(i)) missing++;
  if (missing === 0) {
    console.log(`skip  ${start}-${end} (complete)`);
    continue;
  }

  const t = Date.now();
  execSync(
    `${npx} remotion render "${serveUrl}" MainComposition "${FRAMES}" --sequence ` +
      `--image-format=jpeg --jpeg-quality=90 ` +
      `--frames=${start}-${end} --concurrency=${CONCURRENCY} ` +
      `--offthreadvideo-cache-size-in-bytes=${64 * 1024 * 1024} ` +
      `--log=error`,
    { cwd: ROOT, stdio: "inherit" },
  );
  const secs = (Date.now() - t) / 1000;
  console.log(
    `done  ${start}-${end}  ${secs.toFixed(0)}s  ` +
      `(${((end - start + 1) / (secs / 60)).toFixed(0)} frames/min, ` +
      `${missing} were missing)`,
  );

}

const rendered = readdirSync(FRAMES).filter((f) => f.endsWith(".jpeg")).length;
if (rendered < TOTAL) {
  console.error(
    `\nonly ${rendered}/${TOTAL} frames on disk — re-run to fill the gaps ` +
      `before encoding`,
  );
  process.exit(1);
}
console.log(`\nall ${rendered} frames rendered; encoding`);

// One encode pass over the whole sequence, plus the measured mix.
execFileSync(
  ffmpeg,
  [
    "-v", "error", "-y",
    "-framerate", String(FPS),
    "-start_number", "0",
    "-i", join(FRAMES, "element-%d.jpeg"),
    "-i", MIX,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-shortest",
    "-movflags", "+faststart",
    DEST,
  ],
  { stdio: "inherit" },
);

console.log(
  `\n${DEST}\n  ${(statSync(DEST).size / 1e6).toFixed(1)} MB  ` +
    `in ${((Date.now() - t0) / 60000).toFixed(1)} min`,
);
