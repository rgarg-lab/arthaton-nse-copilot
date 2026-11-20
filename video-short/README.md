# The 1-minute explainer

A silent, 56-second explainer — problem, solution, why it is different, and the AI/ML —
as six information pages joined by slide transitions. Rendered from code, frame by frame.

```bash
npm run data     # read ml/artifacts/*.json -> src/data.generated.js
npm run film     # -> out/nse-copilot-60s.mp4   (1920x1080, 60 fps, no audio)
npm run preview  # scrub it in a browser
```

This is **separate from [`../video/`](../video/)**, which is the 3-minute submission video
built in Remotion with Three.js and real screen recordings. This one is a deck: no
footage, no 3D, no audio.

---

## Why a second video project at all

The 3-minute cut has a defect that is structural, not cosmetic: its app-footage beats are
realtime Playwright recordings composited into a 60 fps timeline, and realtime recording
cannot hold 60 — one capture runs at **29.6 fps**, so beat 4.6 shows every frame twice for
eight seconds. See [`../README.md`](../README.md#the-video-and-the-walkthrough-deck).

Nothing here is recorded in realtime. Every frame is a pure function of `t`, stepped by a
headless browser with no clock to race, so the judder failure mode does not exist in this
pipeline. That is the whole reason it is built this way rather than screen-captured.

---

## The honesty rule

**No figure is typed into a shot.** `scripts/build-data.mjs` reads the committed artifacts
— `metrics.json`, `magnitude_metrics.json`, `confidence_tiers.json`, `holdout_ledger.json`,
`latest_signals.json` — and writes `src/data.generated.js`. The pages import `D` from
there and nothing else.

That is the same rule the app and the 3-minute video follow, and `npm run film` runs
`npm run data` first so the film cannot be rendered against stale numbers.

The provenance strip is on screen for all 56 seconds:

```
REAL APP · FROZEN MODEL · EVERY FIGURE READ FROM ml/artifacts/ · PAPER TRADING ONLY, NOT INVESTMENT ADVICE
```

---

## The six pages

| # | Page | Carries |
|---|---|---|
| 1 | Title | the thesis, and the holdout figure in the accent tile |
| 2 | The problem | every tool always answers; direction is near a coin flip |
| 3 | The solution | the frozen gate, what it abstains on, what it gets when it calls |
| 4 | Why this is different | validation vs holdout, and the gap between them |
| 5 | The AI/ML | two frozen heads, and how they were validated |
| 6 | Close | the thesis as a full-bleed serif card |

Re-pace the whole film by editing `PAGE` and `TRANS` in `src/timeline.js`. No shot
contains a literal time.

---

## Style, and where it departs from the reference

The look is taken from the measured style bible in
[`../video/STYLE_SPEC.md`](../video/STYLE_SPEC.md) — the reference is the author's own
prior PayPal hackathon video. Palette is §3 verbatim (k-means over 129 frames): a
near-white `#F5F5F5` field, one saturated `#87CCF7` tile carrying the key number, `#EA9914`
orange as the abstention accent at roughly 1:9 coverage, `#172862` navy for numerals.
Layout grammar is §4: one centred card, one idea per frame, a persistent top-left chip and
the persistent provenance strip.

Two deliberate departures, both because the brief for *this* cut asked for them:

| | reference (measured) | here | why |
|---|---|---|---|
| Transitions | hard cuts, essentially exclusively — no dissolve in 129 sampled frames | a slide + fade between pages | a page-change effect was asked for |
| Shot length | mean **1.91 s** | ~9 s per page | six dense information pages in a minute; information cannot be read at 1.91 s |

The reference's fast cutting is mostly *element-level builds inside a held frame*, and its
own longest hold (11.2 s) lands on its key number — so holding a page is closer to its
grammar than its mean shot length suggests.

**The transition is sequential, not a cross-dissolve.** Dissolving two dense text pages
through each other superimposes two sets of body copy at the midpoint and neither is
readable. The outgoing page leaves completely before the incoming one arrives.

**Pages are completely static once settled.** Entrance motion finishes inside the
transition and then nothing moves — no drift, no breathing, no loops. A page still moving
while you read it is the thing that reads as unstable.

---

## Adding audio later

`src/audio/score.js` renders silence of exactly the film's duration; the engine's demo
score is kept at `score.demo.js.bak` as a worked example of the synth API. Because every
time in the film comes from `src/timeline.js`, scoring this later means writing against
the same cues — no re-timing.

---

## Notes

- `out/` is git-ignored; the MP4 is a build artifact.
- The renderer resolves `ffmpeg` from `$FFMPEG`, then the `imageio-ffmpeg` wheel, then
  PATH — Windows has no system ffmpeg and `spawn` does not resolve `python` the way the
  shell does.
- `--stills 4,13,22 --sheet s` writes individual frames to `out/stills/`. The montage step
  needs an ffmpeg built with globbing, which the bundled Windows build is not; the stills
  themselves are written either way.
