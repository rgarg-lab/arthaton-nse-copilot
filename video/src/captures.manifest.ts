/**
 * Which real screen recordings exist, and what each one shows.
 *
 * Every entry is a genuine Playwright recording of the running application —
 * the real Next.js app talking to the real FastAPI model service — made by
 * `scripts/capture.mjs`, which refuses to record at all if either service is
 * down. Nothing here is a reconstruction or a mockup.
 *
 * `frames` is the count produced by `scripts/extract-capture-frames.mjs`, which
 * demuxes each recording to numbered JPEGs under `public/frames/<name>/`. The
 * render draws those with `<Img>` rather than decoding video, because
 * `<OffthreadVideo>` blocked the renderer indefinitely on this machine
 * (BUILD_LOG D7.16). Same pixels, different delivery.
 *
 * Two cosmetic additions were made to the recordings themselves, both disclosed
 * in `BUILD_LOG.md` D5.3: a drawn cursor dot (Playwright's video does not
 * capture the real pointer) and hidden scrollbars. Neither adds, hides or
 * alters a figure.
 *
 * An absent key makes `<Capture>` render an explicit PENDING CAPTURE card.
 */
export type CaptureEntry = {
  /** Directory under `public/frames/`, served through `staticFile()`. */
  frames: number;
  /** The recording these frames came from. */
  source: string;
  /** What the recording shows, so the manifest stays self-describing. */
  shows: string;
  /** The route it was recorded on. */
  route: string;
};

export const captureManifest: Record<string, CaptureEntry> = {
  "signals-board": {
    frames: 432,
    source: "captures/signals-board.mp4",
    shows: "the signals board, scrolled through the committed panel",
    route: "/signals",
  },
  "signals-tiles": {
    frames: 432,
    source: "captures/signals-tiles.mp4",
    shows: "the calls-today and abstentions tiles at the top of the board",
    route: "/signals",
  },
  "signals-threshold": {
    frames: 372,
    source: "captures/signals-threshold.mp4",
    shows: "the frozen-threshold chip and conviction readout on a card",
    route: "/signals",
  },
  "abstention-card": {
    frames: 372,
    source: "captures/abstention-card.mp4",
    shows: "a single abstention card and the model's stated reason",
    route: "/signals",
  },
  "abstention-payload": {
    frames: 458,
    source: "captures/abstention-payload.mp4",
    shows: "the raw API payload for an abstaining name — no `direction` key",
    route: "ML service /signals/{ticker}",
  },
  evidence: {
    frames: 852,
    source: "captures/evidence.mp4",
    shows: "the closest historical sessions with real dates and real returns",
    route: "/evidence",
  },
};
