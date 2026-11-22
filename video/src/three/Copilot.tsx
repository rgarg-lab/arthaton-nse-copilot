import React from "react";
import * as THREE from "three";
import { color, semantic } from "../theme";

/**
 * The NSE Copilot — the character that presents the whole film.
 *
 * Built from primitives rather than a loaded model, so it is deterministic,
 * has no asset to ship, and can be posed parametrically from a cue sheet.
 *
 * The form follows the reference the author supplied (a cute 3D assistant with
 * headphones): rounded glossy body, one big visor face carrying all the
 * expression, headphone cups, floating hands with no arms. The *palette* is
 * ours — that reference is lit on black, this film is a high-key `#F5F5F5`
 * field, so a dark-background character would read as pasted on.
 *
 * ## The expression is the argument
 *
 * This product's whole claim is that it refuses to answer when it does not
 * know. So the character has a state for exactly that: `dash` — the eyes
 * collapse to a flat line, the antenna goes amber, the hands drop. That is the
 * 1:21 beat, and it is why the bot is worth having at all.
 *
 * Colours come from `theme.ts` only; `honesty.test.ts` forbids literals here.
 */

export type Expression =
  /** Two round eyes. Default. */
  | "neutral"
  /** Eyes narrow — it is working. */
  | "thinking"
  /** Eyes wide, slight tilt — showing you something. */
  | "present"
  /** Happy arcs. Used once, at the close. */
  | "pleased"
  /** A flat line. "I don't know." The abstention. */
  | "dash"
  /** Visor dark. Used only in the hold after the shutter closes. */
  | "off";

export type Pose = {
  /** World position. */
  position: [number, number, number];
  /**
   * Y rotation in radians — which way it faces.
   *
   * Keep within about ±0.2. The eyes are discs sitting proud of the visor, so
   * they swing laterally ~3x further than the visor's own centre as the head
   * turns; past ~0.3 rad they ride off the plate and the face looks detached.
   */
  turn: number;
  /** Lean into motion, radians about X. */
  lean: number;
  /** Overall scale. */
  scale: number;
  expression: Expression;
  /** 0 = at sides, 1 = presenting forward. Per hand. */
  handL: number;
  handR: number;
  /** 0..1, drives the amber antenna glow. 1 only while abstaining. */
  abstain: number;
};

export const defaultPose: Pose = {
  position: [0, 0, 0],
  turn: 0,
  lean: 0,
  scale: 1,
  expression: "neutral",
  handL: 0,
  handR: 0,
  abstain: 0,
};

/** Eye geometry per expression: [width, height, yOffset, rotation]. */
const EYE: Record<Expression, [number, number, number, number]> = {
  neutral: [0.085, 0.085, 0, 0],
  thinking: [0.085, 0.032, 0.01, 0],
  present: [0.1, 0.1, 0, 0],
  pleased: [0.1, 0.045, 0.012, 0],
  // The refusal: a flat bar, wider than an eye, dead level.
  dash: [0.13, 0.022, 0, 0],
  off: [0, 0, 0, 0],
};

/**
 * One hand. A rounded disc — no arm, which is the classic mascot shortcut and
 * animates far better than a jointed limb at this scale.
 */
const Hand: React.FC<{ side: -1 | 1; reach: number; bob: number }> = ({
  side,
  reach,
  bob,
}) => {
  // Rest at the side, swing forward and inward as `reach` goes to 1.
  const x = side * (0.5 - reach * 0.1);
  const y = -0.52 + reach * 0.42 + bob * 0.5;
  const z = reach * 0.5;
  return (
    <mesh position={[x, y, z]} rotation={[0, 0, side * (0.35 - reach * 0.5)]}>
      <capsuleGeometry args={[0.1, 0.07, 6, 14]} />
      <meshStandardMaterial
        color={color.panel}
        roughness={0.28}
        metalness={0.05}
      />
    </mesh>
  );
};

export const Copilot: React.FC<{ pose: Pose; frame: number }> = ({ pose, frame }) => {
  // Always alive: a slow bob plus a slower sway. A character that holds
  // perfectly still reads as a prop, not a presenter.
  const bob = Math.sin(frame / 34) * 0.045;
  const sway = Math.sin(frame / 61) * 0.03;

  // Blink: a quick close roughly every 3.5 s, skipped when the visor is dark
  // or the expression is already a flat line.
  const blinkPhase = (frame % 210) / 210;
  const blinking =
    blinkPhase > 0.965 && pose.expression !== "off" && pose.expression !== "dash";

  const [ew, ehRaw, eyY] = EYE[pose.expression];
  const eh = blinking ? 0.015 : ehRaw;
  const visorLit = pose.expression !== "off";

  // The antenna is the abstention tell. Amber only when it is declining.
  const antennaColor = pose.abstain > 0.5 ? semantic.abstain : color.panel;

  return (
    <group
      position={pose.position}
      rotation={[pose.lean, pose.turn, sway * 0.25]}
      scale={pose.scale}
    >
      <group position={[0, bob, 0]}>
        {/* Body — short and round. Deliberately small against the head: the
            big-head/small-body ratio is what reads as "cute" rather than
            "industrial", and it keeps the face dominant at any frame size. */}
        <mesh position={[0, -0.52, 0]}>
          <capsuleGeometry args={[0.33, 0.2, 12, 28]} />
          <meshStandardMaterial
            color={color.navy}
            roughness={0.22}
            metalness={0.12}
          />
        </mesh>

        {/* Head. */}
        <mesh position={[0, 0.26, 0]} scale={[1.04, 0.94, 0.96]}>
          <sphereGeometry args={[0.5, 36, 36]} />
          <meshStandardMaterial
            color={color.navy}
            roughness={0.2}
            metalness={0.12}
          />
        </mesh>

        {/* Visor — a flattened plate that PROTRUDES from the front of the
            head. The head sphere (r 0.5, z-scale 0.96) has its front face at
            z = 0.48, so a visor whose own front lands short of that is simply
            swallowed by the head — which is exactly what the first two cuts
            did, rendering a blank navy face.
            Front here = 0.26 + 0.40 * 0.80 = 0.58, i.e. 0.10 proud.
            Width is kept to ~73% of the head so navy still frames it — at
            full width it reads as a helmet rather than a face. */}
        <mesh position={[0, 0.26, 0.26]} scale={[1.08, 0.76, 0.8]}>
          <sphereGeometry args={[0.4, 36, 28]} />
          <meshStandardMaterial
            color={visorLit ? color.panel : color.ink}
            emissive={visorLit ? color.panel : color.black}
            emissiveIntensity={visorLit ? 0.5 : 0}
            roughness={0.1}
            metalness={0.1}
          />
        </mesh>

        {/* Eyes, just in front of the visor's 0.58 front face and kept
            well inside its half-width so they stay on the plate when the
            head turns. */}
        {visorLit && ew > 0
          ? [-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * 0.1, 0.28 + eyY, 0.6]}
                scale={[ew * 1.25, eh * 1.25, 1]}
              >
                <circleGeometry args={[1, 24]} />
                <meshStandardMaterial
                  color={color.navy}
                  emissive={color.navy}
                  emissiveIntensity={0.25}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))
          : null}

        {/* Headphones — the silhouette cue from the reference. */}
        {[-1, 1].map((s) => (
          <mesh
            key={`cup${s}`}
            position={[s * 0.5, 0.26, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.19, 0.19, 0.14, 24]} />
            <meshStandardMaterial
              color={color.panel}
              roughness={0.3}
              metalness={0.1}
            />
          </mesh>
        ))}
        {/* The band. A half-torus in the default XY plane already arcs from
            +X over +Y to -X — exactly ear-to-ear over the crown. Rotating it
            (as the first cut did) laid it flat and read as a flying saucer. */}
        <mesh position={[0, 0.26, 0]}>
          <torusGeometry args={[0.52, 0.05, 12, 32, Math.PI]} />
          <meshStandardMaterial
            color={color.panel}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>

        {/* Antenna — the abstention tell. */}
        <mesh position={[0, 0.84, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.16, 8]} />
          <meshStandardMaterial color={color.panel} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.075, 18, 18]} />
          <meshStandardMaterial
            color={antennaColor}
            emissive={antennaColor}
            emissiveIntensity={0.35 + pose.abstain * 1.1}
            roughness={0.25}
          />
        </mesh>

        <Hand side={-1} reach={pose.handL} bob={bob} />
        <Hand side={1} reach={pose.handR} bob={bob} />
      </group>
    </group>
  );
};
