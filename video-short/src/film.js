// Shot list -> frame renderer.
import { P } from './palette.js';
import { bg } from './draw.js';
import { C } from './timeline.js';
import { pages } from './shots/pages.js';

const shots = [...pages].sort((a, b) => a.start - b.start);

export const film = {
  duration: C.end,
  fps: 60,
  shots,
  // supersample 2 because this film is almost entirely type on a light field, where soft
  // edges are the first thing that reads as cheap. Cost is render time only.
  render: { supersample: 2 },
  async load() {
    // Every face used is a Windows system font (Segoe UI, Consolas, Georgia), so there is
    // nothing to fetch — but wait for the font set anyway, so frame 0 cannot be typeset
    // in a fallback and baked into the file.
    if (document.fonts) await document.fonts.ready;
  },
  draw(ctx, t) {
    const s = shots.find((s) => t >= s.start && t < s.end) || shots[shots.length - 1];
    if (!s) { bg(ctx, P.bg); return { vig: 0 }; }
    ctx.save();
    const fx = s.draw(ctx, t) || {};
    ctx.restore();
    return fx;
  },
};
