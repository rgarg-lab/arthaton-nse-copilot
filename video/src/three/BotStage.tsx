import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Copilot } from "./Copilot";
import { poseAt } from "../bot/choreography";

/**
 * The Copilot's stage — **one canvas, mounted once, for all 10,800 frames.**
 *
 * This is the architectural point of the whole character. Every scene in this
 * film has historically carried its own `<ThreeCanvas>` (see `Stage3D.tsx`),
 * which means anything living inside one is destroyed and recreated at each
 * beat boundary. A character built that way cannot move *between* beats — it
 * would pop from pose to pose — and continuous presence is the entire ask.
 *
 * So the bot gets its own canvas that never unmounts, layered above the beat
 * content and below `Chrome`/`Captions`. The background is transparent, so the
 * scene underneath shows through and the bot reads as standing in front of it.
 *
 * Lighting matches `Stage3D` (same key, fill and ambient) plus a back rim,
 * which the pale `#F5F5F5` field needs to keep the navy body from going flat.
 */
export const BotStage: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const pose = poseAt(frame / fps);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0.3, 7.4], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ backgroundColor: "transparent" }}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[6, 10, 7]} intensity={1.7} />
        <directionalLight position={[-6, 4, -4]} intensity={0.55} />
        {/* Rim from behind — without it the navy body merges into the pale
            background wherever it overlaps an empty area of the frame. */}
        <directionalLight position={[0, 2, -8]} intensity={0.9} />

        <Copilot pose={pose} frame={frame} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
