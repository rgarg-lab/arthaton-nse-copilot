import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../../components/primitives";
import { headline } from "../../data";
import { color, layout, sec, semantic, type } from "../../theme";
import { easeInOut, Stage3D } from "../Stage3D";

/**
 * Beat 2.3 — "next-session direction on large caps is close to a coin flip".
 *
 * A coin is tossed, spins down, lands, wobbles, and **settles on its edge**.
 *
 * The edge landing is the whole idea and it is not a gag. The measured holdout
 * accuracy is a hair above the always-up baseline — the two figures either side
 * of the coin are read from `data.ts`, not typed here — so a coin that fell
 * cleanly heads or tails would misrepresent the result. One that refuses to
 * fall either way is the honest picture, and it sets up the product's whole
 * argument two beats early.
 */
export const CoinFlip3D: React.FC = () => {
  const frame = useCurrentFrame();

  // --- the toss ---------------------------------------------------------
  const TOSS = sec(0.3);
  const LAND = sec(2.6);
  const SETTLE = sec(3.5);

  // Height: up fast, down under gravity, with two small bounces.
  const arc = interpolate(frame, [TOSS, (TOSS + LAND) / 2, LAND], [-0.4, 2.5, -0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t,
  });
  const bounce =
    frame > LAND
      ? Math.abs(Math.sin((frame - LAND) / 7)) *
        Math.max(0, 1 - (frame - LAND) / sec(0.9)) *
        0.5
      : 0;
  const y = (frame <= LAND ? arc : -0.55) + bounce;

  // Spin: fast while airborne, easing to a stop at exactly 90° — on edge.
  const spinT = easeInOut(
    interpolate(frame, [TOSS, SETTLE], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // A cylinder's axis starts along Y. Rotating it about X by theta puts the
  // axis at (0, cos, sin), so:
  //   theta = pi/2  -> axis points at camera, we see the FACE
  //   theta = 0, pi -> axis is vertical, we see the EDGE
  // Landing on edge therefore means finishing on a multiple of pi. The first
  // cut finished at `+ pi/2` and landed face-on, which quietly threw away the
  // entire point of the shot.
  const spin = spinT * Math.PI * 2 * 7;

  // Tipping onto the rim.
  //
  // Finishing the X-spin on a multiple of pi leaves the axis vertical, which
  // is a coin lying FLAT like a plate — and from a camera above the deck that
  // just reads as a disc. A coin balanced on its edge has a *horizontal* axis,
  // so a quarter-turn about Z as it lands swings the axis to X: faces point
  // left and right and the camera sees the thin rim it is standing on.
  const stand = easeInOut(
    interpolate(frame, [LAND - sec(0.35), LAND + sec(0.25)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // A dying wobble about Z once it is down, so the edge landing reads as
  // precarious rather than placed.
  const wobble =
    frame > LAND
      ? Math.sin((frame - LAND) / 5) *
        Math.max(0, 1 - (frame - LAND) / sec(1.4)) *
        0.16
      : 0;

  const readouts = easeInOut(
    interpolate(frame, [SETTLE, SETTLE + sec(0.6)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <Stage3D cameraPosition={[0, 0.9, 7.2]} fov={40}>
        {/* The coin. Rotated 90° about Z so its faces point left and right;
            spinning about X then tumbles it end over end toward camera. */}
        {/* Coin and rims tumble together as one body; the wobble tips the
            standing coin side to side once it is down. */}
        <group position={[0.4, y, 0]} rotation={[spin, 0, stand * (Math.PI / 2) + wobble]}>
          <mesh>
            <cylinderGeometry args={[0.95, 0.95, 0.13, 48]} />
            <meshStandardMaterial
              color={color.panel}
              roughness={0.25}
              metalness={0.35}
            />
          </mesh>
          {/* A raised rim on each face, so a spinning disc reads as spinning
              rather than strobing. */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, s * 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.72, 0.045, 10, 36]} />
              <meshStandardMaterial
                color={color.navy}
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
          ))}
        </group>
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 180 }}>
          <Build delay={sec(0.2)}>
            <Label tone={color.navy}>The honest shape of the problem</Label>
          </Build>
        </div>

        {/* Both figures, each with what it is measured against. Neither means
            anything without the other, which is the point of showing them
            either side of a coin that would not fall. */}
        {readouts > 0 ? (
          <div
            style={{
              position: "absolute",
              right: layout.margin,
              top: 300,
              textAlign: "right",
              opacity: readouts,
            }}
          >
            <Build delay={sec(3.6)}>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.headline,
                  fontWeight: type.weight.hero,
                  color: color.navy,
                }}
              >
                {headline.direction.display}
              </div>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.label,
                  letterSpacing: type.trackingCaps,
                  color: "rgba(43,44,48,0.6)",
                  marginTop: 6,
                }}
              >
                {headline.direction.qualifier}
              </div>
            </Build>
            <Build delay={sec(3.95)}>
              <div
                style={{
                  marginTop: 26,
                  fontFamily: type.sans,
                  fontSize: type.size.headline * 0.72,
                  fontWeight: type.weight.hero,
                  color: semantic.baseline,
                }}
              >
                {headline.direction.baseline.display}
              </div>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.label,
                  letterSpacing: type.trackingCaps,
                  color: "rgba(43,44,48,0.55)",
                  marginTop: 6,
                }}
              >
                {headline.direction.baseline.label}
              </div>
            </Build>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
