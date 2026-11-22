/**
 * Which real screen recordings exist, and what each one shows.
 *
 * Every entry is a genuine Playwright recording of the running application —
 * the real Next.js app talking to the real FastAPI model service — made by
 * `scripts/capture.mjs`, which refuses to record if either service is down and
 * also refuses to record a page that rendered an error state.
 *
 * `/watchlist` and `/outbox` hold the *user's* state rather than the model's,
 * so they start empty. The capture script seeds them the way a user would —
 * adds four names, queues a digest, delivers it — then records. Every figure
 * that appears is still computed by the app from the committed artifacts.
 *
 * `frames` is the count produced by `scripts/extract-capture-frames.mjs`, which
 * demuxes each recording to numbered JPEGs under `public/frames/<name>/`. The
 * render draws those with `<Img>` rather than decoding video, because
 * `<OffthreadVideo>` blocked the renderer on this machine (BUILD_LOG D7.16).
 * Same pixels, different delivery.
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
  // v6 — four slices of one continuous recording of a single real conversation.
  // Separate takes would have meant three first messages in an empty thread.
  "ws-open": {
    frames: 516,
    source: "captures/originals/workspace-chat.mp4",
    shows: "/workspace — the Copilot, its trace panel, and the four panes",
    route: "/workspace",
  },
  "ws-ask": {
    frames: 815,
    source: "captures/originals/workspace-chat.mp4",
    shows: "a real question typed, and the tools firing one at a time",
    route: "/workspace",
  },
  "ws-refusal": {
    frames: 756,
    source: "captures/originals/workspace-chat.mp4",
    shows: "the name it was right about in 2022, declined today",
    route: "/workspace",
  },
  "ws-call": {
    frames: 696,
    source: "captures/originals/workspace-chat.mp4",
    shows: "a name that clears the gate, answered with its number",
    route: "/workspace",
  },
  "workspace-tabs": {
    frames: 996,
    source: "captures/originals/workspace-tabs.mp4",
    shows: "Signals, Evidence and the model card, beside the Copilot",
    route: "/workspace",
  },
  memory: {
    frames: 396,
    source: "captures/originals/memory.mp4",
    shows: "the vector store the assistant recalls from",
    route: "/memory",
  },
  "landing-hero": {
    frames: 456,
    source: "captures/originals/landing-hero.mp4",
    shows: "the landing hero — the product stating its own thesis, Copilot panel live",
    route: "/",
  },
  "landing-deck": {
    frames: 456,
    source: "captures/originals/landing-deck.mp4",
    shows: "the 18-name deck in perspective — one question each",
    route: "/",
  },
  watchlist: {
    frames: 456,
    source: "captures/originals/watchlist.mp4",
    shows: "4 tracked · 2 called at 61.2% · 2 abstained, on one screen",
    route: "/watchlist",
  },
  dashboard: {
    frames: 516,
    source: "captures/originals/dashboard.mp4",
    shows: "the model card — 60.20%, 63.06%, accuracy by confidence, 55.50% holdout",
    route: "/dashboard",
  },
  outbox: {
    frames: 456,
    source: "captures/originals/outbox.mp4",
    shows: "a delivered digest — nothing leaves without an approval",
    route: "/outbox",
  },
};
