/**
 * The single source of colour, type and motion for every scene.
 *
 * Every value here traces to `video/STYLE_SPEC.md`, which in turn traces to a
 * measurement of the reference in `video/analysis/`. No scene file may contain a
 * literal hex value, a font name or a raw duration — `src/honesty.test.ts`
 * enforces the first two, and `timing` below exists so the third is not tempting.
 */

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_S = 180;
export const DURATION_FRAMES = DURATION_S * FPS;

/** Seconds to frames. Scene boundaries in SCRIPT.md are written in seconds. */
export const sec = (s: number) => Math.round(s * FPS);

/**
 * Measured palette — `analysis/palette.json`, k-means over 129 frames pooled by
 * coverage, refined to exact centroids. Coverage weights are in STYLE_SPEC.md §3.
 */
export const color = {
  /** #F5F5F5, 94.5 coverage weight — the dominant surface by a wide margin. */
  bg: "#F5F5F5",
  /** #EFEEEC, 46.5 — the warm off-white used for full-bleed text cards. */
  paper: "#EFEEEC",
  /** #87CCF7, 9.5 — the signature tile the hero number sits in. */
  panel: "#87CCF7",
  /** #EA9914, 1.7 — highlight only; in this project it carries abstention. */
  accent: "#EA9914",
  /** #172862, 2.5 — headline numerals and the mark. */
  navy: "#172862",
  /** #194C95, 0.8 — interactive/active state; here, validation-only figures. */
  blue: "#194C95",
  /** #2B2C30, 1.3 — body text. */
  ink: "#2B2C30",
  white: "#FFFFFF",
  black: "#000000",
} as const;

/**
 * Semantic assignment. The reference has no equivalent of a direction signal, so
 * these are assignments rather than measurements — STYLE_SPEC.md §3 says so.
 */
export const semantic = {
  /** A figure measured on the final holdout, read once. */
  holdout: color.navy,
  /** The abstention — the product's hero state. */
  abstain: color.accent,
  /** A validation-only figure. Never labelled "out of sample". */
  validation: color.blue,
  /** The thing a figure has to beat before it means anything. */
  baseline: "rgba(43, 44, 48, 0.55)",
  surface: color.panel,
} as const;

/**
 * Type scale — measured by pixel height in sampled frames and normalised to
 * 1920 wide (STYLE_SPEC.md §5). Step ratios ~1.9 / 1.95 / 1.4.
 *
 * Typeface is **inferred**: only glyph shape is recoverable from pixels, so these
 * are named fallbacks rather than an asserted match.
 */
export const type = {
  sans: '"Inter", "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Consolas", "Courier New", monospace',
  size: {
    hero: 109,
    headline: 41,
    body: 21,
    label: 15,
    strip: 11,
  },
  weight: {
    hero: 800,
    headline: 700,
    label: 600,
    body: 400,
  },
  /** ~0.12 em on the tracked caps, measured off the label rows. */
  trackingCaps: "0.12em",
} as const;

/** Layout constants, scaled from the reference at 1024 wide (STYLE_SPEC.md §4). */
export const layout = {
  /** ~12-16px at 1024 -> ~24-30px at 1920. */
  radius: 28,
  radiusSmall: 14,
  margin: 120,
  gutter: 32,
  shadow: "0 18px 48px rgba(23, 40, 98, 0.10), 0 2px 6px rgba(23, 40, 98, 0.06)",
  shadowSoft: "0 8px 24px rgba(23, 40, 98, 0.07)",
} as const;

/**
 * Motion grammar.
 *
 * The reference cuts hard and animates *inside* shots — no dissolve or wipe was
 * visible in 129 sampled frames (STYLE_SPEC.md §4). So there is no crossfade
 * duration here on purpose. `build` is the element-level entrance that produces
 * most of the reference's detectable transitions.
 */
export const timing = {
  /** Element entrance inside a held shot. */
  build: sec(0.35),
  /** Stagger between successive elements in a build. */
  stagger: sec(0.12),
  /** A key-number push-in, held across consecutive shots. */
  pushIn: sec(1.2),
  /** One continuous camera move per 3D set piece. No orbiting. */
  cameraMove: sec(6),
  /** The abstention hold: the longest silence in the film. */
  abstentionHold: sec(4),
} as const;

/** Spring config used for every element build, so motion reads as one system. */
export const spring = { damping: 200, mass: 0.6, stiffness: 100 } as const;

/** The persistent chrome. STYLE_SPEC.md §4 items 2 and 3 — it never leaves. */
export const chrome = {
  topLeft: "NSE COPILOT · HOLDOUT READ ONCE",
  provenance:
    "REAL APP · FROZEN MODEL · EVERY FIGURE READ FROM ml/artifacts/ · " +
    "PAPER TRADING ONLY, NOT INVESTMENT ADVICE",
} as const;
