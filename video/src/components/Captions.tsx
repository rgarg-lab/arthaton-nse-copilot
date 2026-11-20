import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { color, layout, sec, type } from "../theme";
import { VO } from "../vo";

/**
 * Burned-in open captions.
 *
 * Judges often watch muted, so the VO is on screen as well as in the mix. The
 * text comes from `vo.ts`, which is also what the scratch track and
 * `audio/VO_SCRIPT.md` are generated from — so the captions cannot drift out of
 * sync with the words being spoken, because there is only one copy of them.
 *
 * Sat above the provenance strip, never over it.
 */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 60;

  const line = VO.find((l) => t >= l.from && t < l.to);
  if (!line) return null;

  const inF = sec(line.from);
  const outF = sec(line.to);
  const opacity = interpolate(
    frame,
    [inF, inF + 5, outF - 5, outF],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: layout.margin * 0.72,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity,
        }}
      >
        <div
          style={{
            maxWidth: 1340,
            textAlign: "center",
            background: "rgba(245, 245, 245, 0.92)",
            borderRadius: layout.radiusSmall,
            padding: "14px 28px",
            fontFamily: type.sans,
            fontSize: 30,
            lineHeight: 1.4,
            color: color.ink,
            boxShadow: layout.shadowSoft,
          }}
        >
          {line.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
