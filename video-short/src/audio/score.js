// No soundtrack in this cut.
//
// A silent track is kept rather than ripping the audio path out, because the picture is
// cut for a voice-over that will be added later: the cue sheet in src/timeline.js is
// still the single source of timing, so scoring this film later means writing sections
// against the same cues, not re-timing anything.
//
// The original demo score is preserved at score.demo.js.bak as a worked example of the
// engine's API.
import { toWav as toWavImpl } from './wav.js';

export const SR = 48000;

export async function renderSoundtrack(duration) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  return ctx.startRendering();   // silence, exactly `duration` long
}

export const toWav = toWavImpl;
