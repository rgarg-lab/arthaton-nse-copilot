// THE cue sheet. Every time in the film is derived here; no shot contains a literal
// absolute time, so re-pacing is a one-file change.
//
// There is no music in this cut (no audio was asked for), so times are in plain seconds
// rather than bars. PAGE/TRANS are the only two knobs that matter.

/** How long each page is fully settled and readable. */
export const PAGE = 9.0;
/** The page-change transition. */
export const TRANS = 0.62;

/**
 * Pacing, and why it departs from the reference.
 *
 * The reference's mean shot is 1.91 s (STYLE_SPEC §2, measured). This film holds ~9 s a
 * page, which is far slower — deliberately. Its shots are *element-level builds inside a
 * held frame*, and its own longest hold (11.2 s) lands on the product's key number. This
 * cut is six dense information pages in sixty seconds; information cannot be read at
 * 1.91 s. The reference's grammar is kept (one idea per frame, a single saturated accent,
 * motion inside the shot rather than between shots); its cutting rate is not.
 *
 * The second departure is the transition itself — the reference uses hard cuts
 * essentially exclusively (no dissolve in 129 sampled frames). A page-change effect was
 * explicitly requested, so each page slides and cross-dissolves. Logged as a divergence
 * rather than smuggled in as style.
 */
const start = (i) => i * PAGE;

export const PAGES = [
  { id: 'title',    start: start(0) },
  { id: 'problem',  start: start(1) },
  { id: 'solution', start: start(2) },
  { id: 'better',   start: start(3) },
  { id: 'aiml',     start: start(4) },
  { id: 'close',    start: start(5) },
];

export const C = {
  pages: PAGES,
  page: PAGE,
  trans: TRANS,
  end: start(PAGES.length) + 2.0,   // a beat of air on the close card
};
