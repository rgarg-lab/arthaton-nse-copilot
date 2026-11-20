import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label, StatementCard } from "../components/primitives";
import { abstention, board } from "../data";
import { color, layout, sec, semantic, type } from "../theme";
import { easeInOut, Stage3D } from "./Stage3D";

/**
 * Set piece 4 — the abstention. The wow moment, and the longest hold in the film.
 *
 * A real signal card turns edge-on and a shutter closes over it. Deliberate,
 * not a greyed-out error: the product is *declining*, and the design has to read
 * as a decision rather than as a failure. Audio does the heavy lifting — the bed
 * drops out entirely for three seconds here.
 *
 * The reference does exactly this at 1:15 with a bare serif-italic card reading
 * "Not today." — the only moment in the whole film given a frame to itself
 * (STYLE_SPEC.md §7). This beat inherits that treatment.
 *
 * The card's contents are a real row from `latest_signals.json`, including the
 * model's own stated reason for declining.
 */
export const Abstention: React.FC<{ startAt?: number }> = ({ startAt = 0 }) => {
  const frame = useCurrentFrame() - startAt;
  const hero = board.heroAbstention;

  // The card turns away. Not a fade: a rotation, so it reads as refusal.
  const turn = easeInOut(
    interpolate(frame, [sec(0.6), sec(2.0)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // The shutter closes over it.
  const shutter = easeInOut(
    interpolate(frame, [sec(1.6), sec(2.8)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const statement = interpolate(frame, [sec(3.0), sec(3.4)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const camera: [number, number, number] = [0, 0.3, 7.4];

  return (
    <AbsoluteFill>
      <Stage3D cameraPosition={camera} fov={40}>
        {/* The signal card, turning edge-on. */}
        <mesh rotation={[0, turn * Math.PI * 0.46, 0]} position={[0, 0.25, 0]}>
          <boxGeometry args={[4.6, 2.7, 0.09]} />
          <meshStandardMaterial color={color.panel} roughness={0.75} />
        </mesh>

        {/* The shutter: two leaves closing from above and below. */}
        {[1, -1].map((dir) => (
          <mesh key={dir} position={[0, dir * (2.9 - shutter * 1.52), 0.5]}>
            <boxGeometry args={[6.4, 2.8, 0.14]} />
            <meshStandardMaterial
              color={semantic.abstain}
              roughness={0.65}
              transparent
              opacity={0.97}
            />
          </mesh>
        ))}
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {/* Before the shutter: the real card, with the real numbers on it. */}
        {shutter < 0.5 ? (
          <div
            style={{
              position: "absolute",
              left: layout.margin,
              top: 190,
              opacity: 1 - turn,
            }}
          >
            <Build delay={0}>
              <Label tone={color.navy}>
                {hero.name} · session {hero.session}
              </Label>
            </Build>
            <Build delay={sec(0.15)}>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: type.size.body,
                  color: "rgba(43,44,48,0.75)",
                  marginTop: 14,
                  lineHeight: 1.8,
                }}
              >
                calibrated conviction {hero.probabilityDisplay}
                <br />
                frozen threshold {hero.thresholdDisplay}
              </div>
            </Build>
          </div>
        ) : null}

        {/* The statement card. Bare, centred, held. */}
        {statement > 0 ? (
          <AbsoluteFill
            style={{
              background: color.paper,
              opacity: statement,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <StatementCard lines={["I don't know."]} tone={color.navy} size={96} />
            <div
              style={{
                position: "absolute",
                bottom: 250,
                left: layout.margin,
                right: layout.margin,
                textAlign: "center",
              }}
            >
              <Build delay={sec(3.9)}>
                <div
                  style={{
                    fontFamily: type.sans,
                    fontSize: type.size.body,
                    color: "rgba(43,44,48,0.7)",
                    maxWidth: 1150,
                    margin: "0 auto",
                    lineHeight: 1.65,
                  }}
                >
                  {hero.reason}
                </div>
              </Build>
              <Build delay={sec(4.5)}>
                <div style={{ marginTop: 22 }}>
                  <Label tone={semantic.abstain}>
                    {abstention.declinedShareDisplay} of holdout sessions declined ·
                    threshold frozen before the holdout was read
                  </Label>
                </div>
              </Build>
            </div>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
