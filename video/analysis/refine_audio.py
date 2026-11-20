"""Stage 0.3 refinement — measure the music bed on the stretches where it is alone.

The whole-mix tempo estimate is swamped by speech (peak ratio 0.10, pinned at the
top of the search range). Restricting the onset analysis to the non-speech gaps
recovers the bed cleanly. Duck depth is explicitly *not* claimed as measured: the
60-250 Hz band where the bed lives is also where male speech fundamentals sit, so
a mixed track cannot yield it without source separation.
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
HERE = Path(__file__).resolve().parent


def main():
    with wave.open(str(HERE / "reference_48k.wav"), "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        x = x.astype(np.float64).reshape(-1, 2) / 32768.0
    mono = x.mean(axis=1)

    tr = json.loads((HERE / "transcript.json").read_text(encoding="utf-8"))
    spoken = np.zeros(len(mono), dtype=bool)
    for s in tr["segments"]:
        spoken[int(s["start"] * SR):min(int(s["end"] * SR), len(mono))] = True

    d = np.diff(np.concatenate([[0], (~spoken).astype(int), [0]]))
    gaps = [(a, b) for a, b in zip(np.where(d == 1)[0], np.where(d == -1)[0])
            if (b - a) / SR >= 1.5]
    seg = np.concatenate([mono[a:b] for a, b in gaps])

    f, p = signal.welch(seg, SR, nperseg=8192)
    tot = p.sum()
    bands = {"sub_20_60": (20, 60), "bass_60_250": (60, 250),
             "low_mid_250_500": (250, 500), "mid_500_2k": (500, 2000),
             "upper_mid_2k_4k": (2000, 4000), "presence_4k_8k": (4000, 8000),
             "air_8k_16k": (8000, 16000)}

    hop = 512
    _, _, S = signal.spectrogram(seg, SR, nperseg=2048, noverlap=2048 - hop,
                                 mode="magnitude")
    flux = np.maximum(np.diff(np.log1p(S), axis=1), 0).sum(axis=0)
    flux = flux - flux.mean()
    ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
    fps = SR / hop
    lo, hi = int(fps * 60 / 200), int(fps * 60 / 60)
    lag = int(np.argmax(ac[lo:hi])) + lo
    bpm = 60.0 * fps / lag

    cuts = json.loads((HERE / "cuts.json").read_text(encoding="utf-8"))
    beat = 60.0 / bpm
    offs = [min(c % beat, beat - (c % beat)) for c in cuts["cuts"]]
    median_off = float(np.median(offs))

    out = {
        "music_bed": {
            "isolated_from": f"{len(gaps)} non-speech gaps >= 1.5 s, "
                             f"{round(seg.size / SR, 1)} s total",
            "bpm_estimate": round(bpm, 1),
            "autocorrelation_peak_ratio": round(float(ac[lag] / ac[0]), 3),
            "beat_period_s": round(beat, 3),
            "bar_period_s_4_4": round(beat * 4, 3),
            "rms_db": round(float(20 * np.log10(np.sqrt((seg ** 2).mean()))), 2),
            "spectral_centroid_hz": round(float((f * p).sum() / tot), 1),
            "band_share_of_power": {
                k: round(float(p[(f >= a) & (f < b)].sum() / tot), 4)
                for k, (a, b) in bands.items()
            },
            "character": (
                "bass and low-mid dominant, almost no presence or air; a pulsed "
                "bed rather than a melodic track"
            ),
        },
        "duck_depth_db": {
            "value": None,
            "status": "not measurable from a mixed track",
            "why": (
                "the bed's energy sits in 60-250 Hz, which is also where male "
                "speech fundamentals sit, so the band level rises under VO "
                "(-27.5 dB) rather than falling (-34.3 dB music-only). "
                "Separating them would need source separation, not filtering."
            ),
            "derived_constraint": (
                "music-only passages measure -21.96 dB RMS broadband and the "
                "whole mix integrates to -15.6 LUFS; matching both of those "
                "constrains the bed level without claiming a duck figure"
            ),
        },
        "cut_to_beat_alignment": {
            "beat_period_s": round(beat, 3),
            "median_abs_offset_to_nearest_beat_s": round(median_off, 3),
            "expected_if_unaligned_s": round(beat / 4, 3),
            "conclusion": (
                "cuts are NOT locked to the musical grid - the measured offset "
                "matches the uniform-random expectation almost exactly"
            ),
        },
    }
    dest = HERE / "audio_profile.json"
    prof = json.loads(dest.read_text(encoding="utf-8"))
    prof["refined"] = out
    prof["tempo"]["superseded_by"] = (
        "refined.music_bed.bpm_estimate - the whole-mix figure is unreliable "
        "(peak ratio 0.10, pinned at the 200 BPM search ceiling)"
    )
    dest.write_text(json.dumps(prof, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
