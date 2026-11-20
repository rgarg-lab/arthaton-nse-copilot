import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../components/primitives";
import { confidence } from "../data";
import { color, layout, sec, semantic, type } from "../theme";
import { easeInOut, Stage3D } from "./Stage3D";

/**
 * Set piece 5 — the confidence ladder.
 *
 * Accuracy by conviction tier as ascending steps. The step heights are the
 * measured accuracies and the step depths are the coverage at that gate, so the
 * ladder narrows as it climbs — which is the whole point: the model is more
 * accurate exactly where it speaks least.
 *
 * **The reality check is attached to the top step and is not optional.**
 * `confidence_tiers.json` declares its own basis as *validation* and ships a
 * `holdout_comparison` precisely so the validation-optimism tax travels with any
 * tier figure. The top step therefore carries both numbers and the gap between
 * them. Showing the validation figure alone would be the most flattering frame
 * in this video and the least honest one.
 */
export const ConfidenceLadder: React.FC<{ startAt?: number }> = ({ startAt = 0 }) => {
  const frame = useCurrentFrame() - startAt;
  const gates = confidence.gates;

  const t = easeInOut(
    interpolate(frame, [0, sec(10)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const camera: [number, number, number] = [-2.4 + t * 1.0, 3.0 - t * 0.4, 14.4 - t * 1.6];

  const stepIn = (i: number) => sec(0.8) + i * sec(0.55);

  /**
   * The bars are drawn from a datum below the lowest gate rather than from the
   * lowest gate itself, so the full-coverage step is a visible bar instead of a
   * zero-height sliver — and the datum is stated on screen, because a bar chart
   * that silently starts at 54% exaggerates every difference above it.
   */
  const DATUM = 0.5;
  const SCALE = 13;
  const barHeight = (acc: number) => Math.max((acc - DATUM) * SCALE, 0.06);

  return (
    <AbsoluteFill>
      <Stage3D cameraPosition={camera} fov={40}>
        {gates.map((g, i) => {
          const p = easeInOut(
            interpolate(frame, [stepIn(i), stepIn(i) + sec(0.6)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          );
          // Height is the measured accuracy above the datum; depth is the
          // measured coverage. The ladder climbs and narrows at the same time.
          const h = barHeight(g.accuracy) * p;
          const depth = 0.35 + g.coverage * 2.6;
          const x = -4.2 + i * 2.1;
          const isTop = i === gates.length - 1;
          return (
            <group key={g.gate}>
              <mesh position={[x, h / 2, 0]}>
                <boxGeometry args={[1.5, Math.max(h, 0.001), depth]} />
                <meshStandardMaterial
                  color={isTop ? semantic.abstain : semantic.holdout}
                  transparent
                  opacity={0.92 * p}
                  roughness={0.8}
                />
              </mesh>
            </group>
          );
        })}

        {/* The holdout result at the frozen gate, drawn as a thin rule cutting
            across the ladder: the level every validation step has to come back
            down to once the holdout is read. */}
        {frame > sec(5.4) ? (
          <mesh
            position={[
              -0.6,
              barHeight(confidence.realityCheck.holdoutAccuracy),
              0.9,
            ]}
          >
            <boxGeometry args={[11.4, 0.045, 0.045]} />
            <meshStandardMaterial
              color={semantic.abstain}
              emissive={semantic.abstain}
              emissiveIntensity={0.5}
              transparent
              opacity={interpolate(frame, [sec(5.4), sec(6.2)], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          </mesh>
        ) : null}
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 150 }}>
          <Build delay={sec(0.2)}>
            <Label tone={color.navy}>
              Accuracy by conviction gate · {confidence.basis}
            </Label>
          </Build>
          <Build delay={sec(0.5)}>
            <div
              style={{
                fontFamily: type.mono,
                fontSize: type.size.label,
                color: "rgba(43,44,48,0.5)",
                marginTop: 10,
              }}
            >
              bars measured from {(DATUM * 100).toFixed(0)}%, not zero
            </div>
          </Build>
        </div>

        {/* Per-step readout, in the reference's label treatment. */}
        <div
          style={{
            position: "absolute",
            left: layout.margin,
            bottom: 175,
            display: "flex",
            gap: 46,
          }}
        >
          {gates.map((g, i) => (
            <Build key={g.gate} delay={stepIn(i)}>
              <div style={{ minWidth: 112 }}>
                <div
                  style={{
                    fontFamily: type.sans,
                    fontSize: type.size.headline,
                    fontWeight: type.weight.hero,
                    color: i === gates.length - 1 ? semantic.abstain : color.navy,
                  }}
                >
                  {g.accuracyDisplay}
                </div>
                <div
                  style={{
                    fontFamily: type.mono,
                    fontSize: type.size.label,
                    color: "rgba(43,44,48,0.6)",
                    marginTop: 6,
                  }}
                >
                  gate {g.gateDisplay}
                  <br />
                  covers {g.coverageDisplay}
                </div>
              </div>
            </Build>
          ))}
        </div>

        {/* The reality check. Attached, not optional. */}
        {frame > sec(5.6) ? (
          <div
            style={{
              position: "absolute",
              right: layout.margin,
              top: 190,
              textAlign: "right",
              maxWidth: 580,
              // Sat on its own surface so it stays readable wherever the
              // geometry happens to be behind it.
              background: "rgba(245,245,245,0.94)",
              borderRadius: layout.radius,
              padding: "28px 32px",
              boxShadow: layout.shadowSoft,
            }}
          >
            <Build delay={sec(5.7)}>
              <Label tone={semantic.abstain}>The validation-optimism tax</Label>
            </Build>
            <Build delay={sec(6.1)}>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.body,
                  color: "rgba(43,44,48,0.75)",
                  marginTop: 14,
                  lineHeight: 1.8,
                }}
              >
                same frozen gate, validation{" "}
                <strong style={{ color: color.navy }}>
                  {confidence.realityCheck.validationDisplay}
                </strong>
                <br />
                same frozen gate, holdout{" "}
                <strong style={{ color: semantic.abstain }}>
                  {confidence.realityCheck.holdoutDisplay}
                </strong>
                <br />
                <span style={{ color: "rgba(43,44,48,0.55)" }}>
                  {confidence.realityCheck.gapDisplay} lower
                </span>
              </div>
            </Build>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
