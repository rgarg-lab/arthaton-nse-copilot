import React from "react";
import { interpolate, spring as rSpring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, layout, spring, timing, type } from "../theme";

/**
 * Element-level entrance. The reference animates *inside* shots and cuts hard
 * between them (STYLE_SPEC.md §4), so this is the only entrance in the system
 * and there is deliberately no crossfade primitive anywhere.
 */
export const Build: React.FC<{
  delay?: number;
  children: React.ReactNode;
  from?: number;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, from = 24, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = rSpring({ frame: frame - delay, fps, config: spring, durationInFrames: timing.build });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * from}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A tracked all-caps label. The reference's small-label treatment. */
export const Label: React.FC<{
  children: React.ReactNode;
  tone?: string;
  size?: number;
}> = ({ children, tone = color.ink, size = type.size.label }) => (
  <div
    style={{
      fontFamily: type.sans,
      fontSize: size,
      fontWeight: type.weight.label,
      letterSpacing: type.trackingCaps,
      textTransform: "uppercase",
      color: tone,
    }}
  >
    {children}
  </div>
);

/** The card the reference centres one idea on. */
export const Card: React.FC<{
  children: React.ReactNode;
  tone?: string;
  style?: React.CSSProperties;
  soft?: boolean;
}> = ({ children, tone = color.white, style, soft }) => (
  <div
    style={{
      background: tone,
      borderRadius: layout.radius,
      boxShadow: soft ? layout.shadowSoft : layout.shadow,
      padding: 44,
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * A measured figure with the two things that make it mean anything: the
 * qualifier that says what it was measured on, and the baseline it has to beat.
 *
 * Both are required props rather than optional, because §6 of the brief turns on
 * exactly this — a figure shown without its qualifier is the failure mode.
 */
export const Figure: React.FC<{
  value: string;
  qualifier: string;
  baselineLabel: string;
  baselineValue: string;
  tone?: string;
  size?: number;
  delay?: number;
}> = ({ value, qualifier, baselineLabel, baselineValue, tone = color.navy, size = type.size.hero, delay = 0 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <Build delay={delay}>
      <Label tone="rgba(43, 44, 48, 0.6)">{qualifier}</Label>
    </Build>
    <Build delay={delay + timing.stagger}>
      <div
        style={{
          fontFamily: type.sans,
          fontSize: size,
          fontWeight: type.weight.hero,
          color: tone,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </Build>
    <Build delay={delay + timing.stagger * 2}>
      <div
        style={{
          fontFamily: type.sans,
          fontSize: type.size.body,
          color: "rgba(43, 44, 48, 0.55)",
        }}
      >
        {baselineLabel} <strong style={{ color: color.ink }}>{baselineValue}</strong>
      </div>
    </Build>
  </div>
);

/**
 * Full-bleed serif-italic text card. The reference reserves this treatment for
 * exactly two moments — the refusal and the close — and so does this film.
 */
export const StatementCard: React.FC<{
  lines: string[];
  tone?: string;
  delay?: number;
  size?: number;
}> = ({ lines, tone = color.navy, delay = 0, size = 64 }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      textAlign: "center",
    }}
  >
    {lines.map((l, i) => (
      <Build key={l} delay={delay + i * timing.stagger * 2} from={12}>
        <div
          style={{
            fontFamily: type.serif,
            fontStyle: "italic",
            fontSize: size,
            color: tone,
            lineHeight: 1.25,
          }}
        >
          {l}
        </div>
      </Build>
    ))}
  </div>
);

/** A horizontal bar, used for the baselines row. */
export const Bar: React.FC<{
  share: number;
  tone: string;
  delay?: number;
  height?: number;
}> = ({ share, tone, delay = 0, height = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = rSpring({ frame: frame - delay, fps, config: spring, durationInFrames: timing.build * 2 });
  return (
    <div
      style={{
        height,
        width: `${share * 100 * p}%`,
        background: tone,
        borderRadius: layout.radiusSmall / 2,
      }}
    />
  );
};

/** Fade a whole scene's contents in over its first frames and out at its end. */
export const useSceneOpacity = (durationInFrames: number, pad = 4) => {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [0, pad, durationInFrames - pad, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
};
