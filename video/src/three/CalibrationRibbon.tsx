import React from "react";
import * as THREE from "three";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../components/primitives";
import { calibration } from "../data";
import { color, layout, sec, semantic, type } from "../theme";
import { easeInOut, Stage3D } from "./Stage3D";

/**
 * Set piece 3 — the calibration ribbon.
 *
 * The calibration curve as a ribbon in 3D that settles onto the diagonal. The
 * diagonal is perfect calibration; the ribbon is what the model actually did on
 * the holdout, bin by bin, straight from `metrics.json`.
 *
 * Only the five populated bins are drawn. A well-behaved model on this problem
 * concentrates near 0.5, so the empty bins are empty for a reason and inventing
 * a smooth curve across them would be a lie about where the data is.
 */
export const CalibrationRibbon: React.FC<{ startAt?: number }> = ({ startAt = 0 }) => {
  const frame = useCurrentFrame() - startAt;

  const settle = easeInOut(
    interpolate(frame, [sec(0.4), sec(3.2)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  /**
   * The axis is fitted to the populated bins rather than to [0,1]. Only five of
   * ten bins have any rows in them — a well-behaved model on this problem
   * concentrates near 0.5 — so a full 0-1 axis would put the entire measurement
   * in one corner of the frame. The rendered domain is stated on screen.
   */
  const DOMAIN: [number, number] = [0.25, 0.7];
  const SCALE = 11.5;
  const mid = (DOMAIN[0] + DOMAIN[1]) / 2;
  const toWorld = (predicted: number, observed: number): [number, number, number] => [
    (predicted - mid) * SCALE,
    (observed - mid) * SCALE,
    0,
  ];

  // The ribbon starts flat on the diagonal's plane and settles to the measured
  // observed rate: the animation is the difference between claim and outcome.
  const points = calibration.points.map((p) => {
    const observed = p.predicted + (p.observed - p.predicted) * settle;
    return { ...p, world: toWorld(p.predicted, observed) };
  });

  const t = easeInOut(
    interpolate(frame, [0, sec(5.5)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  // Framed on the ribbon's own centre of mass rather than on the world origin:
  // the populated bins sit below the diagonal, so centring on (0,0) would push
  // the measurement into the lower-left corner.
  const camera: [number, number, number] = [1.2 - t * 1.2, -0.85, 10.6 - t * 1.4];

  const maxN = Math.max(...calibration.points.map((p) => p.n));

  return (
    <AbsoluteFill>
      <Stage3D cameraPosition={camera} fov={38}>
        {/* Perfect calibration. Drawn as thin geometry rather than a GL line so
            it has a dependable weight at 1920 wide. */}
        <mesh
          position={[0, 0, -0.05]}
          rotation={[0, 0, Math.PI / 4]}
        >
          <boxGeometry args={[(DOMAIN[1] - DOMAIN[0]) * SCALE * 1.414, 0.035, 0.02]} />
          <meshStandardMaterial color={color.ink} transparent opacity={0.4} />
        </mesh>

        {/* The ribbon: one quad per adjacent pair of populated bins. */}
        {points.slice(0, -1).map((p, i) => {
          const q = points[i + 1];
          const h = 0.34;
          const verts = new Float32Array([
            p.world[0], p.world[1] - h, 0,
            q.world[0], q.world[1] - h, 0,
            q.world[0], q.world[1] + h, 0,
            p.world[0], p.world[1] - h, 0,
            q.world[0], q.world[1] + h, 0,
            p.world[0], p.world[1] + h, 0,
          ]);
          return (
            <mesh key={p.bin}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[verts, 3]}
                  count={6}
                  itemSize={3}
                />
              </bufferGeometry>
              <meshStandardMaterial
                color={semantic.holdout}
                transparent
                opacity={0.72}
                side={THREE.DoubleSide}
                roughness={0.8}
              />
            </mesh>
          );
        })}

        {/* Each populated bin as a node sized by how many rows are in it. */}
        {points.map((p) => (
          <mesh key={`n${p.bin}`} position={p.world}>
            <sphereGeometry args={[0.1 + 0.26 * (p.n / maxN), 20, 20]} />
            <meshStandardMaterial
              color={semantic.abstain}
              emissive={semantic.abstain}
              emissiveIntensity={0.25}
              roughness={0.6}
            />
          </mesh>
        ))}
      </Stage3D>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 150 }}>
          <Build delay={sec(0.2)}>
            <Label tone={color.navy}>Calibration · {calibration.method}</Label>
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
              predicted vs observed, axis {DOMAIN[0]}–{DOMAIN[1]} · the diagonal is
              perfect calibration · node size is rows in the bin
            </div>
          </Build>
        </div>
        <div style={{ position: "absolute", right: layout.margin, top: 150, textAlign: "right" }}>
          <Build delay={sec(2.6)}>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.headline,
                fontWeight: type.weight.hero,
                color: color.navy,
              }}
            >
              ECE {calibration.eceDisplay}
            </div>
          </Build>
          <Build delay={sec(2.9)}>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.body,
                color: "rgba(43,44,48,0.6)",
                marginTop: 8,
              }}
            >
              max {calibration.maxCeDisplay} · {calibration.populatedBins} of 10 bins populated
            </div>
          </Build>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
