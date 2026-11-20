import React from "react";
import { AbsoluteFill } from "remotion";
import { Build, Label, StatementCard } from "../components/primitives";
import { disclaimer, headline, provenance } from "../data";
import { color, layout, sec, semantic, type } from "../theme";

/**
 * Beat 7.1 — the disclaimer, given a frame of its own.
 *
 * Read verbatim from the artifact rather than retyped, so the wording on screen
 * is the wording the API ships.
 */
export const DisclaimerCard: React.FC = () => (
  <AbsoluteFill
    style={{
      background: color.paper,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ maxWidth: 1180, textAlign: "center" }}>
      <Build delay={0}>
        <Label tone={semantic.abstain}>Before anything else</Label>
      </Build>
      <Build delay={sec(0.3)}>
        <div
          style={{
            marginTop: 28,
            fontFamily: type.serif,
            fontStyle: "italic",
            fontSize: 46,
            color: color.navy,
            lineHeight: 1.45,
          }}
        >
          {disclaimer}
        </div>
      </Build>
    </div>
  </AbsoluteFill>
);

/**
 * Beat 7.2 — the close.
 *
 * The reference's closing card: the thesis in serif italic, the mark, the
 * links, and a tiny tracked-caps provenance line underneath (montage_6).
 * The last line is `DEMO_SCRIPT.md`'s own closing sentence, kept verbatim.
 */
export const CloseCard: React.FC = () => (
  <AbsoluteFill
    style={{
      background: color.paper,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <StatementCard
      lines={[
        "It is right about half the time.",
        "I would rather tell you that",
        "than show you a number I invented.",
      ]}
      size={54}
    />

    <div style={{ marginTop: 56, textAlign: "center" }}>
      <Build delay={sec(1.4)}>
        <div
          style={{
            fontFamily: type.sans,
            fontSize: 56,
            fontWeight: type.weight.hero,
            color: color.navy,
            letterSpacing: "-0.03em",
          }}
        >
          NSE COPILOT
          <span style={{ color: semantic.abstain }}>.</span>
        </div>
      </Build>
      <Build delay={sec(1.8)}>
        <div
          style={{
            marginTop: 18,
            fontFamily: type.sans,
            fontSize: type.size.body,
            color: color.blue,
          }}
        >
          github.com/rgarg-lab/arthaton-nse-copilot
        </div>
      </Build>
      <Build delay={sec(2.2)}>
        <div style={{ marginTop: 26 }}>
          <Label tone="rgba(43,44,48,0.5)" size={type.size.strip}>
            Arthaton 2026 · AI for Finance · Trading and market insights · solo entry
          </Label>
        </div>
      </Build>
      <Build delay={sec(2.5)}>
        <div
          style={{
            marginTop: 14,
            fontFamily: type.mono,
            fontSize: type.size.strip,
            letterSpacing: type.trackingCaps,
            color: "rgba(43,44,48,0.4)",
            lineHeight: 1.8,
          }}
        >
          EVERY FIGURE READ FROM {provenance.generatedBy.split(" ")[0]} ·
          HOLDOUT {headline.direction.nDisplay} ROWS, READ ONCE
          <br />
          PAPER TRADING AND HISTORICAL ANALYSIS ONLY · NOT INVESTMENT ADVICE
        </div>
      </Build>
    </div>
  </AbsoluteFill>
);

/** A reusable full-bleed statement, used for the hook's second clause. */
export const Statement: React.FC<{
  lines: string[];
  tone?: string;
  background?: string;
}> = ({ lines, tone = color.navy, background = color.paper }) => (
  <AbsoluteFill
    style={{
      background,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: layout.radiusSmall,
    }}
  >
    <StatementCard lines={lines} tone={tone} />
  </AbsoluteFill>
);
