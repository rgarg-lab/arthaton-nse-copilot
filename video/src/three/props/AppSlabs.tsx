import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build } from "../../components/primitives";
import { color, layout, sec, semantic, type } from "../../theme";
import { easeInOut, Stage3D } from "../Stage3D";

/**
 * Beats 1.1 and 1.2 — the opening argument, in 3D.
 *
 * Five slabs rise and each immediately stamps a confident badge. They are
 * identical, instant and mechanical: that *is* the point of the line, "most
 * stock tools always have an answer". Then on the second beat every badge
 * collapses to a flat amber dash — the same gesture the Copilot's own visor
 * makes when it declines.
 *
 * ## Deliberately abstract
 *
 * The slabs carry a badge and two content bars, not numbers or product names.
 * Two reasons, and both matter:
 *
 *  - Putting invented figures in 3D would mean invented *statistics* on screen
 *    in a film whose whole claim is that every figure traces to an artifact.
 *    The one place this film shows invented numbers (beat 2.1) is quarantined
 *    in `illustrative.ts` and stamped "ILLUSTRATIVE" for the whole beat.
 *  - Naming or mimicking a real competitor's UI would be a different and worse
 *    problem than the one being illustrated.
 *
 * A green badge above two grey bars reads as "an app with an opinion" to
 * anyone, without asserting anything about anybody.
 */

const SLAB_X = [-0.5, 0.75, 2.0, 3.25, 4.5];

const Slab: React.FC<{
  x: number;
  rise: number;
  stamp: number;
  /** 0 = confident badge, 1 = collapsed to a dash. */
  blank: number;
  amber: boolean;
}> = ({ x, rise, stamp, blank, amber }) => {
  // Rises from below the floor and settles.
  const y = -3.2 + rise * 3.0;
  const tilt = (1 - rise) * 0.5;

  // The badge: a wide block that collapses to a thin bar as `blank` goes to 1.
  const badgeW = 0.52 - blank * 0.22;
  const badgeH = 0.17 - blank * 0.115;
  const badgeColor = blank > 0.5 ? (amber ? semantic.abstain : color.ink) : color.panel;

  return (
    <group position={[x, y, 0]} rotation={[tilt, 0, 0]}>
      {/* The card. */}
      <mesh>
        <boxGeometry args={[1.0, 1.45, 0.07]} />
        <meshStandardMaterial color={color.white} roughness={0.55} />
      </mesh>

      {/* The badge — stamped on, overshooting slightly then settling. */}
      <mesh position={[-0.18, 0.42, 0.05]} scale={stamp}>
        <boxGeometry args={[badgeW, badgeH, 0.03]} />
        <meshStandardMaterial
          color={badgeColor}
          emissive={badgeColor}
          emissiveIntensity={blank > 0.5 && amber ? 0.5 : 0.12}
          roughness={0.4}
        />
      </mesh>

      {/* A big confident figure, represented as a solid bar rather than a
          number — see the note above. It shrinks away with the badge. */}
      <mesh position={[-0.05, 0.1, 0.05]} scale={[1 - blank * 0.75, 1, 1]}>
        <boxGeometry args={[0.66, 0.26, 0.03]} />
        <meshStandardMaterial color={color.navy} roughness={0.45} />
      </mesh>

      {/* Two lines of supporting detail. */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[-0.16, -0.26 - i * 0.2, 0.05]}>
          <boxGeometry args={[0.6 - i * 0.18, 0.07, 0.02]} />
          <meshStandardMaterial color={color.ink} transparent opacity={0.22} />
        </mesh>
      ))}
    </group>
  );
};

export const AppSlabs: React.FC<{
  /** Beat 1.2 blanks every badge and turns one amber. */
  blanked?: boolean;
  lines: string[];
  tone?: string;
}> = ({ blanked, lines, tone = color.navy }) => {
  const frame = useCurrentFrame();

  const blank = blanked
    ? easeInOut(
        interpolate(frame, [sec(0.5), sec(1.6)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      )
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: color.paper }}>
      <Stage3D cameraPosition={[1.1, 0.5, 7.0]} fov={42}>
        {SLAB_X.map((x, i) => {
          // Staggered, but fast — they answer the instant they appear.
          const t0 = blanked ? 0 : sec(0.25) + i * sec(0.16);
          const rise = easeInOut(
            interpolate(frame, [t0, t0 + sec(0.45)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          );
          // The stamp overshoots then settles — a mechanical "thunk".
          const sp = interpolate(frame, [t0 + sec(0.3), t0 + sec(0.62)], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const stamp = blanked ? 1 : sp < 1 ? 1.35 - 0.35 * easeInOut(sp) : 1;
          return (
            <Slab
              key={x}
              x={x}
              rise={blanked ? 1 : rise}
              stamp={blanked ? 1 : stamp * Number(sp > 0)}
              blank={blank}
              // Exactly one of them is the honest tool.
              amber={i === 2}
            />
          );
        })}
      </Stage3D>

      {/* The line sits left, clear of the slabs and clear of the bot, which
          holds the lower-left corner through both beats. */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: layout.margin,
            top: 232,
            width: 620,
          }}
        >
          {lines.map((l, i) => (
            <Build key={l} delay={sec(0.15) + i * sec(0.18)} from={14}>
              <div
                style={{
                  fontFamily: type.serif,
                  fontStyle: "italic",
                  fontSize: 58,
                  color: tone,
                  lineHeight: 1.28,
                }}
              >
                {l}
              </div>
            </Build>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
