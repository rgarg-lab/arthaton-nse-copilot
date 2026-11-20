import React from "react";
import { AbsoluteFill } from "remotion";
import { chrome, color, layout, type } from "../theme";

/**
 * The persistent chrome: a top-left anchor chip and a bottom provenance strip.
 *
 * Both are lifted from the reference, where they survive essentially every cut
 * (STYLE_SPEC.md §4, items 2 and 3). The provenance strip is the single most
 * transferable element in the reference — it states what is real and what is
 * sample data continuously, rather than disclosing it once at the end. Here it
 * carries the honesty constraint this whole project is an argument for.
 */
export const Chrome: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
  if (hidden) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: layout.margin * 0.4,
          left: layout.margin * 0.5,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: type.mono,
          fontSize: type.size.label,
          fontWeight: type.weight.label,
          letterSpacing: type.trackingCaps,
          color: color.navy,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color.accent,
            display: "inline-block",
          }}
        />
        {chrome.topLeft}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: layout.margin * 0.3,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: type.mono,
          fontSize: type.size.strip,
          letterSpacing: type.trackingCaps,
          color: "rgba(43, 44, 48, 0.45)",
        }}
      >
        {chrome.provenance}
      </div>
    </AbsoluteFill>
  );
};
