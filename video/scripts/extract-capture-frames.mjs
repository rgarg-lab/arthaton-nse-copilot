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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  // v6 — beats 4.1-4.4 are four windows onto ONE recording of one conversation.
  // `from` names a mark written by capture.mjs during the take; `offset` nudges
  // relative to it. Offsets are measured rather than guessed because live answer
  // latency varies by ten seconds or more between takes, and a guessed offset is
  // how a beat ends up frozen on a spinner.
  "ws-open":        { source: "workspace-chat", startFrom: 0.4, seconds: 8.6 },
  "ws-ask":         { source: "workspace-chat", from: "q1-sent",     offset: -3.0, seconds: 13.6 },
  "ws-refusal":     { source: "workspace-chat", from: "q1-answered", offset: -1.0, seconds: 12.6 },
  "ws-call":        { source: "workspace-chat", from: "q2-answered", offset: -1.5, seconds: 11.6 },
  "workspace-tabs": { startFrom: 0.8, seconds: 16.6 },
  memory:           { startFrom: 0.8, seconds: 6.6 },

  "landing-hero":   { startFrom: 3.2, seconds: 7.6 },
  "landing-deck":   { startFrom: 5.2, seconds: 7.6 },
  watchlist:        { startFrom: 0, seconds: 7.6 },
  dashboard:        { startFrom: 0, seconds: 8.6 },
  outbox:           { startFrom: 0, seconds: 7.6 },
};

/** Resolve a `from`/`offset` pair against the marks written during the take. */
const resolveStart = (name, spec) => {
  if (spec.from === undefined) return spec.startFrom ?? 0;
  const src = spec.source ?? name;
  const marksPath = join(SRC, `${src}.marks.json`);
  if (!existsSync(marksPath)) {
    throw new Error(
      `${name} slices ${src} at mark "${spec.from}" but ${src}.marks.json is missing — ` +
        `re-run scripts/capture.mjs, which writes it.`,
    );
  }
  const marks = JSON.parse(readFileSync(marksPath, "utf8"));
  const hit = marks.find((m) => m.label === spec.from);
  if (!hit) {
    throw new Error(
      `${name}: no mark "${spec.from}" in ${src}.marks.json (have: ` +
        `${marks.map((m) => m.label).join(", ")})`,
    );
  }
  return Math.max(0, hit.at + (spec.offset ?? 0));
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
for (const [name, spec] of Object.entries(NEEDED)) {
  const { seconds, allowTailHold } = spec;
  const startFrom = resolveStart(name, spec);
  const src = join(SRC, `${spec.source ?? name}.mp4`);
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
        `startFrom=${startFrom.toFixed(1)}s leaves too little of the recording — ` +
        `lower it or re-record a longer take.`,
    );
  }
}

console.log("\n" + JSON.stringify(manifest, null, 2));
