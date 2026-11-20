import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../components/primitives";
import { board, headline, universe } from "../data";
import { color, layout, sec, semantic, type } from "../theme";
import { easeInOut, Stage3D } from "./Stage3D";

/**
 * Set piece 2 — the universe grid.
 *
 * The configured basket as a 3D constellation. Node positions are derived
 * deterministically from the ticker list in the artifact, so the geometry is
 * data, not an arranged picture.
 *
 * Two honest details the brief asks for, both read from artifacts:
 *
 *  - **Direction lights nothing.** `latest_signals.json` reports 0 signals and
 *    17 abstentions on the current board. The constellation shows that.
 *  - **One node is missing.** The spec fixes 18 tickers; the committed panel has
 *    17, because TATAMOTORS.NS stopped resolving after the demerger. It is drawn
 *    as an empty outline rather than quietly omitted, because a grid of 17 nodes
 *    captioned "eighteen" is the kind of small lie this project exists to avoid.
 */

/** Deterministic placement from the ticker name — same artifact, same picture. */
const place = (ticker: string, i: number, n: number): [number, number, number] => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / Math.max(n - 1, 1)) * 2;
  const r = Math.sqrt(Math.max(1 - y * y, 0));
  const theta = golden * i;
  const jitter = (ticker.charCodeAt(0) % 7) / 90;
  return [
    Math.cos(theta) * r * (3.2 + jitter),
    y * 2.0,
    Math.sin(theta) * r * (3.2 + jitter),
  ];
};

export const UniverseGrid: React.FC<{ startAt?: number }> = ({ startAt = 0 }) => {
  const frame = useCurrentFrame() - startAt;

  const nodes = universe.tickers.map((t, i) => ({
    ticker: t,
    pos: place(t, i, universe.tickers.length),
    missing: universe.missing.includes(t),
  }));

  // One continuous arc: the camera swings a little and settles. Not an orbit.
  const t = easeInOut(
    interpolate(frame, [0, sec(14)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const angle = -0.42 + t * 0.72;
  const radius = 10.6 - t * 1.6;
  const camera: [number, number, number] = [
    Math.sin(angle) * radius,
    1.9 - t * 0.5,
    Math.cos(angle) * radius,
  ];

  // Beat 3.2 lights the direction head; 3.3 reveals it calls nothing.
  const directionPhase = interpolate(frame, [sec(8), sec(9)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const moveSizePhase = interpolate(frame, [sec(14), sec(15)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Stage3D cameraPosition={camera} fov={42}>
        {nodes.map((n, i) => {
          const appear = interpolate(
            frame,
            [sec(0.5) + i * 3, sec(0.5) + i * 3 + sec(0.45)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (n.missing) {
            // Drawn as an absence: a wireframe with nothing inside it.
            return (
              <mesh key={n.ticker} position={n.pos}>
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshStandardMaterial
                  color={color.ink}
                  wireframe
                  transparent
                  opacity={0.35 * appear}
                />
              </mesh>
            );
          }
          // Direction calls nothing today, so no node ever lights for it.
          const lit = moveSizePhase * 0.9;
          // Node size is this name's real calibrated conviction from today's
          // board, so the constellation is the actual distribution rather than
          // a field of identical dots.
          const sig = board.signals.find((s) => s.ticker === n.ticker);
          const radius = 0.14 + Math.abs((sig?.probabilityUp ?? 0.5) - 0.5) * 2.6;
          return (
            <group key={n.ticker} position={n.pos}>
              <mesh>
                <sphereGeometry args={[radius, 24, 24]} />
                <meshStandardMaterial
                  color={lit > 0.1 ? semantic.validation : color.navy}
                  transparent
                  opacity={(0.3 + 0.6 * lit) * appear}
                  emissive={semantic.validation}
                  emissiveIntensity={lit * 0.5}
                  roughness={0.6}
                />
              </mesh>
              {/* The abstention ring: every name on the board is declined. */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[radius + 0.16, 0.012, 8, 40]} />
                <meshStandardMaterial
                  color={semantic.abstain}
                  transparent
                  opacity={directionPhase * 0.85 * appear}
                  emissive={semantic.abstain}
                  emissiveIntensity={directionPhase * 0.4}
                />
              </mesh>
            </group>
          );
        })}
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 150 }}>
          <Build delay={sec(0.3)}>
            <Label tone={color.navy}>
              {universe.configured} configured · {universe.present} in the committed panel
            </Label>
          </Build>
          {universe.missing.length > 0 ? (
            <Build delay={sec(0.8)}>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.6)",
                  marginTop: 10,
                }}
              >
                {universe.missing.join(", ")} absent — drawn as absent
              </div>
            </Build>
          ) : null}
        </div>

        {frame > sec(8) ? (
          <div style={{ position: "absolute", left: layout.margin, bottom: 200 }}>
            <Build delay={sec(8.1)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    border: `2px solid ${semantic.abstain}`,
                    display: "inline-block",
                  }}
                />
                <Label tone={semantic.abstain}>
                  Direction · {board.signalsEmitted} calls, {board.abstained} abstentions
                </Label>
              </div>
            </Build>
          </div>
        ) : null}

        {frame > sec(14) ? (
          <div style={{ position: "absolute", right: layout.margin, bottom: 200, textAlign: "right" }}>
            <Build delay={sec(14.1)}>
              <Label tone={semantic.validation}>
                Move size · calls {headline.moveSize.coverageDisplay} of sessions
              </Label>
            </Build>
            <Build delay={sec(14.4)}>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.6)",
                  marginTop: 8,
                  letterSpacing: type.trackingCaps,
                }}
              >
                {headline.moveSize.qualifier}
              </div>
            </Build>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
