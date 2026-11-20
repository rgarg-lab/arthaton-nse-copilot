/**
 * The audio the render plays. This is the one place an audio path appears.
 *
 * `mix.wav` is what ships, not the stems. The mix is loudness-normalised and
 * soft-limited by `scripts/build_audio.py`, so letting Remotion sum separate
 * bed and voice tracks would re-create the peaks the limiter just removed and
 * the rendered file would no longer be the file that was measured.
 *
 * **Swapping in the author's recorded voice-over:** drop the take into
 * `audio/vo-take.wav`, point `build_audio.py` at it instead of the TTS, and
 * re-run it. The mix is rebuilt, the captions already come from `src/vo.ts`,
 * and nothing in the edit moves. See `audio/VO_SCRIPT.md` and `HUMAN_TASKS.md`.
 */
export const audioManifest: {
  mix: string | null;
  gain: number;
} = {
  // Outside `public/` on purpose: the video renders muted and ffmpeg muxes
  // `audio/mix.wav` in afterwards, so shipping a 33 MB wav into every render
  // bundle bought nothing. Point this at a file under `public/` if you ever
  // want audio previewing in the studio.
  mix: null,
  gain: 1,
};
