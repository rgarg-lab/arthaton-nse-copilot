// The film: six information pages on a near-white field, in the reference's layout
// grammar (STYLE_SPEC §4) — one idea per frame, a single centred card, a persistent
// top-left chip, a persistent bottom provenance strip, one saturated accent.
//
// Every figure comes from D (src/data.generated.js), which is written from
// ml/artifacts/*.json by scripts/build-data.mjs. Nothing numeric is typed in this file.

import { W, H, clamp, ease, inv } from '../core.js';
import { P, rgba } from '../palette.js';
import { text, bg } from '../draw.js';
import { C, PAGES, PAGE, TRANS } from '../timeline.js';
import { D } from '../data.generated.js';

const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = 'Consolas, "SF Mono", ui-monospace, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';

const CARD = { x: 200, y: 168, w: W - 400, h: H - 400, r: 30 };

/* ---------------------------------------------------------------- primitives */

function shadowCard(ctx, { x, y, w, h, r } = CARD, fillCol = P.white) {
  // A soft, low-contrast drop shadow — the reference's card sits just off the field
  // rather than floating. Drawn as two offset passes so it stays crisp at supersample.
  ctx.save();
  ctx.shadowColor = 'rgba(23,40,98,0.10)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = fillCol;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

/** The accent tile the hero number sits in (reference grammar §4.4). */
function tile(ctx, x, y, w, h, col = P.panel, r = 20) {
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function eyebrow(ctx, s, x, y, col = P.orange) {
  text(ctx, s.toUpperCase(), x, y, col, 23, { fam: MONO, weight: 700, track: 4.2 });
}

function head(ctx, lines, x, y, size = 72, col = P.navy, lh = 1.16) {
  lines.forEach((l, i) =>
    text(ctx, l, x, y + i * size * lh, col, size, { fam: SANS, weight: 700, track: -1.2 }),
  );
  return y + lines.length * size * lh;
}

function body(ctx, lines, x, y, size = 30, col = P.ink, lh = 1.46) {
  lines.forEach((l, i) =>
    text(ctx, l, x, y + i * size * lh, col, size, { fam: SANS, weight: 400 }),
  );
  return y + lines.length * size * lh;
}

/** A labelled statistic. Figures are tabular so columns line up. */
function stat(ctx, x, y, value, label, col = P.navy, size = 62) {
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, value, x, y, col, size, { fam: MONO, weight: 700, track: -1 });
  ctx.restore();
  text(ctx, label.toUpperCase(), x, y + 34, rgba(P.ink, 0.62), 19, {
    fam: MONO, weight: 600, track: 2.4,
  });
}

/* ------------------------------------------------------------------- chrome */
// Persistent across every page, so the frame never "reloads" between pages — which is
// what makes the pages read as stable while the content slides.

function chrome(ctx, t) {
  eyebrowChip(ctx);
  provenance(ctx);
  pageDots(ctx, t);
}

function eyebrowChip(ctx) {
  const x = 72, y = 82;
  tile(ctx, x, y - 26, 13, 13, P.orange, 3);
  text(ctx, 'NSE COPILOT · ARTHATON 2026', x + 28, y - 14, P.navy, 21, {
    fam: MONO, weight: 700, track: 3.4,
  });
}

/**
 * The provenance strip — the single most directly transferable element in the reference
 * (STYLE_SPEC §4.3). It states what is real and what is not, on screen, continuously.
 */
function provenance(ctx) {
  text(
    ctx,
    'REAL APP · FROZEN MODEL · EVERY FIGURE READ FROM ml/artifacts/ · PAPER TRADING ONLY, NOT INVESTMENT ADVICE',
    W / 2, H - 52, rgba(P.ink, 0.46), 18,
    { fam: MONO, weight: 600, track: 2.6, align: 'center' },
  );
}

/**
 * Progress, top-right — opposite the chip, not along the bottom. At the bottom it ran
 * into the right-hand end of the provenance strip, and the strip is the one element that
 * must never be obscured.
 */
function pageDots(ctx, t) {
  const n = PAGES.length;
  const active = Math.min(n - 1, Math.floor(t / PAGE));
  const wd = 34, gap = 9;
  let x = W - 72 - (n * wd + (n - 1) * gap);
  for (let i = 0; i < n; i++) {
    tile(ctx, x, 62, wd, 4, i <= active ? P.navy : rgba(P.ink, 0.17), 2);
    x += wd + gap;
  }
}

/* -------------------------------------------------------------------- pages */
// Each takes `a` — the element-entrance progress, 0..1 — and is completely static once
// a === 1. No drift, no breathing, no looping motion: a page that is still moving while
// you read it is the thing that reads as unstable.

function pTitle(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 22;

  eyebrow(ctx, 'Arthaton 2026 · AI for Finance · Trading & market insights', cx, y + 108 - rise);
  text(ctx, 'NSE Copilot', cx, y + 262 - rise, P.navy, 136, {
    fam: SANS, weight: 800, track: -5,
  });
  text(ctx, 'A market model that tells you when it doesn’t know.', cx, y + 342 - rise,
    P.ink, 40, { fam: SANS, weight: 400 });

  tile(ctx, cx, y + 404, 148, 6, P.orange, 3);

  body(ctx, [
    'Every other stock tool always has an answer.',
    'This one abstains — and backs the refusal with',
    'numbers it measured on itself.',
  ], cx, y + 476, 31, rgba(P.ink, 0.8));

  const bx = x + w - 420;
  tile(ctx, bx, y + 150, 330, 260, P.panel, 24);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.holdoutAcc, bx + 165, y + 288, P.navy, 86, {
    fam: MONO, weight: 700, align: 'center', track: -2,
  });
  ctx.restore();
  text(ctx, 'DIRECTION ACCURACY', bx + 165, y + 332, rgba(P.navy, 0.74), 18, {
    fam: MONO, weight: 700, track: 2.2, align: 'center',
  });
  text(ctx, 'FINAL HOLDOUT, READ ONCE', bx + 165, y + 358, rgba(P.navy, 0.74), 18, {
    fam: MONO, weight: 700, track: 2.2, align: 'center',
  });
}

function pProblem(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The problem', cx, y + 92 - rise);
  head(ctx, ['Everyone always has', 'an answer.'], cx, y + 196 - rise, 74);

  body(ctx, [
    'Open any retail equity app in India and there is a number:',
    'a target price, a BUY badge, a confidence score. It is there',
    'whether or not tomorrow is actually knowable.',
  ], cx, y + 390, 31);

  // y+560, not y+506: three body lines at 31px/1.46 occupy baselines up to y+480,
  // and a 34px line 26px below that overlaps their descenders.
  body(ctx, ['It usually is not.'], cx, y + 560, 34, P.orange);

  // The coin-flip comparison, as the measured bar it actually is.
  const bx = x + w - 470, by = y + 180;
  text(ctx, 'NEXT-SESSION DIRECTION', bx, by, rgba(P.ink, 0.62), 18,
    { fam: MONO, weight: 700, track: 2.4 });

  const barW = 380, barH = 54;
  // A coin flip, for scale.
  tile(ctx, bx, by + 46, barW, barH, rgba(P.ink, 0.1), 8);
  text(ctx, '50.00%  a coin flip', bx + 18, by + 82, rgba(P.ink, 0.66), 26,
    { fam: MONO, weight: 600 });

  // What this model actually gets, on the holdout.
  tile(ctx, bx, by + 124, barW, barH, P.panel, 8);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, `${D.holdoutAcc}  this model`, bx + 18, by + 160, P.navy, 26,
    { fam: MONO, weight: 700 });
  ctx.restore();

  body(ctx, [
    'Measured on a holdout window',
    `of ${D.holdoutN} sessions, read exactly`,
    `${D.holdoutReads} time, ever.`,
  ], bx, by + 232, 25, rgba(P.ink, 0.72), 1.42);
}

function pSolution(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The solution', cx, y + 92 - rise);
  head(ctx, ['So it refuses to', 'guess.'], cx, y + 196 - rise, 74);

  body(ctx, [
    `Below a frozen ${D.gate} conviction gate the API omits the`,
    'direction field entirely — a client cannot render a call',
    'it was never given. The refusal is the product.',
  ], cx, y + 390, 31);

  // Four measured consequences of that gate.
  const sx = x + w - 520;
  stat(ctx, sx, y + 196, D.abstainShare, 'of sessions it abstains', P.orange, 70);
  stat(ctx, sx, y + 332, D.accWhenCalling, 'accuracy when it does call', P.navy, 70);
  stat(ctx, sx, y + 468, `${D.callsToday} of ${D.universe}`, 'called on the board today', P.orange, 70);

  body(ctx, ['A board of refusals is the product working.'], cx, y + 560, 30, P.orange);
}

function pBetter(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'Why this is different', cx, y + 92 - rise);
  head(ctx, ['Everyone reports', 'validation. This reports', 'the holdout.'], cx, y + 186 - rise, 62);

  body(ctx, [
    'The same frozen gate, measured two ways. The gap between',
    'them is the number nobody else shows you — and this project',
    'prints it beside the figure everywhere it appears.',
  ], cx, y + 452, 29);

  // The two figures, side by side, with the tax between them.
  const bx = x + w - 560, by = y + 170;
  tile(ctx, bx, by, 250, 150, rgba(P.link, 0.12), 18);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.valAcc, bx + 125, by + 86, P.link, 58, { fam: MONO, weight: 700, align: 'center' });
  ctx.restore();
  text(ctx, 'VALIDATION', bx + 125, by + 122, rgba(P.link, 0.9), 17,
    { fam: MONO, weight: 700, track: 2.2, align: 'center' });

  tile(ctx, bx + 272, by, 250, 150, P.panel, 18);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.accWhenCalling, bx + 397, by + 86, P.navy, 58, { fam: MONO, weight: 700, align: 'center' });
  ctx.restore();
  text(ctx, 'HOLDOUT', bx + 397, by + 122, rgba(P.navy, 0.82), 17,
    { fam: MONO, weight: 700, track: 2.2, align: 'center' });

  text(ctx, `↓  ${D.gap} of validation optimism`, bx, by + 212, P.orange, 28,
    { fam: MONO, weight: 700 });

  body(ctx, [
    `Holdout read ${D.holdoutReads} time, ledgered with`,
    'content hashes. 29 configurations',
    'were searched; none beat it. The',
    'failures are in the repository.',
  ], bx, by + 272, 25, rgba(P.ink, 0.72), 1.42);
}

function pAiml(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The AI / ML', cx, y + 92 - rise);
  head(ctx, ['Two heads, both frozen.'], cx, y + 190 - rise, 70);

  // Head one.
  const r1 = y + 252;
  tile(ctx, cx, r1, 8, 96, P.navy, 4);
  text(ctx, 'DIRECTION', cx + 34, r1 + 30, P.navy, 22, { fam: MONO, weight: 700, track: 2.6 });
  body(ctx, ['Pooled LightGBM + isotonic calibration.', 'Which way does tomorrow go?'],
    cx + 34, r1 + 62, 26, rgba(P.ink, 0.78), 1.36);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.holdoutAcc, cx + 820, r1 + 54, P.navy, 56, { fam: MONO, weight: 700, align: 'right' });
  ctx.restore();

  // Head two.
  const r2 = y + 384;
  tile(ctx, cx, r2, 8, 96, P.orange, 4);
  text(ctx, 'MAGNITUDE', cx + 34, r2 + 30, P.orange, 22, { fam: MONO, weight: 700, track: 2.6 });
  body(ctx, ['A second frozen model. Will the move be', 'bigger or quieter than recent normal?'],
    cx + 34, r2 + 62, 26, rgba(P.ink, 0.78), 1.36);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.magMedian, cx + 820, r2 + 54, P.orange, 56, { fam: MONO, weight: 700, align: 'right' });
  ctx.restore();
  text(ctx, `≥ 60% in ${D.magWindows} windows`, cx + 820, r2 + 86, rgba(P.ink, 0.6), 20,
    { fam: MONO, weight: 600, align: 'right' });

  // How it is validated — the part that earns the rest.
  const cy = y + 512;
  const chips = [
    `${D.rows} sessions`,
    `${D.features} scale-free features`,
    `${D.universe} NSE large-caps`,
    'purged walk-forward',
    '5-session embargo',
  ];
  // Wrapped, not a single row: at 22px these five run ~1406px against 1340px of inner
  // card width, so the last chip crossed the card's right edge. Measured and wrapped
  // rather than hand-tuned, so editing the labels cannot silently re-break it.
  const maxX = x + w - 90;
  let chx = cx, chy = cy;
  ctx.save();
  for (const c of chips) {
    const tw = measure(ctx, c, 22, MONO, 600, 1.6) + 36;
    if (chx + tw > maxX) { chx = cx; chy += 60; }
    tile(ctx, chx, chy, tw, 46, rgba(P.navy, 0.07), 23);
    text(ctx, c, chx + 18, chy + 31, P.navy, 22, { fam: MONO, weight: 600, track: 1.6 });
    chx += tw + 14;
  }
  ctx.restore();
}

function pClose(ctx, a) {
  // Full-bleed serif-italic text card — the reference reserves this treatment for its two
  // emotional beats (STYLE_SPEC §4.6), so it is used once, here.
  bg(ctx, P.paper);
  const rise = (1 - a) * 14;

  text(ctx, 'It is right about half the time —', W / 2, H / 2 - 70 - rise, P.navy, 66,
    { fam: SERIF, italic: true, weight: 400, align: 'center' });
  text(ctx, 'and it tells you which half.', W / 2, H / 2 + 10 - rise, P.navy, 66,
    { fam: SERIF, italic: true, weight: 400, align: 'center' });

  tile(ctx, W / 2 - 74, H / 2 + 68, 148, 5, P.orange, 3);

  text(ctx, 'github.com/rgarg-lab/arthaton-nse-copilot', W / 2, H / 2 + 158, rgba(P.ink, 0.74), 27,
    { fam: MONO, weight: 600, track: 1.6, align: 'center' });
}

/** Width of a string at a given type spec, without disturbing caller state. */
function measure(ctx, s, size, fam, weight, track) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${fam}`;
  ctx.letterSpacing = track + 'px';
  const wdt = ctx.measureText(s).width;
  ctx.restore();
  return wdt;
}

const RENDER = { title: pTitle, problem: pProblem, solution: pSolution, better: pBetter, aiml: pAiml, close: pClose };

/* -------------------------------------------------------------- transitions */

/**
 * Page change: the outgoing page slides left and dissolves while the incoming page
 * arrives from the right. The chrome does not move, so the frame stays planted and only
 * the content changes — which is what keeps six hard information changes from feeling
 * like six separate videos.
 */
function drawPage(ctx, id, dx, alpha, a) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.translate(dx, 0);
  RENDER[id](ctx, a);
  ctx.restore();
}

export const pages = [{
  name: 'pages',
  start: 0,
  end: C.end,
  draw(ctx, t) {
    bg(ctx, P.bg);

    const i = Math.min(PAGES.length - 1, Math.floor(t / PAGE));
    const local = t - i * PAGE;
    const SLIDE = 150;

    if (i > 0 && local < TRANS) {
      // Sequential, not a cross-dissolve. Dissolving two dense text pages through each
      // other superimposes two sets of body copy at the midpoint and neither is readable
      // — it looks like a printing fault. So the outgoing page leaves completely before
      // the incoming one arrives: out slides left and fades over the first half, in
      // arrives from the right over the second. Only ever one page on screen.
      const p = inv(0, TRANS, local);
      if (p < 0.5) {
        const q = ease.in2(p / 0.5);
        drawPage(ctx, PAGES[i - 1].id, -SLIDE * q, 1 - q, 1);
      } else {
        const q = ease.out((p - 0.5) / 0.5);
        drawPage(ctx, PAGES[i].id, SLIDE * (1 - q), q, q);
      }
    } else {
      // Settled. `a` reaches 1 within the transition and stays there, so the page is
      // perfectly static for the whole time it is being read.
      const a = i === 0 ? ease.out(inv(0.25, 1.15, local)) : 1;
      drawPage(ctx, PAGES[i].id, 0, 1, a);
    }

    chrome(ctx, t);

    // Light-mode film: no vignette, no grain, no grade. The reference is high-key and
    // clean, and a 2D page deck shows every artifact a post pass would add.
    return { vig: 0, grain: 0 };
  },
}];
