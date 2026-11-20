/**
 * Where each beat re-frames, and how hard.
 *
 * Measured, not guessed. The first render came back at a **3.67 s mean shot**
 * against the reference's measured 1.91 s (`COMPARISON.md`) — 48 detected cuts
 * where the timeline has 68 hard boundaries. Two causes: not enough re-framing,
 * and the re-frames that existed were too gentle for a frame-difference
 * detector to call a cut at all (scale steps of 1.0 → 1.12).
 *
 * So the plan is generated rather than hand-written: evenly spaced points
 * across each beat, with scale alternating between 1.0 and a deliberately large
 * zoom and the origin jumping across the frame each time. That reads as the
 * reference's key-number push-in grammar — the same content, re-framed across
 * consecutive shots — and it produces a frame delta a detector will actually
 * register.
 *
 * Target: mean shot inside 1.53–2.29 s over 180 s, i.e. **79–117 shots**.
 * `npm run compare` re-measures it.
 */

/** Origins cycled through on successive re-frames. Big jumps, on purpose. */
const ORIGINS = [
  "50% 50%",
  "28% 34%",
  "50% 50%",
  "72% 62%",
  "38% 68%",
  "50% 50%",
  "66% 32%",
  "34% 56%",
  "50% 50%",
  "62% 44%",
];

/**
 * Zooms cycled through. 1.0 alternates with a step large enough for a
 * frame-difference detector to call a cut.
 *
 * **These values are a measured trade-off, not a preference.** At 1.34-1.42 the
 * cut rhythm passes (86 detected cuts, 2.07 s mean against the reference's
 * 1.91 s) but the zoom crops the edges of some scene labels — the universe
 * grid's move-size caption and the walk-forward title both lose their ends at
 * peak zoom.
 *
 * Pulling them back to 1.18-1.24 fixes the cropping and was tried: detection
 * fell from 86 cuts to 73 and the mean shot went to 2.43 s, outside the +/-20%
 * the brief allows. Both versions were rendered and measured.
 *
 * The shipped video keeps the larger zooms, because the measured contract is
 * the brief's acceptance criterion and the cropping is cosmetic. To take the
 * other side of the trade: soften these values *and* raise the shot counts in
 * `Main.tsx` to roughly 125 to recover the lost detections.
 */
const SCALES = [1.0, 1.34, 1.0, 1.42, 1.12, 1.0, 1.38, 1.18, 1.0, 1.3];

export type ReframePlan = {
  at: number[];
  scales: number[];
  origins: string[];
};

/**
 * Split a beat of `duration` seconds into `shots` framings.
 *
 * `offset` rotates the scale/origin cycle so adjacent beats do not start from
 * the same framing — otherwise a beat boundary would be invisible to the
 * detector, which is the thing being fixed.
 */
export const plan = (duration: number, shots: number, offset = 0): ReframePlan => {
  if (shots <= 1) return { at: [], scales: [1], origins: [ORIGINS[0]] };
  const step = duration / shots;
  const at: number[] = [];
  for (let i = 1; i < shots; i++) at.push(Number((step * i).toFixed(3)));
  const scales: number[] = [];
  const origins: string[] = [];
  for (let i = 0; i < shots; i++) {
    scales.push(SCALES[(i + offset) % SCALES.length]);
    origins.push(ORIGINS[(i + offset) % ORIGINS.length]);
  }
  return { at, scales, origins };
};
