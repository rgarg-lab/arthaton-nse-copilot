import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { DURATION_FRAMES, FPS, HEIGHT, WIDTH } from "./theme";
import { Abstention } from "./three/Abstention";
import { BotLookDev } from "./three/BotLookDev";
import { CalibrationRibbon } from "./three/CalibrationRibbon";
import { ConfidenceLadder } from "./three/ConfidenceLadder";
import { UniverseGrid } from "./three/UniverseGrid";
import { WalkForward } from "./three/WalkForward";
import { sec } from "./theme";

/**
 * Composition registry.
 *
 * `MainComposition` is the submission. The five set pieces are also registered
 * standalone so each can be opened and scrubbed on its own in the studio, which
 * is Stage 3's acceptance condition.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MainComposition"
      component={Main}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />

    <Composition
      id="LookDev-Copilot"
      component={BotLookDev}
      durationInFrames={sec(6)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />

    <Composition
      id="SetPiece-WalkForward"
      component={WalkForward}
      durationInFrames={sec(20)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="SetPiece-UniverseGrid"
      component={UniverseGrid}
      durationInFrames={sec(20)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="SetPiece-CalibrationRibbon"
      component={CalibrationRibbon}
      durationInFrames={sec(6)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="SetPiece-Abstention"
      component={Abstention}
      durationInFrames={sec(7)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="SetPiece-ConfidenceLadder"
      component={ConfidenceLadder}
      durationInFrames={sec(12)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
