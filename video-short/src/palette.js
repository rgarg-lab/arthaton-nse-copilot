// Palette — measured from the reference by k-means (k=6) over 20,000 pixels in each of 129
// extracted frames, pooled and refined to exact centroids. See video/STYLE_SPEC.md §3 and
// video/analysis/palette.json; this file is that table, not a colour opinion.
//
// The reference is light-mode, high-key and overwhelmingly neutral: one saturated tile
// carries the eye and everything else is near-white. Measured accent-to-background
// coverage is roughly 1:9 — keep it that way.
export const P = {
  bg: '#F5F5F5',      // 94.5 coverage — the dominant surface by a wide margin
  paper: '#EFEEEC',   // 46.5 — slightly warm off-white, for full-bleed text cards
  panel: '#87CCF7',   // 9.5  — the signature light-blue tile the key number sits in
  orange: '#EA9914',  // 1.7  — highlight only; here it reads as abstention/caution
  navy: '#172862',    // 2.5  — headline numerals
  link: '#194C95',    // 0.8  — validation-only figures (never "out of sample")
  ink: '#2B2C30',     // 1.3  — body text

  // Semantic assignment for this project (STYLE_SPEC §3, tagged inferred — the reference
  // has no equivalent of a direction signal, so these are assignments not measurements).
  measured: '#172862', // a holdout figure
  abstain: '#EA9914',  // the product's hero state
  validation: '#194C95',
  white: '#FFFFFF',
};

export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export function rgba(hex, a) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}
