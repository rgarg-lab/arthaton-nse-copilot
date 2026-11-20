/**
 * Explode each screen recording into numbered JPEGs.
 *
 * `<OffthreadVideo>` could not be made reliable on this machine: after a few
 * hundred frames of capture content the renderer would block — Chromium and
 * node processes alive, memory fine, CPU idle, no progress and no error. Three
 * different output modes hit it (BUILD_LOG D7.16).
 *
 * Frames on disk remove the decoder from the render path entirely: the capture
 * beats become `<Img>`, which is the most boring, most reliable thing Remotion
 * can draw. The pixels are identical — these are the same recordings, just
 * demuxed ahead of time instead of seeked during the render.
 *
 * Only the span each beat actually uses is extracted, so this costs a few
 * hundred MB rather than exploding all seven recordings in full.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "captures", "originals");
const DEST = join(ROOT, "public", "frames");

const FPS = 60;

/**
 * name -> { startFrom (s), seconds needed } — mirrors Main.tsx's beats.
 *
 * `startFrom` must leave at least `seconds` of source behind it. The first run
 * of this script asked `signals-threshold` for 6.2 s starting at 8 s from a
 * 9.5 s recording and silently produced 89 frames instead of 372, which would
 * have frozen most of that beat. The assertion below now refuses to do that
 * quietly.
 */
const NEEDED = {
  "signals-board": { startFrom: 0, seconds: 7.2 },
  "signals-tiles": { startFrom: 4, seconds: 7.2 },
  "signals-threshold": { startFrom: 3, seconds: 6.2 },
  "abstention-card": { startFrom: 0, seconds: 6.2 },
  // The payload recording is 7.63 s and beat 4.6 is 8 s. Rather than re-record
  // or restretch real footage, the last frame is held for the remaining ~0.4 s
  // — the shot is a static JSON response being scrolled, so a third of a second
  // on the final frame is not visible. Declared, not silent.
  "abstention-payload": { startFrom: 0, seconds: 8.2, allowTailHold: true },
  evidence: { startFrom: 0, seconds: 14.2 },
};

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
mkdirSync(DEST, { recursive: true });

const manifest = {};
for (const [name, { startFrom, seconds, allowTailHold }] of Object.entries(NEEDED)) {
  const src = join(SRC, `${name}.mp4`);
  if (!existsSync(src)) throw new Error(`missing capture ${src}`);
  const dir = join(DEST, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  execFileSync(
    ffmpeg,
    [
      "-v", "error", "-y",
      "-ss", String(startFrom),
      "-i", src,
      "-t", String(seconds),
      "-vf", `fps=${FPS}`,
      "-q:v", "7",
      "-start_number", "0",
      join(dir, "f-%04d.jpg"),
    ],
    { stdio: "inherit" },
  );

  const count = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
  const want = Math.floor(seconds * FPS);
  manifest[name] = count;
  console.log(
    `${name}: ${count} frames` + (count < want ? `  SHORT (wanted ${want})` : ""),
  );
  // A short extraction means the beat would freeze on its last frame. Allow a
  // few frames of slack for rounding, but never a silent shortfall.
  if (count < want - 6 && !allowTailHold) {
    throw new Error(
      `${name}: extracted ${count} frames but the beat needs ${want}. ` +
        `startFrom=${startFrom}s leaves too little of the recording — ` +
        `lower it or re-record a longer take.`,
    );
  }
}

console.log("\n" + JSON.stringify(manifest, null, 2));
