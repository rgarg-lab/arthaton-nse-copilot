import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Copilot, defaultPose, type Expression } from "./Copilot";
import { color, sec, type } from "../theme";

/**
 * Look-dev only — not part of the film.
 *
 * Shows the character at every expression, on the film's real background, so
 * the rig can be judged before any of it is wired into the timeline. Registered
 * in `Root.tsx` as `LookDev-Copilot`; render a still of it with:
 *
 *   npx remotion still LookDev-Copilot out/bot.png --frame=0
 */
const EXPRESSIONS: Expression[] = [
  "neutral",
  "thinking",
  "present",
  "pleased",
  "dash",
  "off",
];

export const BotLookDev: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0.3, 7.4], fov: 40 }}
        gl={{ antialias: true }}
        style={{ backgroundColor: color.bg }}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[6, 10, 7]} intensity={1.7} />
        <directionalLight position={[-6, 4, -4]} intensity={0.55} />
        {/* A soft rim from behind picks the navy body off the pale field. */}
        <directionalLight position={[0, 2, -8]} intensity={0.9} />

        {EXPRESSIONS.map((e, i) => (
          <Copilot
            key={e}
            frame={frame + i * 37}
            pose={{
              ...defaultPose,
              position: [-3.6 + (i % 3) * 3.6, i < 3 ? 1.5 : -1.35, 0],
              scale: 0.95,
              expression: e,
              // Show the hands presenting on half of them.
              handL: i % 2 === 0 ? 0.9 : 0,
              handR: i % 2 === 0 ? 0.9 : 0.4,
              abstain: e === "dash" || e === "off" ? 1 : 0,
              turn: ((i % 3) - 1) * 0.18,
            }}
          />
        ))}
      </ThreeCanvas>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {EXPRESSIONS.map((e, i) => (
          <div
            key={e}
            style={{
              position: "absolute",
              left: 150 + (i % 3) * 640,
              top: i < 3 ? 452 : 980,
              width: 360,
              textAlign: "center",
              fontFamily: type.mono,
              fontSize: type.size.label,
              letterSpacing: type.trackingCaps,
              color: color.ink,
            }}
          >
            {e.toUpperCase()}
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: 60,
            top: 40,
            fontFamily: type.mono,
            fontSize: type.size.label,
            letterSpacing: type.trackingCaps,
            color: color.navy,
          }}
        >
          COPILOT RIG · LOOK-DEV · frame {frame} / blink every {sec(3.5)}f
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
