import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label } from "../components/primitives";
import { walkForward } from "../data";
import { color, layout, sec, semantic, type } from "../theme";
import { easeInOut, Stage3D } from "./Stage3D";

/**
 * Set piece 1 — the purged walk-forward timeline. The money shot, and built
 * first because it is the one that explains the project's core rigour.
 *
 * Four expanding training blocks march along a 3D time axis. Between each train
 * block and its validation fold there is a visible glowing gap: the five-session
 * embargo. Each fold lights in turn. The final holdout sits behind a vault that
 * opens exactly once — which is the literal truth recorded in the committed
 * ledger, not a metaphor.
 *
 * Every dimension comes from `data.ts`. The train blocks are scaled by their
 * real row counts, so the expanding window is the actual expansion.
 */

/**
 * Layout. The fold region and the holdout region are laid out separately so the
 * sealed holdout always has room on the right rather than being pushed off the
 * frame by whichever fold happens to be longest.
 */
const AXIS_LEFT = -5.3;
const FOLD_RIGHT = 2.5;
const HOLDOUT_LEFT = 3.1;
const HOLDOUT_RIGHT = 5.2;
const ROW_Y = (i: number) => 1.55 - i * 0.95;

const Block: React.FC<{
  x: number;
  width: number;
  y: number;
  tone: string;
  opacity: number;
  depth?: number;
  height?: number;
}> = ({ x, width, y, tone, opacity, depth = 0.5, height = 0.52 }) => (
  <mesh position={[x + width / 2, y, 0]}>
    <boxGeometry args={[Math.max(width, 0.001), height, depth]} />
    <meshStandardMaterial color={tone} transparent opacity={opacity} roughness={0.85} />
  </mesh>
);

export const WalkForward: React.FC<{ startAt?: number }> = ({ startAt = 0 }) => {
  const frame = useCurrentFrame() - startAt;

  const folds = walkForward.folds;
  // Within the fold region, length is proportional to real row counts, so the
  // expanding window on screen is the actual expansion in the artifact.
  const widest = Math.max(...folds.map((f) => f.trainRows + f.valRows));
  const EMBARGO_W = 0.22;
  const unit = (FOLD_RIGHT - AXIS_LEFT - EMBARGO_W) / widest;
  const foldIn = (i: number) => sec(1.4) + i * sec(1.15);

  // One continuous camera move: a slow push in and slight descent, eased, that
  // arrives and stops. No orbiting.
  const t = easeInOut(interpolate(frame, [0, sec(11)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const camera: [number, number, number] = [0, 3.1 - t * 1.3, 13.2 - t * 2.4];

  /**
   * The vault opens on beat 5.2's line, not before it.
   *
   * This set piece spans beats 5.1 and 5.2 (110-130 s) as one continuous camera
   * move. 5.2's VO — "then one final holdout, read exactly once" — starts at
   * 122 s, i.e. 12 s into the sequence. An earlier version opened the vault at
   * 7.6 s, so the picture gave away the reveal four seconds before the line
   * arrived.
   */
  const vaultOpen = easeInOut(
    interpolate(frame, [sec(12.0), sec(13.6)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill>
      <Stage3D cameraPosition={camera} fov={40}>
        {/* The time axis itself. */}
        <mesh
          position={[
            (AXIS_LEFT + HOLDOUT_RIGHT) / 2,
            ROW_Y(folds.length - 1) - 0.66,
            0,
          ]}
        >
          <boxGeometry args={[HOLDOUT_RIGHT - AXIS_LEFT, 0.02, 0.02]} />
          <meshStandardMaterial color={color.ink} transparent opacity={0.25} />
        </mesh>

        {folds.map((f, i) => {
          const appear = interpolate(frame, [foldIn(i), foldIn(i) + sec(0.5)], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const trainW = f.trainRows * unit;
          const valW = f.valRows * unit;
          const y = ROW_Y(i);
          const embargoX = AXIS_LEFT + trainW;
          const valX = embargoX + EMBARGO_W;

          // The embargo pulses: it is the detail that is invisible in every
          // other project's diagram and is the reason this split is valid.
          const pulse =
            0.55 +
            0.45 *
              Math.sin((frame - foldIn(i)) / 7) ** 2 *
              Number(frame > foldIn(i));

          return (
            <group key={f.key}>
              <Block
                x={AXIS_LEFT}
                width={trainW * appear}
                y={y}
                tone={semantic.holdout}
                opacity={0.92 * appear}
              />
              {/* The five-session embargo, as a visible glowing gap. */}
              <mesh position={[embargoX + EMBARGO_W / 2, y, 0]}>
                <boxGeometry args={[EMBARGO_W, 0.56, 0.52]} />
                <meshStandardMaterial
                  color={semantic.abstain}
                  transparent
                  opacity={0.9 * appear * pulse}
                  emissive={semantic.abstain}
                  emissiveIntensity={0.55 * pulse}
                />
              </mesh>
              {/* Validation uses the measured panel blue rather than the link
                  blue: against the navy train block the link blue is nearly the
                  same value and the two read as one bar. */}
              <Block
                x={valX}
                width={valW * appear}
                y={y}
                tone={color.panel}
                opacity={0.98 * appear}
              />
            </group>
          );
        })}

        {/* The final holdout, sealed behind a vault that opens exactly once. */}
        {(() => {
          const w = HOLDOUT_RIGHT - HOLDOUT_LEFT;
          const h = (folds.length - 1) * 0.95 + 0.62;
          const cy = (ROW_Y(0) + ROW_Y(folds.length - 1)) / 2;
          return (
            <group>
              <Block
                x={HOLDOUT_LEFT}
                width={w}
                y={cy}
                tone={semantic.abstain}
                opacity={0.22 + 0.72 * vaultOpen}
                height={h}
                depth={0.52}
              />
              {/* Two leaves that part, once — and are fully gone when open, so
                  the opened vault is a clean reveal rather than a stack of
                  translucent slabs. */}
              {vaultOpen < 0.995
                ? [-1, 1].map((dir) => (
                    <mesh
                      key={dir}
                      position={[
                        HOLDOUT_LEFT + w / 2 + dir * vaultOpen * w * 0.75,
                        cy,
                        0.34,
                      ]}
                    >
                      <boxGeometry args={[w / 2, h, 0.1]} />
                      <meshStandardMaterial
                        color={color.navy}
                        transparent
                        opacity={1 - vaultOpen}
                        roughness={0.7}
                      />
                    </mesh>
                  ))
                : null}
            </group>
          );
        })()}
      </Stage3D>

      {/* 2D annotation over the 3D, in the reference's label treatment. */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: layout.margin, top: 150 }}>
          <Build delay={sec(0.4)}>
            <Label tone={color.navy}>Purged walk-forward · split on dates</Label>
          </Build>
        </div>

        <div
          style={{
            position: "absolute",
            left: layout.margin,
            bottom: 190,
            display: "flex",
            gap: 40,
          }}
        >
          {[
            { k: "train", t: semantic.holdout, l: "Train — expanding" },
            { k: "embargo", t: semantic.abstain, l: `${walkForward.embargoSessions}-session embargo` },
            { k: "val", t: color.panel, l: "Validation fold" },
          ].map((item, i) => (
            <Build key={item.k} delay={sec(1.2) + i * sec(0.18)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: item.t,
                    display: "inline-block",
                  }}
                />
                <Label tone="rgba(43,44,48,0.7)">{item.l}</Label>
              </div>
            </Build>
          ))}
        </div>

        {frame > sec(12.2) ? (
          <div style={{ position: "absolute", right: layout.margin, top: 150, textAlign: "right" }}>
            <Build delay={sec(12.3)}>
              <Label tone={semantic.abstain}>
                Final holdout · {walkForward.holdout.rowsDisplay} rows
              </Label>
            </Build>
            <Build delay={sec(12.6)}>
              <div
                style={{
                  fontFamily: type.mono,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.65)",
                  marginTop: 10,
                  lineHeight: 1.7,
                }}
              >
                read {walkForward.ledger.authoritativeReads}× authoritative
                <br />
                hash {walkForward.ledger.contentHash}
                <br />
                model {walkForward.ledger.modelFingerprint}
              </div>
            </Build>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
