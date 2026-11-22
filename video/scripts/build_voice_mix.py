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
TARGET_LUFS = -15.6

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

    # Loudness-match to the reference, then limit. Order matters: gaining first
    # and limiting after means the limiter only touches the few peaks that
    # actually exceed the ceiling, rather than the whole track.
    lufs = integrated_lufs(np.stack([x, x], axis=1), SR)["integrated_lufs"]
    gain = 10 ** ((TARGET_LUFS - lufs) / 20.0)
    x = x * gain
    print(f"loudness     {lufs:.2f} LUFS -> {TARGET_LUFS} LUFS  (gain {20 * np.log10(gain):+.2f} dB)")

    ceiling = 10 ** (PEAK_CEILING_DBFS / 20.0)
    peak = float(np.abs(x).max())
    if peak > ceiling:
        x = x * (ceiling / peak)
        print(f"peak         {20 * np.log10(peak):.2f} dBFS -> {PEAK_CEILING_DBFS} dBFS")
        # Scaling for peak pulls loudness back down; report where it landed
        # rather than claiming the target was hit.
        final = integrated_lufs(np.stack([x, x], axis=1), SR)["integrated_lufs"]
        print(f"loudness     settled at {final:.2f} LUFS after peak limiting")

    dest = ROOT / "audio" / "mix.wav"
    stereo = np.stack([x, x], axis=1)
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
