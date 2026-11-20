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

/**
 * This cut leads on the magnitude head.
 *
 * The direction head's honest holdout figure is 51.37% and it is in the README, the
 * model card and SUBMISSION.md. It is not on screen here because this film is about the
 * question the model answers *well* — whether tomorrow's move will be bigger or quieter
 * than this name's recent normal — where all four walk-forward windows land between
 * 58.46% and 61.64%.
 *
 * Two labels are load-bearing and must not be dropped:
 *   1. the figure is MOVE SIZE, never direction;
 *   2. this head has not been evaluated on the final holdout (magnitude_metrics.json
 *      `holdout_note`) — its evidence is stability across four windows, which is weaker.
 * Without those, 60.20% reads as an out-of-sample direction claim, which it is not, and
 * the repository would contradict the video on its own front page.
 */

function pTitle(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 22;

  eyebrow(ctx, 'Arthaton 2026 · AI for Finance · Trading & market insights', cx, y + 108 - rise);
  text(ctx, 'NSE Copilot', cx, y + 258 - rise, P.navy, 132, {
    fam: SANS, weight: 800, track: -5,
  });
  text(ctx, 'It only answers the question it can answer.', cx, y + 338 - rise,
    P.ink, 38, { fam: SANS, weight: 400 });

  tile(ctx, cx, y + 398, 148, 6, P.orange, 3);

  body(ctx, [
    'Will tomorrow’s move be bigger or quieter',
    'than this stock’s recent normal?',
  ], cx, y + 466, 31, rgba(P.ink, 0.8));

  body(ctx, [
    `Four independent walk-forward windows. The weakest is ${D.magMin}.`,
  ], cx, y + 580, 26, rgba(P.ink, 0.6));

  const bx = x + w - 430;
  tile(ctx, bx, y + 142, 340, 286, P.panel, 24);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.magMedian, bx + 170, y + 272, P.navy, 92, {
    fam: MONO, weight: 700, align: 'center', track: -2,
  });
  ctx.restore();
  text(ctx, 'MOVE-SIZE ACCURACY', bx + 170, y + 318, rgba(P.navy, 0.78), 18, {
    fam: MONO, weight: 700, track: 2.2, align: 'center',
  });
  text(ctx, 'MEDIAN OF 4 WALK-FORWARD', bx + 170, y + 344, rgba(P.navy, 0.78), 18, {
    fam: MONO, weight: 700, track: 2.2, align: 'center',
  });
  text(ctx, 'WINDOWS · NOT DIRECTION', bx + 170, y + 370, rgba(P.navy, 0.78), 18, {
    fam: MONO, weight: 700, track: 2.2, align: 'center',
  });
}

function pProblem(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The problem', cx, y + 92 - rise);
  head(ctx, ['Everyone answers the', 'question nobody can', 'answer.'], cx, y + 186 - rise, 62);

  body(ctx, [
    'Open any retail equity app in India and there is a number:',
    'a target price, a BUY badge, a confidence score — all of them',
    'answering “which way will it close tomorrow?”',
  ], cx, y + 436, 30);

  body(ctx, ['On NSE large-caps, that is close to a coin flip.'], cx, y + 560, 32, P.orange);

  // The pivot, stated as the choice it was.
  const bx = x + w - 440, by = y + 182;
  text(ctx, 'THE QUESTION EVERYONE ASKS', bx, by, rgba(P.ink, 0.62), 17,
    { fam: MONO, weight: 700, track: 2.4 });
  tile(ctx, bx, by + 26, 360, 74, rgba(P.ink, 0.07), 10);
  text(ctx, 'Which way will it', bx + 20, by + 56, rgba(P.ink, 0.72), 25, { fam: SANS, weight: 400 });
  text(ctx, 'close tomorrow?', bx + 20, by + 86, rgba(P.ink, 0.72), 25, { fam: SANS, weight: 400 });

  text(ctx, 'SO WE STOPPED ASKING IT', bx, by + 156, P.orange, 17,
    { fam: MONO, weight: 700, track: 2.4 });
  tile(ctx, bx, by + 182, 360, 74, P.panel, 10);
  text(ctx, 'How big will the', bx + 20, by + 212, P.navy, 25, { fam: SANS, weight: 600 });
  text(ctx, 'move be?', bx + 20, by + 242, P.navy, 25, { fam: SANS, weight: 600 });
}

function pSolution(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The solution', cx, y + 92 - rise);
  head(ctx, ['A second model, for', 'the answerable half.'], cx, y + 196 - rise, 66);

  body(ctx, [
    'Not which way — how big. A frozen model asking whether',
    'tomorrow’s move will beat this name’s own recent normal,',
    'which is the half of the problem that is actually learnable.',
  ], cx, y + 414, 29);

  body(ctx, [`It covers ${D.magCovMin}–${D.magCovMax} of sessions and declines the rest.`],
    cx, y + 548, 29, P.orange);

  const sx = x + w - 450;
  stat(ctx, sx, y + 230, D.magMedian, 'median of four windows', P.navy, 76);
  stat(ctx, sx, y + 366, D.magWindows, 'windows at or above 60%', P.navy, 76);

  text(ctx, 'EVIDENCE IS STABILITY ACROSS FOUR', sx, y + 468, rgba(P.ink, 0.55), 16,
    { fam: MONO, weight: 600, track: 1.8 });
  text(ctx, 'WINDOWS — NOT A FINAL-HOLDOUT READ', sx, y + 492, rgba(P.ink, 0.55), 16,
    { fam: MONO, weight: 600, track: 1.8 });
}

function pBetter(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'Why this is different', cx, y + 92 - rise);
  head(ctx, ['We quote our worst', 'window, not our best.'], cx, y + 190 - rise, 62);

  body(ctx, [
    'Every walk-forward window is on screen, weakest first. The',
    'number a project chooses to print is the real claim it makes —',
    'so this one prints the floor.',
  ], cx, y + 384, 28);

  // Dot plot, not bars: the interesting range is 58–62, and a bar chart on a truncated
  // axis overstates the differences while a zero-baseline bar hides them entirely. The
  // axis bounds are drawn so the truncation is declared rather than implied.
  const ax = x + w - 560, aw = 420;
  const LO = 58, HI = 62;
  const px = (v) => ax + ((v - LO) / (HI - LO)) * aw;

  text(ctx, 'ACCURACY WHEN IT CALLS, PER WINDOW', ax, y + 132, rgba(P.ink, 0.62), 16,
    { fam: MONO, weight: 700, track: 2.2 });

  // The 60% reference line, behind the dots.
  const top = y + 182, rowH = 62;
  ctx.save();
  ctx.strokeStyle = rgba(P.ink, 0.16);
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px(60), top - 8);
  ctx.lineTo(px(60), top + rowH * 4 + 4);
  ctx.stroke();
  ctx.restore();
  text(ctx, '60%', px(60), top - 18, rgba(P.ink, 0.5), 16,
    { fam: MONO, weight: 700, align: 'center' });

  D.magFolds.forEach((f, i) => {
    const ry = top + i * rowH + 26;
    const worst = i === 0;
    text(ctx, f.label, ax - 14, ry + 6, rgba(P.ink, 0.6), 19,
      { fam: MONO, weight: 600, align: 'right' });

    // The connecting rule reads as a scale, not as a magnitude.
    ctx.save();
    ctx.strokeStyle = rgba(P.ink, 0.1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ry);
    ctx.lineTo(ax + aw, ry);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = worst ? P.orange : P.navy;
    ctx.beginPath();
    ctx.arc(px(parseFloat(f.acc)), ry, worst ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fontVariantNumeric = 'tabular-nums';
    text(ctx, f.acc, ax + aw + 20, ry + 7, worst ? P.orange : P.navy, 24,
      { fam: MONO, weight: 700 });
    ctx.restore();
  });

  text(ctx, `${LO}%`, ax, top + rowH * 4 + 30, rgba(P.ink, 0.42), 16, { fam: MONO, weight: 600 });
  text(ctx, `${HI}%`, ax + aw, top + rowH * 4 + 30, rgba(P.ink, 0.42), 16,
    { fam: MONO, weight: 600, align: 'right' });
  text(ctx, `worst window: ${D.magMin}`, ax, top + rowH * 4 + 64, P.orange, 21,
    { fam: MONO, weight: 700 });
}

function pAiml(ctx, a) {
  const { x, y, w } = CARD;
  shadowCard(ctx);
  const cx = x + 90;
  const rise = (1 - a) * 18;

  eyebrow(ctx, 'The AI / ML', cx, y + 92 - rise);
  // One line, not two: the chip block below needs the vertical room, and at two lines
  // the chips were drawn straight over the headline.
  head(ctx, ['Two frozen heads.'], cx, y + 182 - rise, 62);

  const r1 = y + 248;
  tile(ctx, cx, r1, 8, 96, P.orange, 4);
  text(ctx, 'MAGNITUDE — THE ONE THIS FILM QUOTES', cx + 34, r1 + 30, P.orange, 21,
    { fam: MONO, weight: 700, track: 2.2 });
  body(ctx, ['Gradient-boosted trees on 58 scale-free features.', 'Will the move beat recent normal?'],
    cx + 34, r1 + 62, 25, rgba(P.ink, 0.78), 1.36);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, D.magMedian, x + w - 90, r1 + 54, P.orange, 54, { fam: MONO, weight: 700, align: 'right' });
  ctx.restore();

  const r2 = y + 376;
  tile(ctx, cx, r2, 8, 96, rgba(P.ink, 0.3), 4);
  text(ctx, 'DIRECTION — ABSTAINS BY DEFAULT', cx + 34, r2 + 30, rgba(P.ink, 0.6), 21,
    { fam: MONO, weight: 700, track: 2.2 });
  body(ctx, ['LightGBM + isotonic calibration. Below a frozen', 'gate the API omits the field entirely.'],
    cx + 34, r2 + 62, 25, rgba(P.ink, 0.66), 1.36);
  ctx.save();
  ctx.fontVariantNumeric = 'tabular-nums';
  text(ctx, `${D.callsToday} of ${D.universe}`, x + w - 90, r2 + 54, rgba(P.ink, 0.55), 46,
    { fam: MONO, weight: 700, align: 'right' });
  ctx.restore();
  text(ctx, 'CALLED TODAY', x + w - 90, r2 + 84, rgba(P.ink, 0.45), 16,
    { fam: MONO, weight: 600, track: 2, align: 'right' });

  const cy = y + 508;
  const chips = [
    `${D.rows} sessions`,
    `${D.universe} NSE large-caps`,
    'purged walk-forward',
    '5-session embargo',
    `holdout read ${D.holdoutReads} time, ledgered`,
  ];
  const maxX = x + w - 90;
  let chx = cx, chy = cy;
  ctx.save();
  for (const c of chips) {
    const tw = measure(ctx, c, 21, MONO, 600, 1.6) + 34;
    if (chx + tw > maxX) { chx = cx; chy += 58; }
    tile(ctx, chx, chy, tw, 44, rgba(P.navy, 0.07), 22);
    text(ctx, c, chx + 17, chy + 30, P.navy, 21, { fam: MONO, weight: 600, track: 1.6 });
    chx += tw + 13;
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
