"""Turn a real recorded voice-over into the film's shipped audio track.

This exists because `build_audio.py` could not do it. Its `WITH_VOICE=1` flag
*synthesises* a voice with TTS — the comment above the flag says "use that once
a real take exists at audio/vo-take.wav", but no code path ever reads that file.
Running it with a recording on disk would have quietly rebuilt the same TTS the
author rejected, under the music bed they also rejected.

So this is deliberately narrow:

  * voice only, no bed, no ducking — the bed was rejected three times
  * no synthesis anywhere; if the take is missing it stops rather than inventing
  * fitted to the composition's real length, read from `src/theme.ts`
  * normalised to the reference's measured loudness, peak-limited below the
    ceiling that AAC encoding is known to overshoot

Usage:

    python scripts/build_voice_mix.py                    # audio/vo-take.wav
    python scripts/build_voice_mix.py path/to/take.wav

Then set `mix: "audio/mix.wav"` in `src/audio.manifest.ts` and re-encode with
`NO_AUDIO=0 npm run render`. That reuses the frames already on disk, so the
film is not re-rendered.

Reports, but does not silently fix, two things worth knowing before shipping:
a take that does not match the 190 s timeline, and clipping in the raw
recording. Both want a human decision.
"""
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "analysis"))

import imageio_ffmpeg  # noqa: E402
from audio_profile import integrated_lufs  # noqa: E402

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

# The reference's measured integrated loudness. Matching it is what the
# comparison's audio row is actually checking.
# `loudnorm` gates on speech, so a take with long pauses measures quieter at the
# output than the figure asked for. Overridable because the correction depends on
# the take: this one needed +1.4 dB to land on the reference's -15.6.
TARGET_LUFS = float(os.environ.get("TARGET_LUFS", -15.6))

# Build to -1.6 dBFS, not -1.0. A mix built to -1.0 measured -0.79 after AAC
# encoding once already: the codec's reconstruction overshoots the sample peak,
# and a true peak above -1.0 fails the gate (BUILD_LOG D8.3).
PEAK_CEILING_DBFS = -1.6


def duration_s() -> float:
    """The composition's length, read from theme.ts — never restated here."""
    theme = (ROOT / "src" / "theme.ts").read_text(encoding="utf-8")
    m = re.search(r"export const DURATION_S = (\d+)", theme)
    if not m:
        raise SystemExit("could not read DURATION_S from src/theme.ts")
    return float(m.group(1))


def load(src: Path) -> np.ndarray:
    """Decode any input to mono float64 at 48 kHz, via ffmpeg."""
    tmp = ROOT / ".vo-decoded.wav"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", str(tmp)],
        check=True,
    )
    with wave.open(str(tmp), "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    tmp.unlink(missing_ok=True)
    return x.astype(np.float64) / 32768.0


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "audio" / "vo-take.wav"
    if not src.exists():
        raise SystemExit(
            f"no recording at {src}\n"
            f"Record the script in audio/READ_ALOUD.md straight through and save it "
            f"there. Nothing is synthesised as a stand-in."
        )

    want = duration_s()
    x = load(src)
    got = len(x) / SR
    print(f"take         {src.name}  {got:.1f} s")
    print(f"timeline     {want:.1f} s")

    raw_peak = float(np.abs(x).max())
    if raw_peak >= 0.999:
        print("WARNING: the recording clips at full scale. Limiting cannot undo that — "
              "it is already lost. Consider re-recording further from the mic.",
              file=sys.stderr)

    # Fit to the timeline. A short take is padded with digital silence at the
    # end; a long one is reported and trimmed. Neither is time-stretched —
    # stretching speech to hit a mark is audible and makes the delivery worse
    # than the drift it fixes.
    n = int(round(want * SR))
    if len(x) < n:
        short = (n - len(x)) / SR
        if short > 3.0:
            print(f"NOTE: take is {short:.1f} s short; padding the tail with silence. "
                  f"If the drift accumulated earlier the lines will sit ahead of the "
                  f"picture — check against the checkpoints in READ_ALOUD.md.")
        x = np.concatenate([x, np.zeros(n - len(x))])
    elif len(x) > n:
        over = (len(x) - n) / SR
        print(f"NOTE: take is {over:.1f} s long; trimming the tail. Anything spoken "
              f"after {want:.0f} s is lost — confirm the last line survives.")
        x = x[:n]

    # Loudness-match with a real limiter, not by scaling.
    #
    # The first version applied a gain to hit the target LUFS and then scaled
    # the whole track down so its highest sample sat under the ceiling. On a
    # synthetic test tone that is fine. On an actual recording it is useless:
    # a handful of plosives and mic bumps peaked at +7.9 dBFS, so scaling to
    # -1.6 dBFS dragged the programme loudness to -25 LUFS — nearly ten dB
    # under target, and audibly too quiet to hear over nothing.
    #
    # `loudnorm` is EBU R128 with a proper look-ahead limiter: it rides the
    # transients instead of punishing everything else for them. Two passes,
    # because the single-pass version guesses and lands a decibel or two off.
    import json as _json

    wav_in = ROOT / ".vo-normalising.wav"
    with wave.open(str(wav_in), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

    filt = f"loudnorm=I={TARGET_LUFS}:TP={PEAK_CEILING_DBFS}:LRA=11"
    probe = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(wav_in), "-af", f"{filt}:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    measured = _json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    print(f"measured     {float(measured['input_i']):.2f} LUFS, true peak "
          f"{float(measured['input_tp']):.2f} dBTP")

    second = (
        f"{filt}:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
        f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
        f":offset={measured['target_offset']}:linear=true"
    )
    wav_out = ROOT / ".vo-normalised.wav"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-i", str(wav_in), "-af", second,
         "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", str(wav_out)],
        check=True,
    )
    wav_in.unlink(missing_ok=True)

    with wave.open(str(wav_out), "rb") as w:
        stereo = (
            np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            .astype(np.float64)
            .reshape(-1, 2)
            / 32768.0
        )
    wav_out.unlink(missing_ok=True)

    final = integrated_lufs(stereo, SR)["integrated_lufs"]
    print(f"normalised   {final:.2f} LUFS, peak "
          f"{20 * np.log10(max(float(np.abs(stereo).max()), 1e-9)):.2f} dBFS")

    # Final linear trim onto the target.
    #
    # loudnorm's limiter makes its own output non-linear in the target: asking
    # for +1.4 dB moved the measured result by +0.6. Rather than hunt for the
    # input that lands on the number, measure what came out and close the gap
    # with a plain gain — safe here because the limiter leaves several dB of
    # headroom under the ceiling. Skipped if it would breach that ceiling.
    gap = TARGET_LUFS - final
    peak_now = 20 * np.log10(max(float(np.abs(stereo).max()), 1e-9))
    if abs(gap) > 0.05 and peak_now + gap <= PEAK_CEILING_DBFS:
        stereo = stereo * (10 ** (gap / 20.0))
        trimmed = integrated_lufs(stereo, SR)["integrated_lufs"]
        print(f"trimmed      {gap:+.2f} dB -> {trimmed:.2f} LUFS, peak "
              f"{20 * np.log10(max(float(np.abs(stereo).max()), 1e-9)):.2f} dBFS")
    elif abs(gap) > 0.05:
        print(f"NOTE: {gap:+.2f} dB short of target but trimming would breach the "
              f"{PEAK_CEILING_DBFS} dBFS ceiling; left as is.")

    dest = ROOT / "audio" / "mix.wav"
    with wave.open(str(dest), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype(np.int16).tobytes())

    print(f"\nwrote {dest}  ({dest.stat().st_size / 1e6:.1f} MB)")
    print("next:  set mix: \"audio/mix.wav\" in src/audio.manifest.ts")
    print("       NO_AUDIO=0 npm run render     (re-encode only, frames are on disk)")


if __name__ == "__main__":
    main()
