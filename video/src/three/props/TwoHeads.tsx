import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../../components/primitives";
import { headline, universe } from "../../data";
import { color, layout, sec, semantic, type } from "../../theme";
import { easeInOut, Stage3D } from "../Stage3D";

/**
 * Beat 3 — "two independent heads … they are never merged."
 *
 * Replaces `UniverseGrid`, which drew the basket as eighteen spheres on a
 * Fibonacci sphere. On playback that read as "random circles": it was pretty,
 * it was data-driven, and it communicated nothing about the line it sat under.
 *
 * Two panels do say it. Each carries one question, the figure that answers it,
 * the qualifier that makes the figure mean anything, and the baseline it beats.
 * Side by side, the comparison is the content:
 *
 *   - **Which way?**  51.37%, final holdout, against 48.91% always-up
 *   - **How big?**    60.20%, validation on called sessions, against the base rate
 *
 * The gap between the panels is held open for the whole beat. That gap is the
 * product rule — the heads are never combined, the agent's tool description
 * forbids it and the rules layer flags it — so the staging is the argument
 * rather than decoration over it.
 */

const Panel: React.FC<{
  x: number;
  rise: number;
  tone: string;
  /** Height of the measured bar, 0..1 of the panel's inner height. */
  fill: number;
  /** Where the baseline sits on the same scale. */
  base: number;
}> = ({ x, rise, tone, fill, base }) => {
  const y = -3.4 + rise * 3.4;
  const H = 3.0;
  const W = 2.5;

  return (
    <group position={[x, y, 0]}>
      {/* The card. */}
      <mesh>
        <boxGeometry args={[W, H, 0.09]} />
        <meshStandardMaterial color={color.white} roughness={0.55} />
      </mesh>

      {/* The measured figure as a column, growing from the card's floor. */}
      <mesh position={[-0.52, -H / 2 + (fill * H * 0.62) / 2 + 0.28, 0.07]}>
        <boxGeometry args={[0.62, Math.max(fill * H * 0.62, 0.02), 0.04]} />
        <meshStandardMaterial color={tone} roughness={0.4} />
      </mesh>

      {/* The baseline, as a rule across the same column. Without it the bar
          is a number with nothing to beat. */}
      <mesh position={[-0.52, -H / 2 + base * H * 0.62 + 0.28, 0.1]}>
        <boxGeometry args={[0.92, 0.035, 0.03]} />
        <meshStandardMaterial
          color={color.ink}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
};

export const TwoHeads: React.FC = () => {
  const frame = useCurrentFrame();

  const riseL = easeInOut(
    interpolate(frame, [sec(0.3), sec(1.3)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const riseR = easeInOut(
    interpolate(frame, [sec(0.9), sec(1.9)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // The two panels drift apart and stay apart — the "never merged" rule, staged.
  const split = easeInOut(
    interpolate(frame, [sec(2.0), sec(4.0)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const gap = 2.05 + split * 0.55;

  // Both figures are plotted on a common 45%–65% scale so the two columns are
  // directly comparable; a chart whose two halves used different scales would
  // be the sort of quiet lie this project exists to avoid.
  const LO = 0.45;
  const HI = 0.65;
  const norm = (v: number) => Math.min(Math.max((v - LO) / (HI - LO), 0), 1);

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <Stage3D cameraPosition={[0, 0.35, 8.1]} fov={40}>
        <Panel
          x={-gap}
          rise={riseL}
          tone={semantic.holdout}
          fill={norm(headline.direction.value)}
          base={norm(headline.direction.baseline.value)}
        />
        <Panel
          x={gap}
          rise={riseR}
          tone={semantic.validation}
          fill={norm(headline.moveSize.value)}
          base={norm(headline.moveSize.baseline.value)}
        />
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 140 }}>
          <Build delay={0}>
            <Label tone={color.navy}>
              Two independent heads · {universe.present} names · never merged
            </Label>
          </Build>
        </div>

        {/* Left: direction. */}
        <div style={{ position: "absolute", left: 212, top: 318, width: 440 }}>
          <Build delay={sec(0.5)}>
            <div
              style={{
                fontFamily: type.serif,
                fontStyle: "italic",
                fontSize: 40,
                color: color.navy,
              }}
            >
              Which way?
            </div>
          </Build>
          <Build delay={sec(1.4)}>
            <div
              style={{
                marginTop: 14,
                fontFamily: type.sans,
                fontSize: 68,
                fontWeight: type.weight.hero,
                color: semantic.holdout,
                letterSpacing: "-0.03em",
              }}
            >
              {headline.direction.display}
            </div>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: "rgba(43,44,48,0.62)",
                marginTop: 8,
              }}
            >
              {headline.direction.qualifier}
            </div>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.body,
                color: "rgba(43,44,48,0.6)",
                marginTop: 14,
              }}
            >
              {headline.direction.baseline.label}{" "}
              <strong style={{ color: color.ink }}>
                {headline.direction.baseline.display}
              </strong>
            </div>
          </Build>
        </div>

        {/* Right: move size. */}
        <div style={{ position: "absolute", right: 212, top: 318, width: 460, textAlign: "right" }}>
          <Build delay={sec(1.0)}>
            <div
              style={{
                fontFamily: type.serif,
                fontStyle: "italic",
                fontSize: 40,
                color: color.navy,
              }}
            >
              How big?
            </div>
          </Build>
          <Build delay={sec(1.9)}>
            <div
              style={{
                marginTop: 14,
                fontFamily: type.sans,
                fontSize: 68,
                fontWeight: type.weight.hero,
                color: semantic.validation,
                letterSpacing: "-0.03em",
              }}
            >
              {headline.moveSize.display}
            </div>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: "rgba(43,44,48,0.62)",
                marginTop: 8,
              }}
            >
              {headline.moveSize.qualifier}
            </div>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.body,
                color: "rgba(43,44,48,0.6)",
                marginTop: 14,
              }}
            >
              {headline.moveSize.baseline.label}{" "}
              <strong style={{ color: color.ink }}>
                {headline.moveSize.baseline.display}
              </strong>
            </div>
          </Build>
        </div>

        {/* The rule that keeps them apart, stated under the gap. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 232,
            textAlign: "center",
          }}
        >
          <Build delay={sec(4.2)}>
            <div
              style={{
                fontFamily: type.mono,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: "rgba(43,44,48,0.55)",
              }}
            >
              &quot;bigger than usual&quot; is not &quot;up&quot; — the two are never combined
            </div>
          </Build>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
