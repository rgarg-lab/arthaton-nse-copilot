import React from "react";
import { Audio, staticFile } from "remotion";
import { audioManifest } from "../audio.manifest";

/**
 * The mix.
 *
 * One file, already ducked, loudness-normalised and limited by
 * `scripts/build_audio.py` — so what the render plays is exactly what was
 * measured against the reference. Mixing here instead would undo that.
 *
 * Optional: with no mix present the video renders silent and stays fully
 * legible through the burned-in captions.
 */
export const Soundtrack: React.FC = () =>
  audioManifest.mix ? (
    <Audio src={staticFile(audioManifest.mix)} volume={audioManifest.gain} />
  ) : null;
