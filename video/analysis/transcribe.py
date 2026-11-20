"""Stage 0.3 (words) — timestamped transcription of the reference with faster-whisper."""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from faster_whisper import WhisperModel

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).resolve().parent


def to_wav(src: Path, dest: Path):
    subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(src), "-ac", "1", "-ar", "16000",
         "-f", "wav", "-y", str(dest)],
        check=True,
    )


def main(src: Path, model_size: str = "base"):
    wav = HERE / "reference_16k.wav"
    if not wav.exists():
        to_wav(src, wav)

    # faster-whisper's own decoder goes through PyAV, whose installed version
    # rejects the `metadata_errors` kwarg it passes. Decode the 16k mono wav
    # here instead and hand transcribe() the float32 array it ultimately wants.
    import wave

    import numpy as np

    with wave.open(str(wav), "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    audio = pcm.astype(np.float32) / 32768.0

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=False)

    segs, words = [], []
    for s in segments:
        segs.append({"start": round(s.start, 3), "end": round(s.end, 3),
                     "text": s.text.strip(),
                     "avg_logprob": round(s.avg_logprob, 3),
                     "no_speech_prob": round(s.no_speech_prob, 3)})
        for w in (s.words or []):
            words.append({"start": round(w.start, 3), "end": round(w.end, 3),
                          "word": w.word.strip()})

    voiced = sum(s["end"] - s["start"] for s in segs)
    total_words = sum(len(s["text"].split()) for s in segs)
    out = {
        "source": str(src),
        "model": model_size,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration_s": round(info.duration, 3),
        "segment_count": len(segs),
        "word_count": total_words,
        "voiced_s": round(voiced, 3),
        "voiced_share": round(voiced / info.duration, 3) if info.duration else None,
        "wpm_over_voiced": round(total_words / (voiced / 60.0), 1) if voiced else None,
        "wpm_over_runtime": round(total_words / (info.duration / 60.0), 1),
        "mean_segment_logprob": round(
            sum(s["avg_logprob"] for s in segs) / max(len(segs), 1), 3),
        "segments": segs,
        "words": words,
    }
    (HERE / "transcript.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items()
                      if k not in ("segments", "words")}, indent=2))
    for s in segs[:8]:
        print(f'  {s["start"]:7.2f}-{s["end"]:7.2f}  {s["text"][:90]}')


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else "base")
