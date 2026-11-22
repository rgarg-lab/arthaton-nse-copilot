import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../../components/primitives";
import { abstention, board } from "../../data";
import { color, sec, semantic, type } from "../../theme";
import { easeInOut, Stage3D } from "../Stage3D";

/**
 * Beat 4.5 — the refusal. The centre of the film.
 *
 * The previous version was a full-bleed serif card reading "I don't know." and
 * little else. On playback it read as a blank page — the single most important
 * moment in the film looked like a missing slide.
 *
 * The beat is unchanged in intent and gains its evidence. The refusal is shown
 * the way the product actually makes it: a real name off today's board, its
 * calibrated conviction as a bar that visibly **stops short of the frozen
 * gate**, the arithmetic of the shortfall, the model's own stated reason, and
 * how often it does this. "I don't know." stays, as a line rather than as the
 * whole frame.
 *
 * Every figure comes from `latest_signals.json` and `metrics.json` through
 * `data.ts`. The shutter still closes and the Copilot still goes dark with the
 * amber antenna — that staging lives in `choreography.ts`.
 */
export const AbstentionReadout: React.FC = () => {
  const frame = useCurrentFrame();
  const hero = board.heroAbstention;

  // The card turns edge-on and the shutter drops, as before.
  const turn = easeInOut(
    interpolate(frame, [sec(0.4), sec(1.6)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const shutter = easeInOut(
    interpolate(frame, [sec(1.3), sec(2.4)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const readout = easeInOut(
    interpolate(frame, [sec(2.6), sec(3.2)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // The conviction bar. Drawn on a 0.50–0.65 scale so the shortfall against a
  // 0.60 gate is legible; a 0–1 axis would squash the whole story into a
  // sliver. The scale is stated on screen.
  const LO = 0.5;
  const HI = 0.65;
  const pos = (v: number) => Math.min(Math.max((v - LO) / (HI - LO), 0), 1);
  const conv = Number(hero.probabilityDisplay);
  const gate = Number(hero.thresholdDisplay);

  const grow = easeInOut(
    interpolate(frame, [sec(3.0), sec(4.0)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: color.paper }}>
      <Stage3D cameraPosition={[0, 0.3, 7.4]} fov={40}>
        {/* The signal card turning away. It clears out as the readout
            arrives — left in place it cuts straight through the text. */}
        {readout < 0.98 ? (
          <mesh rotation={[0, turn * Math.PI * 0.46, 0]} position={[0, 0.25, 0]}>
            <boxGeometry args={[4.6, 2.7, 0.09]} />
            <meshStandardMaterial
              color={color.panel}
              roughness={0.75}
              transparent
              opacity={1 - readout}
            />
          </mesh>
        ) : null}
        {/* Shutter leaves closing over it. */}
        {shutter < 0.995
          ? [1, -1].map((dir) => (
              <mesh key={dir} position={[0, dir * (2.9 - shutter * 1.52), 0.5]}>
                <boxGeometry args={[6.4, 2.8, 0.14]} />
                <meshStandardMaterial
                  color={semantic.abstain}
                  roughness={0.65}
                  transparent
                  opacity={0.97 * (1 - readout * 0.85)}
                />
              </mesh>
            ))
          : null}
      </Stage3D>

      {readout > 0 ? (
        <AbsoluteFill style={{ pointerEvents: "none", opacity: readout }}>
          {/* The line, kept — but as a line, not as the entire frame. */}
          <div style={{ position: "absolute", left: 640, top: 156 }}>
            <Build delay={sec(2.7)}>
              <div
                style={{
                  fontFamily: type.serif,
                  fontStyle: "italic",
                  fontSize: 64,
                  color: color.navy,
                }}
              >
                I don&apos;t know.
              </div>
            </Build>
          </div>

          <div style={{ position: "absolute", left: 640, top: 268, width: 1080 }}>
            <Build delay={sec(2.9)}>
              <Label tone={semantic.abstain}>
                {hero.name} · session {hero.session} · no signal
              </Label>
            </Build>

            {/* Conviction against the frozen gate. */}
            <Build delay={sec(3.1)}>
              <div style={{ marginTop: 30, width: 880 }}>
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
                      width: `${pos(conv) * 100 * grow}%`,
                      borderRadius: 13,
                      background: semantic.abstain,
                    }}
                  />
                  {/* The gate. The bar must visibly fail to reach it. */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${pos(gate) * 100}%`,
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
                    color: "rgba(43,44,48,0.6)",
                  }}
                >
                  <span>
                    has{" "}
                    <strong style={{ color: semantic.abstain }}>
                      {hero.probabilityDisplay}
                    </strong>
                  </span>
                  <span>
                    needs{" "}
                    <strong style={{ color: color.navy }}>
                      {hero.thresholdDisplay}
                    </strong>{" "}
                    — the frozen gate
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: type.mono,
                    fontSize: type.size.strip,
                    letterSpacing: type.trackingCaps,
                    color: "rgba(43,44,48,0.45)",
                  }}
                >
                  scale {LO.toFixed(2)}–{HI.toFixed(2)}, not 0–1
                </div>
              </div>
            </Build>

            {/* The model's own words. */}
            <Build delay={sec(3.6)}>
              <div
                style={{
                  marginTop: 28,
                  maxWidth: 880,
                  fontFamily: type.sans,
                  fontSize: type.size.body,
                  color: "rgba(43,44,48,0.78)",
                  lineHeight: 1.65,
                }}
              >
                {hero.reason}
              </div>
            </Build>

            <Build delay={sec(4.3)}>
              <div style={{ marginTop: 26 }}>
                <Label tone={semantic.abstain}>
                  it declines {abstention.declinedShareDisplay} of holdout sessions ·
                  threshold frozen before the holdout was read
                </Label>
              </div>
            </Build>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
