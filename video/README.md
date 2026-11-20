# The submission video

A 3-minute Arthaton 2026 submission video for NSE Copilot, **rendered from code** —
Remotion (React → frame-accurate MP4) with `@remotion/three` for real Three.js, compositing
real screen recordings of the real app. Deterministic and re-renderable. Not generative
video.

```bash
cd video
npm ci
npm run render        # -> out/arthaton-submission.mp4
```

The render takes roughly 25 minutes on a 12-core / 16 GB laptop: 10,800 frames at
1920×1080, five of them WebGL set pieces. It renders in resumable 600-frame chunks and
muxes the measured audio mix once at the end — see `BUILD_LOG.md` D7.11–D7.12 for why a
single continuous render takes six hours instead.

---

## The one rule

**Every figure on screen is read from `ml/artifacts/*.json` at render time, through
[`src/data.ts`](./src/data.ts). No statistic is typed into a scene.**

That is the app's own rule (`tests/honesty.test.ts`, BUILD_SPEC §4.2) extended to the
video — and the video is where it usually breaks, because people say "60% accurate" on
camera and nobody diffs a video against an artifact.

[`src/honesty.test.ts`](./src/honesty.test.ts) fails the build if a metric-shaped literal
appears anywhere in `src/scenes/` or `src/three/`. It is verified by execution, not
asserted: [`scripts/verify-binding.mjs`](./scripts/verify-binding.mjs) plants a literal and
checks the suite goes red, then perturbs `metrics.json` and checks the rendered frame's
bytes change.

The one exception is eight **invented** illustrative cards in beat 2.1, quarantined in
[`src/illustrative.ts`](./src/illustrative.ts) and labelled as invented on screen for the
whole beat.

---

## How it was built

Measurement first. A reference video was analysed before anything was designed, and the
measurements are the contract:

| Document | What it is |
|---|---|
| [`STYLE_SPEC.md`](./STYLE_SPEC.md) | The measured style contract. Every claim tagged **measured** (with the producing script) or **inferred**, and one tagged *not measurable* |
| [`SCRIPT.md`](./SCRIPT.md) | The 25-beat timing table, validated by `analysis/check_script.py` |
| [`COMPARISON.md`](./COMPARISON.md) | The render measured against the reference by the same code |
| [`CREDITS.md`](./CREDITS.md) | Every asset and its licence |
| [`BUILD_LOG.md`](./BUILD_LOG.md) | Every decision, including the ones that were wrong first |
| [`HUMAN_TASKS.md`](./HUMAN_TASKS.md) | What still needs the author — **the voice-over, above all** |
| [`audio/VO_SCRIPT.md`](./audio/VO_SCRIPT.md) | Generated from `src/vo.ts`; what to record against |

```
analysis/     Stage 0: probe, cut detection, montages, palette, transcript, audio profile
src/
  theme.ts            palette + type scale from STYLE_SPEC.md — the single source
  data.ts             the only path from a committed artifact to a frame
  vo.ts               the voice-over as data: captions, scratch track and script
  scenes/             2D beats
  three/              the five Three.js set pieces
  components/         chrome, captions, capture compositing, re-framing
scripts/      capture, audio build, verification
public/       what the render loads: the mix, and the real screen recordings
```

## Commands

```bash
npm run studio     # open the composition in Remotion Studio
npm run render     # the submission MP4
npm run poster     # 1080p poster frame for the submission form
npm run verify     # typecheck + honesty tests + prove the binding is real
npm run capture    # re-record the app (needs the stack up)
npm run audio      # rebuild the mix and the VO script
npm run compare    # measure the render against the reference
```

## Status

The video is finished and measured. **The voice is a synthetic scratch track** and must be
replaced with the author's own recording before submission — the edit, captions, timings
and mix are all built so that swapping it in is a one-file change. See
[`HUMAN_TASKS.md`](./HUMAN_TASKS.md).

> Historical and paper-trading analysis only. Not investment advice.
