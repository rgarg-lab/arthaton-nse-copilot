import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Label } from "./primitives";
import { captureManifest } from "../captures.manifest";
import { color, layout, type } from "../theme";

/**
 * A real screen recording of the real app, composited into the reference's
 * rounded frame with a caption strip beneath it (STYLE_SPEC.md §4, item 7).
 *
 * **Frames, not video.** These were `<OffthreadVideo>` until the renderer began
 * blocking indefinitely on the capture beats — processes alive, memory fine,
 * CPU idle, no progress and no error, across three different output modes
 * (BUILD_LOG D7.16). `scripts/extract-capture-frames.mjs` demuxes each
 * recording to numbered JPEGs ahead of time and this draws them with `<Img>`.
 * The pixels are the same recording; only the decode moved out of the render.
 *
 * **There is no mockup path here.** If a capture is missing, this renders an
 * explicit PENDING CAPTURE card naming the file it wants — it does not draw an
 * approximation of the UI. A fabricated demo frame is the one thing the brief
 * forbids outright, and a placeholder that *looks* like the app is how that
 * happens by accident. `scripts/check-captures.mjs` fails if one survives.
 */
export const Capture: React.FC<{
  /** Key into `captures.manifest.ts`. */
  name: string;
  caption: string;
  /** Scale the framed recording within the 1920x1080 field. */
  scale?: number;
  offsetY?: number;
}> = ({ name, caption, scale = 0.82, offsetY = 0 }) => {
  const frame = useCurrentFrame();
  const entry = captureManifest[name];

  // Clamp rather than wrap: if a beat outruns its recording the last frame
  // holds, which is visible as a still rather than as a loop. The one place
  // that happens is declared in extract-capture-frames.mjs.
  const index = entry ? Math.min(Math.max(frame, 0), entry.frames - 1) : 0;
  const file = entry
    ? `frames/${name}/f-${String(index).padStart(4, "0")}.jpg`
    : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 1920 * scale,
          height: 1080 * scale,
          transform: `translateY(${offsetY}px)`,
          borderRadius: layout.radius,
          overflow: "hidden",
          boxShadow: layout.shadow,
          background: color.white,
          position: "relative",
        }}
      >
        {file ? (
          <Img
            src={staticFile(file)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
              background: color.paper,
              gap: 18,
            }}
          >
            <Label tone={color.accent}>Pending capture</Label>
            <div
              style={{
                fontFamily: type.mono,
                fontSize: type.size.body,
                color: color.ink,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontFamily: type.sans,
                fontSize: type.size.label,
                color: "rgba(43,44,48,0.6)",
                maxWidth: 760,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              Deliberately not a mockup. Stage 5 records the real app here; this
              card exists so a missing recording is impossible to mistake for one.
            </div>
          </AbsoluteFill>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <Label tone="rgba(43,44,48,0.65)">{caption}</Label>
      </div>
    </AbsoluteFill>
  );
};
