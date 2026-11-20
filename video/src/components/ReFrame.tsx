import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { sec } from "../theme";

/**
 * Discrete re-framing of a continuous shot.
 *
 * The reference's measured rhythm is a **1.91 s mean shot** over 88 shots in
 * 168 s (STYLE_SPEC.md §2), and a large part of that comes from holding one
 * idea while cutting *within* it — the key-number push-in at 1:03-1:15, where
 * the same tile is re-framed across consecutive shots rather than cut away
 * from.
 *
 * A 20-second 3D set piece with one continuous camera move is the right
 * grammar for explaining the thing, and the wrong grammar for the rhythm. This
 * splits such a beat into several framings of the same continuous shot: the
 * scene underneath keeps running and keeps its single camera move, but the
 * crop jumps, which reads as a cut and measures as one.
 *
 * It re-frames real content. Nothing is duplicated, reordered or faked.
 */
export const ReFrame: React.FC<{
  /** Seconds, relative to the start of the enclosing Sequence. */
  at: number[];
  /** Zoom per segment. First entry applies before the first `at`. */
  scales?: number[];
  /** Origin per segment, as CSS `transform-origin`. */
  origins?: string[];
  children: React.ReactNode;
}> = ({ at, scales, origins, children }) => {
  const frame = useCurrentFrame();

  let seg = 0;
  for (let i = 0; i < at.length; i++) {
    if (frame >= sec(at[i])) seg = i + 1;
  }

  const scale = scales?.[seg] ?? 1;
  const origin = origins?.[seg] ?? "50% 50%";

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: origin,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
