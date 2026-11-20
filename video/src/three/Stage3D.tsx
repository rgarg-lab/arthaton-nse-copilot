import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { color } from "../theme";

/**
 * The shared 3D stage.
 *
 * The reference is flat 2D motion graphics — no 3D and no parallax in 129
 * sampled frames (STYLE_SPEC.md §4). The brief requires genuine Three.js, so the
 * conflict is resolved in the brief's favour and reconciled by making the 3D
 * obey the reference's measured grammar:
 *
 *   - the same high-key near-white field, so the frames read as the same film
 *   - one saturated accent at roughly the measured 1:9 coverage
 *   - lighting flat enough that geometry reads as diagram, not as render
 *   - one continuous camera move per set piece, and no orbiting
 *
 * Real WebGL, not CSS transforms: everything below is Three.js geometry.
 */
export const Stage3D: React.FC<{
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
}> = ({ children, cameraPosition = [0, 2.2, 9], fov = 38 }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: cameraPosition, fov }}
        gl={{ antialias: true }}
        style={{ backgroundColor: color.bg }}
      >
        {/* Flat, high-key lighting. The reference has no dramatic shading and
            neither does this: the 3D is here to explain, not to impress. */}
        <ambientLight intensity={2.1} />
        <directionalLight position={[6, 10, 7]} intensity={1.5} />
        <directionalLight position={[-6, 4, -4]} intensity={0.5} />
        {children}
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

/**
 * Eased camera travel. One move per set piece, started and finished — the
 * reference's holds are long and still, so the camera arrives and stops rather
 * than drifting continuously.
 */
export const easeInOut = (t: number): number => {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
