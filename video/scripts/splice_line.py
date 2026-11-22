"""Drop a re-recorded line into the existing mix, without redoing the take.

Written when a line looked skipped, kept because the guard in it is the useful
part. It refuses to write into a window that already contains speech — which is
exactly what saved the mix here: two Whisper models both failed to transcribe
line 5.1 and I concluded the author had skipped it, when the energy envelope
showed that span is near-continuous speech with less silence than stretches
either side of it. Treat an ASR transcript as a hint, never as evidence of
absence.

For a line that genuinely is missing: records only into silence, never
time-stretches, matches the loudness of the mix it joins rather than an absolute
target, and reads the window from `src/vo.ts` so the line lands where the
picture expects it.

Usage:

    python scripts/splice_line.py 5.1 path/to/line.m4a

Then re-encode:  NO_AUDIO=0 npm run render
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "analysis"))

import imageio_ffmpeg  # noqa: E402
from audio_profile import integrated_lufs  # noqa: E402
from build_audio import read_vo_lines  # noqa: E402

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
MIX = ROOT / "audio" / "mix.wav"
RAMP_MS = 8


def decode(src: Path) -> np.ndarray:
    tmp = ROOT / ".splice-decoded.wav"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", str(tmp)],
        check=True,
    )
    with wave.open(str(tmp), "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    tmp.unlink(missing_ok=True)
    return x.astype(np.float64) / 32768.0


def trim_silence(x: np.ndarray, floor_ratio: float = 0.04) -> np.ndarray:
    """Strip leading and trailing room tone so the line sits where it is placed."""
    hop = int(0.02 * SR)
    frames = np.array([
        np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(len(x) // hop)
    ])
    if len(frames) == 0 or frames.max() <= 0:
        return x
    voiced = np.flatnonzero(frames > frames.max() * floor_ratio)
    if len(voiced) == 0:
        return x
    a = max(0, (voiced[0] - 4) * hop)
    b = min(len(x), (voiced[-1] + 5) * hop)
    return x[a:b]


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: python scripts/splice_line.py <line-id> <recording>")
    line_id, src = sys.argv[1], Path(sys.argv[2])
    if not src.exists():
        raise SystemExit(f"no recording at {src}")
    if not MIX.exists():
        raise SystemExit(f"no mix at {MIX} — run scripts/build_voice_mix.py first")

    line = next((l for l in read_vo_lines() if l["id"] == line_id), None)
    if line is None:
        raise SystemExit(f"no line {line_id} in src/vo.ts")
    start, end = float(line["from"]), float(line["to"])
    print(f"line {line_id}  {start:.0f}-{end:.0f}s  ({end - start:.0f}s window)")
    print(f"  \"{line['text'][:90]}…\"")

    with wave.open(str(MIX), "rb") as w:
        assert w.getnchannels() == 2 and w.getframerate() == SR
        mix = (
            np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            .astype(np.float64)
            .reshape(-1, 2) / 32768.0
        )

    a, b = int(start * SR), int(end * SR)
    window = mix[a:b, 0]
    rms = float(np.sqrt(np.mean(window ** 2)))
    peak = float(np.abs(window).max())
    print(f"  existing audio in that window: rms {rms:.5f}, peak {peak:.4f}")
    if peak > 0.02:
        raise SystemExit(
            "there is already speech in that window — refusing to overwrite it. "
            "If the line really was re-recorded, clear it deliberately first."
        )

    patch = trim_silence(decode(src))
    room = b - a
    if len(patch) > room:
        raise SystemExit(
            f"the recording is {len(patch) / SR:.1f}s but the window is "
            f"{room / SR:.1f}s. Say it a little faster, or trim the take — this "
            f"will not time-stretch your voice to fit."
        )

    # Match the mix it is joining rather than an absolute target, so the splice
    # does not sit louder or quieter than the lines either side of it.
    mix_lufs = integrated_lufs(mix, SR)["integrated_lufs"]
    patch_lufs = integrated_lufs(np.stack([patch, patch], axis=1), SR)["integrated_lufs"]
    gain = 10 ** ((mix_lufs - patch_lufs) / 20.0)
    patch = patch * gain
    print(f"  patch {patch_lufs:.2f} -> {mix_lufs:.2f} LUFS ({20 * np.log10(gain):+.2f} dB)")

    ramp = int(RAMP_MS / 1000 * SR)
    if len(patch) > 2 * ramp:
        patch[:ramp] *= np.linspace(0, 1, ramp)
        patch[-ramp:] *= np.linspace(1, 0, ramp)

    # Centre the line in its window: a line that starts the instant the beat
    # does sounds clipped on.
    offset = a + max(0, (room - len(patch)) // 3)
    mix[offset:offset + len(patch), 0] += patch
    mix[offset:offset + len(patch), 1] += patch
    print(f"  placed at {offset / SR:.2f}s, {len(patch) / SR:.1f}s long")

    with wave.open(str(MIX), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())

    final = integrated_lufs(mix, SR)["integrated_lufs"]
    print(f"\nrewrote {MIX.name} — {final:.2f} LUFS overall")
    print("next:  NO_AUDIO=0 npm run render     (re-encode only)")


if __name__ == "__main__":
    main()
