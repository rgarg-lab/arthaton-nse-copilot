import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { sec } from "../theme";

/**
 * Wraps one beat's content and carries it on and off screen.
 *
 * ## Why beats overlap now
 *
 * `<Sequence>`s used to be laid end to end, so every boundary was a hard cut
 * with nothing between. To make the handoff continuous each beat is extended by
 * `OVERLAP` seconds past its nominal end, so the outgoing beat is still mounted
 * while the incoming one starts. Remotion paints later sequences on top, so the
 * arriving panel covers the departing one and the two move together.
 *
 * The beat's *timing* is unchanged — `SCRIPT.md`'s in/out points still describe
 * when each idea is on screen. Only the tail is extended, and the tail is
 * underneath the next beat.
 *
 * ## Why CSS 3D rather than Three.js
 *
 * The screen captures are DOM (`<Img>` inside a styled div — see
 * `Capture.tsx`). Mapping 10,800 JPEG frames onto Three.js geometry would mean
 * a texture upload per frame, which is exactly the class of per-frame media
 * work that already cost this project a day (BUILD_LOG D7.16). `perspective` +
 * `rotateY` + `translateZ` on the existing DOM gives the same read for a push,
 * a flip or a collapse, deterministically, at no render cost.
 */

/** Seconds of overlap between adjacent beats. */
export const OVERLAP = 0.55;

export type Transition =
  /** Panel slides out left, next arrives from the right. The default. */
  | "swipe"
  /** Shrinks toward the bot's hand; next blooms out. */
  | "collapse"
  /** Rotates 180° on Y — the next content is "on the back". */
  | "flip"
  /** Breaks up and reforms. Used between two data-heavy beats. */
  | "scatter"
  /** Sinks into the floor; next rises. Used at act changes. */
  | "rise"
  /** No movement at all. The abstention hold owns its own staging. */
  | "hold";

type Phase = "in" | "out";

/** The transform a panel sits at when it is fully off-stage. */
const offStage = (t: Transition, phase: Phase): React.CSSProperties => {
  // `in` arrives from the far side of where `out` departs, so a swipe reads as
  // one continuous left-to-right push rather than two unrelated moves.
  const dir = phase === "in" ? 1 : -1;
  switch (t) {
    case "swipe":
      return { transform: `translateX(${dir * 62}%) scale(0.94)`, opacity: 0 };
    case "collapse":
      return { transform: "scale(0.26) translateY(14%)", opacity: 0 };
    case "flip":
      return { transform: `perspective(2200px) rotateY(${dir * 62}deg) scale(0.9)`, opacity: 0 };
    case "scatter":
      return { transform: "scale(1.14)", opacity: 0, filter: "blur(14px)" };
    case "rise":
      return { transform: `translateY(${dir * 46}%) scale(0.95)`, opacity: 0 };
    case "hold":
    default:
      return { opacity: 0 };
  }
};

const AT_REST: React.CSSProperties = {
  transform: "perspective(2200px) translateX(0%) translateY(0%) rotateY(0deg) scale(1)",
  opacity: 1,
  filter: "blur(0px)",
};

const ease = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/** Blend two transform strings by driving each numeric channel on `u`. */
const blend = (
  t: Transition,
  phase: Phase,
  u: number,
): React.CSSProperties => {
  const e = ease(u);
  const dir = phase === "in" ? 1 : -1;
  const inv = 1 - e;
  switch (t) {
    case "swipe":
      return {
        transform: `translateX(${dir * 62 * inv}%) scale(${0.94 + 0.06 * e})`,
        opacity: e,
      };
    case "collapse":
      return {
        transform: `scale(${0.26 + 0.74 * e}) translateY(${14 * inv}%)`,
        opacity: e,
      };
    case "flip":
      return {
        transform: `perspective(2200px) rotateY(${dir * 62 * inv}deg) scale(${0.9 + 0.1 * e})`,
        opacity: e,
      };
    case "scatter":
      return {
        transform: `scale(${1.14 - 0.14 * e})`,
        opacity: e,
        filter: `blur(${14 * inv}px)`,
      };
    case "rise":
      return {
        transform: `translateY(${dir * 46 * inv}%) scale(${0.95 + 0.05 * e})`,
        opacity: e,
      };
    case "hold":
    default:
      return { opacity: e };
  }
};

export const StagePanel: React.FC<{
  /** Nominal beat length in seconds, excluding the overlap tail. */
  durationS: number;
  enter: Transition;
  exit: Transition;
  children: React.ReactNode;
}> = ({ durationS, enter, exit, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const over = sec(OVERLAP);
  const endsAt = Math.round(durationS * fps);

  let style: React.CSSProperties;
  if (frame < over) {
    style = blend(enter, "in", frame / over);
  } else if (frame >= endsAt) {
    // The overlap tail: leaving, while the next beat arrives on top.
    style = blend(exit, "out", 1 - Math.min((frame - endsAt) / over, 1));
  } else {
    style = AT_REST;
  }

  return (
    <AbsoluteFill style={{ ...style, willChange: "transform, opacity" }}>
      {children}
    </AbsoluteFill>
  );
};

export { offStage };
