import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../../components/primitives";
import { workedExample as ex } from "../../data";
import { color, layout, sec, semantic, type } from "../../theme";
import { easeInOut, Stage3D } from "../Stage3D";

/**
 * The worked example — one real call, start to finish.
 *
 * The film explained how the product works but never showed it being right
 * about anything. This is the answer, and the important thing about it is that
 * **nothing here is invented**: `scripts/build_example.py` searches the
 * committed walk-forward predictions for the largest correct move among calls
 * that cleared the frozen gate, and writes what it finds. Anyone can look the
 * date up.
 *
 * Four moves:
 *
 *   1. the day, and what the model said
 *   2. the conviction, as a bar that clears the gate (the mirror of beat 4.5,
 *      where it does not)
 *   3. what actually happened next session
 *   4. the calibration bin — the part that makes it evidence rather than an
 *      anecdote. Across every validation day the model gave this probability,
 *      that share is what actually occurred.
 *
 * Carries `VALIDATION · OUT-OF-FOLD` throughout. This is not holdout data and
 * must never be shown as if it were.
 */
export const WorkedExample: React.FC = () => {
  const frame = useCurrentFrame();

  const card = easeInOut(
    interpolate(frame, [sec(0.2), sec(1.2)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // The conviction bar fills and clears the gate.
  const conv = easeInOut(
    interpolate(frame, [sec(3.0), sec(4.4)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // The price drops.
  const drop = easeInOut(
    interpolate(frame, [sec(6.2), sec(8.0)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const proof = easeInOut(
    interpolate(frame, [sec(11.6), sec(12.8)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Conviction plotted on 0.50–0.70 so the gate crossing is legible. Stated.
  const LO = 0.5;
  const HI = 0.7;
  const pos = (v: number) => Math.min(Math.max((v - LO) / (HI - LO), 0), 1);

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <Stage3D cameraPosition={[0, 0.2, 8.0]} fov={40}>
        {/* The price, as two columns: the close it called from, and the close
            that followed. The second one falls into place. */}
        <group position={[2.5, -0.9, 0]}>
          <mesh position={[-0.75, (1.7 * card) / 2 - 0.1, 0]}>
            <boxGeometry args={[0.85, Math.max(1.7 * card, 0.01), 0.3]} />
            <meshStandardMaterial color={color.panel} roughness={0.4} />
          </mesh>
          <mesh
            position={[0.75, (1.7 * (1 - 0.35 * drop) * card) / 2 - 0.1, 0]}
          >
            <boxGeometry
              args={[0.85, Math.max(1.7 * (1 - 0.35 * drop) * card, 0.01), 0.3]}
            />
            <meshStandardMaterial
              color={drop > 0.15 ? semantic.abstain : color.panel}
              roughness={0.4}
            />
          </mesh>
        </group>
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {/* The day. */}
        <div style={{ position: "absolute", left: layout.margin, top: 146 }}>
          <Build delay={0}>
            <Label tone={semantic.abstain}>{ex.basisLabel}</Label>
          </Build>
          <Build delay={sec(0.3)}>
            <div
              style={{
                marginTop: 16,
                fontFamily: type.serif,
                fontStyle: "italic",
                fontSize: 54,
                color: color.navy,
              }}
            >
              {ex.dateDisplay}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: type.sans,
                fontSize: type.size.headline,
                fontWeight: type.weight.headline,
                color: color.ink,
              }}
            >
              {ex.name}
            </div>
          </Build>
        </div>

        {/* What it said. */}
        <div style={{ position: "absolute", left: layout.margin, top: 400, width: 880 }}>
          <Build delay={sec(2.4)}>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.body,
                color: "rgba(43,44,48,0.72)",
              }}
            >
              It called{" "}
              <strong style={{ color: semantic.abstain }}>{ex.called}</strong>, with
              calibrated conviction
            </div>
          </Build>

          <Build delay={sec(2.9)}>
            <div style={{ marginTop: 18, width: 760 }}>
              <div
                style={{
                  position: "relative",
                  height: 26,
                  borderRadius: 13,
                  background: "rgba(43,44,48,0.1)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pos(ex.conviction) * 100 * conv}%`,
                    borderRadius: 13,
                    background: semantic.abstain,
                  }}
                />
                {/* The frozen gate. Here the bar clears it — the exact mirror
                    of the abstention beat, where it does not. */}
                <div
                  style={{
                    position: "absolute",
                    left: `${pos(ex.gate) * 100}%`,
                    top: -9,
                    bottom: -9,
                    width: 3,
                    background: color.navy,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 12,
                  fontFamily: type.mono,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.62)",
                }}
              >
                <span>
                  conviction{" "}
                  <strong style={{ color: semantic.abstain }}>
                    {ex.convictionDisplay}
                  </strong>
                </span>
                <span>
                  gate{" "}
                  <strong style={{ color: color.navy }}>{ex.gateDisplay}</strong> —
                  cleared
                </span>
              </div>
            </div>
          </Build>
        </div>

        {/* What happened. */}
        {drop > 0 ? (
          <div
            style={{
              position: "absolute",
              right: layout.margin,
              top: 300,
              textAlign: "right",
              opacity: drop,
            }}
          >
            <Build delay={sec(6.3)}>
              <Label tone="rgba(43,44,48,0.6)">next session · {ex.nextDateDisplay}</Label>
            </Build>
            <Build delay={sec(6.7)}>
              <div
                style={{
                  marginTop: 14,
                  fontFamily: type.sans,
                  fontSize: 74,
                  fontWeight: type.weight.hero,
                  color: semantic.abstain,
                  letterSpacing: "-0.03em",
                }}
              >
                {ex.returnDisplay}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: type.mono,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.65)",
                }}
              >
                {ex.closeBeforeDisplay} → {ex.closeAfterDisplay}
              </div>
            </Build>
          </div>
        ) : null}

        {/* The part that makes it evidence rather than a story. */}
        {proof > 0 ? (
          <div
            style={{
              position: "absolute",
              left: layout.margin,
              // Stops short of the price columns on the right rather than
              // running underneath them, and clears the caption box below.
              right: 760,
              bottom: 258,
              opacity: proof,
            }}
          >
            <Build delay={sec(11.7)}>
              <div
                style={{
                  background: color.paper,
                  borderRadius: layout.radius,
                  padding: "24px 32px",
                  maxWidth: 1060,
                }}
              >
                <Label tone={color.navy}>Not luck — the band was calibrated</Label>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: type.sans,
                    fontSize: type.size.body,
                    color: "rgba(43,44,48,0.8)",
                    lineHeight: 1.6,
                  }}
                >
                  Across the{" "}
                  <strong style={{ color: color.navy }}>
                    {ex.bin.n.toLocaleString("en-IN")}
                  </strong>{" "}
                  validation sessions where it gave a {ex.bin.range_display}{" "}
                  probability of rising, exactly{" "}
                  <strong style={{ color: color.navy }}>
                    {ex.bin.observed_up_display}
                  </strong>{" "}
                  rose — so{" "}
                  <strong style={{ color: semantic.abstain }}>
                    {ex.bin.observed_down_display}
                  </strong>{" "}
                  fell, as predicted.
                </div>
              </div>
            </Build>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
