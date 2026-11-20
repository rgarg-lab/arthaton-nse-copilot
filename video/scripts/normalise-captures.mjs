/**
 * Playwright writes VFR webm. Remotion's `<OffthreadVideo>` wants a container it
 * can seek to an exact frame in, so each recording is re-encoded to constant
 * 60 fps h264 at 1920x1080 here.
 *
 * This is a container/rate conversion only — no cropping, no colour correction,
 * no retiming of the content. The pixels are the ones the browser drew.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "public", "captures");

/**
 * ffmpeg comes from the `imageio-ffmpeg` wheel the Stage 0 analysis already
 * installed, so nothing is installed system-wide. `python` is not always on
 * node's PATH on Windows, so the interpreter is resolved before it is used and
 * `FFMPEG` can override the whole lookup.
 */
const resolveFfmpeg = () => {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const candidates = [
    "python",
    "py",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Python312", "python.exe"),
  ];
  for (const py of candidates) {
    try {
      return execFileSync(py, ["-c", "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      /* try the next interpreter */
    }
  }
  throw new Error(
    "could not locate ffmpeg via imageio-ffmpeg. Set FFMPEG to the binary path.",
  );
};

const ffmpeg = resolveFfmpeg();

/**
 * `ffmpeg -i <file>` with no output always exits non-zero — it prints the
 * stream banner to stderr and then complains that no output was given. That is
 * the intended way to probe with this binary (it ships no ffprobe), so the
 * non-zero exit is expected and the banner is read off the error.
 */
const probeBanner = (file) => {
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (e) {
    return String(e.stderr ?? "");
  }
};

const webms = readdirSync(DIR).filter((f) => f.endsWith(".webm"));
if (webms.length === 0) throw new Error("no .webm captures found; run capture.mjs");

const report = [];
for (const w of webms) {
  const src = join(DIR, w);
  const dest = src.replace(/\.webm$/, ".mp4");
  execFileSync(
    ffmpeg,
    [
      "-v", "error", "-y",
      "-i", src,
      // Constant 60fps, exact 1920x1080, padded rather than cropped so nothing
      // the browser rendered is cut out of frame.
      "-vf", "fps=60,scale=1920:1080:force_original_aspect_ratio=decrease," +
             "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0A0A0A",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      // All-intra: every frame is a keyframe.
      //
      // `<OffthreadVideo>` seeks the source once per rendered frame. With the
      // default ~4 s GOP each seek decoded forward from the previous keyframe
      // and the capture beats rendered at ~11 frames/min against ~600
      // elsewhere. A 12-frame GOP helped and was not enough — one chunk of
      // capture content still took 50 minutes. With `-g 1` a seek decodes
      // exactly one frame, which is the only version of this that is O(1).
      //
      // The cost is file size (17 MB -> 49 MB at -g 12 -> ~200 MB here) and
      // Remotion copies `public/` once per chunk. That trade is worth it: the
      // copy is seconds, the seeking was hours.
      // NOTE: `-g 1` (all-intra) was tried and reverted — see BUILD_LOG D7.14.
      // It bought ~10% on the capture beats and cost 49 MB -> 315 MB, which
      // Remotion then copies into every chunk's bundle. The copies ended up
      // dominating. 12 is the setting that actually won (D7.9).
      "-g", "12", "-keyint_min", "12", "-sc_threshold", "0",
      "-tune", "fastdecode",
      "-pix_fmt", "yuv420p", "-an",
      dest,
    ],
    { stdio: "inherit" },
  );
  const sizeMB = (statSync(dest).size / 1e6).toFixed(2);
  const dur = /Duration: (\d+:\d+:[\d.]+)/.exec(probeBanner(dest))?.[1] ?? "?";
  report.push({ name: w.replace(/\.webm$/, ""), dur, sizeMB });
  console.log(`${w} -> ${dest.split(/[\\/]/).pop()}  ${dur}  ${sizeMB} MB`);
}

writeFileSync(
  join(DIR, "captures.report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), fps: 60, report }, null, 2),
);
