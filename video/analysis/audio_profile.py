"""Stage 0.3 (everything else) — decode to PCM and measure the audio in numpy/scipy.

RMS loudness envelope, dynamic range, an integrated-loudness estimate on the
ITU-R BS.1770 K-weighted model, tempo via onset-envelope autocorrelation,
spectral centroid and band balance, and speech-band energy used to separate
voiced stretches from music-only ones.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from scipy import signal

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).resolve().parent
SR = 48000


def decode(src: Path, dest: Path) -> np.ndarray:
    if not dest.exists():
        subprocess.run(
            [FFMPEG, "-v", "error", "-i", str(src), "-ac", "2", "-ar", str(SR),
             "-f", "wav", "-y", str(dest)],
            check=True,
        )
    with wave.open(str(dest), "rb") as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        ch = w.getnchannels()
    return pcm.astype(np.float64).reshape(-1, ch) / 32768.0


def k_weight(x: np.ndarray, sr: int) -> np.ndarray:
    """BS.1770 two-stage K-weighting: a shelving filter then a high-pass."""
    # Stage 1 — high-shelf (+4 dB above ~1.5 kHz), coefficients for 48 kHz.
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    # Stage 2 — RLB high-pass at ~38 Hz.
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    if sr != 48000:  # coefficients above are defined at 48 kHz
        raise ValueError("K-weighting coefficients assume 48 kHz")
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def integrated_lufs(x: np.ndarray, sr: int) -> dict:
    """Gated integrated loudness, BS.1770-4: 400 ms blocks, 75% overlap,
    absolute gate at -70 LUFS then a relative gate 10 LU below the ungated mean."""
    y = k_weight(x, sr)
    block, hop = int(0.4 * sr), int(0.1 * sr)
    n = (len(y) - block) // hop + 1
    # Channel weights G = 1.0 for L and R.
    powers = np.array([
        np.mean(y[i * hop:i * hop + block] ** 2, axis=0).sum()
        for i in range(max(n, 0))
    ])
    with np.errstate(divide="ignore"):
        lk = -0.691 + 10 * np.log10(np.maximum(powers, 1e-12))

    keep = lk > -70.0
    if not keep.any():
        return {"integrated_lufs": None}
    rel = -0.691 + 10 * np.log10(powers[keep].mean()) - 10.0
    keep2 = keep & (lk > rel)
    integrated = -0.691 + 10 * np.log10(powers[keep2].mean()) if keep2.any() else None

    # Short-term (3 s) and momentary (400 ms) spreads, and loudness range.
    st_block = int(3.0 * sr)
    st_n = (len(y) - st_block) // hop + 1
    st = np.array([
        -0.691 + 10 * np.log10(max(np.mean(
            y[i * hop:i * hop + st_block] ** 2, axis=0).sum(), 1e-12))
        for i in range(max(st_n, 0))
    ])
    st_gated = st[st > -70.0]
    lra = (float(np.percentile(st_gated, 95) - np.percentile(st_gated, 10))
           if st_gated.size else None)

    return {
        "integrated_lufs": round(float(integrated), 2) if integrated is not None else None,
        "momentary_max_lufs": round(float(lk.max()), 2),
        "short_term_max_lufs": round(float(st.max()), 2) if st.size else None,
        "loudness_range_lu": round(lra, 2) if lra is not None else None,
        "gating": "BS.1770-4 absolute -70 LUFS + relative -10 LU",
    }


def band_energy(mono: np.ndarray, sr: int) -> dict:
    f, pxx = signal.welch(mono, sr, nperseg=8192)
    total = pxx.sum()
    bands = {
        "sub_20_60": (20, 60), "bass_60_250": (60, 250),
        "low_mid_250_500": (250, 500), "mid_500_2k": (500, 2000),
        "upper_mid_2k_4k": (2000, 4000), "presence_4k_8k": (4000, 8000),
        "air_8k_16k": (8000, 16000),
    }
    out = {}
    for name, (lo, hi) in bands.items():
        m = (f >= lo) & (f < hi)
        out[name] = round(float(pxx[m].sum() / total), 4)
    centroid = float((f * pxx).sum() / total)
    cum = np.cumsum(pxx) / total
    return {
        "band_share_of_power": out,
        "spectral_centroid_hz": round(centroid, 1),
        "rolloff_85pct_hz": round(float(f[np.searchsorted(cum, 0.85)]), 1),
        "rolloff_95pct_hz": round(float(f[np.searchsorted(cum, 0.95)]), 1),
    }


def tempo(mono: np.ndarray, sr: int) -> dict:
    """Onset-envelope autocorrelation over a 60-200 BPM search range."""
    hop = 512
    f, t, S = signal.spectrogram(mono, sr, nperseg=2048, noverlap=2048 - hop,
                                 mode="magnitude")
    logS = np.log1p(S)
    flux = np.maximum(np.diff(logS, axis=1), 0).sum(axis=0)
    flux = flux - flux.mean()
    fps = sr / hop
    ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
    lo, hi = int(fps * 60 / 200), int(fps * 60 / 60)   # 200 BPM .. 60 BPM
    lag = int(np.argmax(ac[lo:hi])) + lo
    bpm = 60.0 * fps / lag
    peak = float(ac[lag] / ac[0]) if ac[0] else 0.0
    return {
        "bpm_estimate": round(bpm, 1),
        "autocorrelation_peak_ratio": round(peak, 3),
        "method": "spectral-flux onset envelope, autocorrelation peak in 60-200 BPM",
        "confidence_note": (
            "peak ratio below ~0.15 means no strong periodic pulse was found; "
            "treat the BPM as weak evidence"
        ),
    }


def main(src: Path):
    x = decode(src, HERE / "reference_48k.wav")
    mono = x.mean(axis=1)
    dur = len(mono) / SR

    win, hop = int(0.05 * SR), int(0.01 * SR)
    n = (len(mono) - win) // hop + 1
    rms = np.array([np.sqrt(np.mean(mono[i * hop:i * hop + win] ** 2))
                    for i in range(n)])
    rms_db = 20 * np.log10(np.maximum(rms, 1e-9))

    # Speech-band (300-3400 Hz) energy ratio, framed, to separate voiced
    # stretches from music-only ones without using the transcript.
    sos = signal.butter(4, [300, 3400], btype="band", fs=SR, output="sos")
    sp = signal.sosfilt(sos, mono)
    sp_rms = np.array([np.sqrt(np.mean(sp[i * hop:i * hop + win] ** 2))
                       for i in range(n)])
    ratio = sp_rms / np.maximum(rms, 1e-9)
    active = rms_db > (np.percentile(rms_db, 95) - 35)
    voiced = active & (ratio > 0.55)

    tr_path = HERE / "transcript.json"
    vo_ref = {}
    if tr_path.exists():
        tr = json.loads(tr_path.read_text(encoding="utf-8"))
        vo_ref = {
            "wpm_over_runtime": tr["wpm_over_runtime"],
            "wpm_over_voiced": tr["wpm_over_voiced"],
            "voiced_share_from_transcript": tr["voiced_share"],
            "word_count": tr["word_count"],
        }
        # Music-only vs under-VO loudness, segmented by the transcript.
        spoken = np.zeros(n, dtype=bool)
        for s in tr["segments"]:
            a, b = int(s["start"] * 100), min(int(s["end"] * 100), n)
            spoken[a:b] = True
        if spoken.any() and (~spoken).any():
            vo_ref["rms_db_under_vo"] = round(float(np.median(rms_db[spoken])), 2)
            vo_ref["rms_db_music_only"] = round(float(np.median(rms_db[~spoken])), 2)
            vo_ref["duck_depth_db"] = round(
                float(np.median(rms_db[~spoken]) - np.median(rms_db[spoken])), 2)

    out = {
        "source": str(src),
        "sample_rate_hz": SR,
        "channels": int(x.shape[1]),
        "duration_s": round(dur, 3),
        "loudness": integrated_lufs(x, SR),
        "rms_envelope": {
            "window_ms": 50, "hop_ms": 10,
            "median_db": round(float(np.median(rms_db)), 2),
            "p10_db": round(float(np.percentile(rms_db, 10)), 2),
            "p90_db": round(float(np.percentile(rms_db, 90)), 2),
            "max_db": round(float(rms_db.max()), 2),
            "dynamic_range_p90_p10_db": round(
                float(np.percentile(rms_db, 90) - np.percentile(rms_db, 10)), 2),
            "crest_factor_db": round(
                float(20 * np.log10(np.abs(mono).max() / np.sqrt((mono ** 2).mean()))), 2),
            "true_peak_dbfs": round(float(20 * np.log10(np.abs(x).max())), 2),
        },
        "activity": {
            "active_share": round(float(active.mean()), 3),
            "speech_band_share": round(float(voiced.mean()), 3),
            "silence_share": round(float((~active).mean()), 3),
            "method": (
                "frame active if RMS within 35 dB of the 95th percentile; "
                "voiced if additionally 300-3400 Hz RMS is >55% of broadband RMS"
            ),
        },
        "spectrum": band_energy(mono, SR),
        "tempo": tempo(mono, SR),
        "vo": vo_ref,
        "rms_db_series_1hz": [
            round(float(np.median(rms_db[i * 100:(i + 1) * 100])), 2)
            for i in range(int(dur))
        ],
    }
    (HERE / "audio_profile.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "rms_db_series_1hz"},
                     indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
