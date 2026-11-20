"""Stage 6 — build the scratch voice-over and the music bed.

Two outputs, both written to `public/audio/`:

  vo.wav   a TTS scratch track, one line per `src/vo.ts` entry, placed at that
           entry's timestamp. It exists so the edit can be finished before the
           author's recording does; swapping the real take in is a one-line
           change in `src/audio.manifest.ts`.

  bed.wav  the music bed, **synthesised here rather than licensed**. The
           reference's bed measures as a bass-dominant pulse with almost no
           presence or air (STYLE_SPEC.md §6.2) — not a melodic track — which is
           a thing that can be generated to match the measurement directly. That
           removes the licensing question entirely instead of answering it: there
           is no third-party audio in this video. `CREDITS.md` records that.

The bed is ducked under the voice here rather than in Remotion, so the mix is
deterministic and the same loudness analysis that measured the reference can
measure the result.
"""
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal as sig
from scipy.ndimage import uniform_filter1d


def moving_rms(x: np.ndarray, win: int) -> np.ndarray:
    """Linear-time moving RMS. `np.convolve` is quadratic at these sizes."""
    return np.sqrt(np.maximum(uniform_filter1d(x.astype(np.float64) ** 2, win), 0.0))

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "public" / "audio"
STEMS = ROOT / "audio" / "stems"
ANALYSIS = ROOT / "analysis"

SR = 48000
DURATION_S = 180.0

# --- measured targets, from analysis/audio_profile.json -----------------------
PROFILE = json.loads((ANALYSIS / "audio_profile.json").read_text(encoding="utf-8"))
BPM = PROFILE["refined"]["music_bed"]["bpm_estimate"]
BED_RMS_DB = PROFILE["refined"]["music_bed"]["rms_db"]
TARGET_LUFS = PROFILE["loudness"]["integrated_lufs"]
# -1.0 is the spec ceiling; the mix is built to -1.6 so that the AAC encode in
# the final mux — which is lossy and can overshoot by a few tenths — still
# lands under it. Measured: a -1.0 dBFS mix came back as -0.79 after encoding.
TARGET_TRUE_PEAK_DB = -1.6
# Not measurable from a mixed track (STYLE_SPEC.md §6.3). Chosen, and logged.
DUCK_DB = -9.0


def read_vo_lines() -> list[dict]:
    """Parse `src/vo.ts`. It is the single source for captions, VO and script."""
    src = (ROOT / "src" / "vo.ts").read_text(encoding="utf-8")
    body = src[src.index("export const VO"):src.index("export const voWordCount")]
    # Strip comments first: a `//` note inside an entry would otherwise break
    # the object match and silently drop that line from the VO and the
    # recording script. (It did exactly that once — hence the count check.)
    body = re.sub(r"/\*[\s\S]*?\*/", "", body)
    body = re.sub(r"^\s*//.*$", "", body, flags=re.M)
    lines = []
    for m in re.finditer(
        r'\{\s*id:\s*"([^"]+)",\s*from:\s*([\d.]+),\s*to:\s*([\d.]+),\s*text:\s*'
        r'((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),?\s*\}',
        body,
        re.S,
    ):
        raw = m.group(4)
        text = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', raw))
        text = text.replace('\\"', '"').replace("\\\\", "\\")
        lines.append(
            {"id": m.group(1), "from": float(m.group(2)), "to": float(m.group(3)),
             "text": text}
        )
    if not lines:
        raise SystemExit("could not parse any VO lines from src/vo.ts")

    # Cross-check against the number of `id:` keys in the source. A regex that
    # matches most entries and quietly skips one produces a video with a silent
    # gap where a line should be, which is very hard to notice by watching.
    declared = len(re.findall(r"\bid:\s*\"", body))
    if declared != len(lines):
        raise SystemExit(
            f"parsed {len(lines)} VO lines but src/vo.ts declares {declared} — "
            "the parser dropped one. Fix the parser; do not proceed."
        )
    return lines


# --- voice ------------------------------------------------------------------
def tts_line(text: str, dest: Path) -> bool:
    """Windows SAPI, via PowerShell. Offline, no key, no third-party service."""
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.Rate = 0; "
        f"$s.SetOutputToWaveFile('{dest}'); "
        f"$s.Speak(@'\n{text}\n'@); "
        "$s.Dispose()"
    )
    r = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
        capture_output=True,
    )
    return r.returncode == 0 and dest.exists() and dest.stat().st_size > 1000


def load_wav(p: Path) -> np.ndarray:
    with wave.open(str(p), "rb") as w:
        n, ch, sw, fr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dtype).astype(np.float64)
    if sw == 2:
        a /= 32768.0
    elif sw == 4:
        a /= 2147483648.0
    else:
        a = (a - 128) / 128.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if fr != SR:
        a = sig.resample_poly(a, SR, fr)
    return a


def fit(x: np.ndarray, target_n: int) -> np.ndarray:
    """Rate-fit a line into its slot, but never speed it past intelligibility."""
    if x.size == 0:
        return np.zeros(target_n)
    ratio = x.size / target_n
    if ratio > 1.0:
        # Too long: resample up to 1.35x faster, then hard-trim if still over.
        r = min(ratio, 1.35)
        x = sig.resample_poly(x, int(1000), int(1000 * r))
    out = np.zeros(target_n)
    n = min(x.size, target_n)
    out[:n] = x[:n]
    return out


def build_vo(lines) -> tuple[np.ndarray, list[dict], bool]:
    total = int(DURATION_S * SR)
    track = np.zeros(total)
    spoken = np.zeros(total, dtype=bool)
    tmp = ROOT / ".tts"
    tmp.mkdir(exist_ok=True)
    report, ok_any = [], False

    for ln in lines:
        p = tmp / f"{ln['id'].replace('.', '_')}.wav"
        ok = tts_line(ln["text"], p)
        start = int(ln["from"] * SR)
        slot = int((ln["to"] - ln["from"]) * SR)
        if ok:
            ok_any = True
            a = load_wav(p)
            raw_s = a.size / SR
            a = fit(a, slot)
            # Short fades so a trimmed line does not click.
            f = min(int(0.01 * SR), a.size // 4)
            if f > 0:
                a[:f] *= np.linspace(0, 1, f)
                a[-f:] *= np.linspace(1, 0, f)
            track[start:start + a.size] += a
            spoken[start:start + a.size] = np.abs(a) > 1e-4
            report.append({"id": ln["id"], "tts_s": round(raw_s, 2),
                           "slot_s": round(slot / SR, 2),
                           "fitted": raw_s > slot / SR})
        else:
            report.append({"id": ln["id"], "tts_s": None,
                           "slot_s": round(slot / SR, 2), "fitted": False})
    return track, report, ok_any


# --- bed --------------------------------------------------------------------
def build_bed() -> np.ndarray:
    """A pulsed, bass-dominant bed at the reference's measured tempo.

    Synthesised to match the measured band balance: energy concentrated below
    250 Hz, essentially nothing above 2 kHz. No melody, because the reference
    has none.
    """
    n = int(DURATION_S * SR)
    t = np.arange(n) / SR
    beat = 60.0 / BPM
    rng = np.random.default_rng(11)

    bed = np.zeros(n)

    # Sub pulse on every beat: a short, decaying low sine. This is what the
    # autocorrelation in Stage 0 was locking onto.
    for k in range(int(DURATION_S / beat) + 1):
        s = int(k * beat * SR)
        if s >= n:
            break
        ln = min(int(0.42 * SR), n - s)
        env = np.exp(-np.linspace(0, 7, ln))
        # A touch of pitch drop, which is what gives a pulse its weight.
        f0 = 52.0 * np.exp(-np.linspace(0, 1.4, ln)) + 34.0
        ph = 2 * np.pi * np.cumsum(f0) / SR
        bed[s:s + ln] += np.sin(ph) * env * 0.85

    # A sustained bass drone, moving every 8 bars so 180s does not feel static.
    bar = beat * 4
    semitones = [0, 0, -2, -2, 3, 3, -2, 0]
    drone = np.zeros(n)
    for k in range(int(DURATION_S / (bar * 8)) + 1):
        s = int(k * bar * 8 * SR)
        e = min(int((k + 1) * bar * 8 * SR), n)
        if s >= n:
            break
        f = 55.0 * 2 ** (semitones[k % len(semitones)] / 12.0)
        seg = np.arange(e - s) / SR
        drone[s:e] = (
            np.sin(2 * np.pi * f * seg) * 0.5
            + np.sin(2 * np.pi * f * 2 * seg) * 0.16
            + np.sin(2 * np.pi * f * 3 * seg) * 0.05
        )
    # Slow swell so the drone breathes rather than sitting flat.
    drone *= 0.75 + 0.25 * np.sin(2 * np.pi * t / (bar * 4))
    bed += drone

    # A very quiet filtered-noise layer for air, well under the measured
    # presence share so the spectrum stays where the reference's is.
    noise = sig.sosfilt(
        sig.butter(4, [180, 900], btype="band", fs=SR, output="sos"),
        rng.standard_normal(n),
    )
    bed += noise * 0.012 * (0.6 + 0.4 * np.sin(2 * np.pi * t / (bar * 2)))

    # Keep it under 250 Hz dominant, matching the measured band shares.
    bed = sig.sosfilt(sig.butter(2, 2400, btype="low", fs=SR, output="sos"), bed)
    bed = sig.sosfilt(sig.butter(2, 28, btype="high", fs=SR, output="sos"), bed)
    return bed


def rms_db(x: np.ndarray) -> float:
    return 20 * np.log10(max(np.sqrt(np.mean(x ** 2)), 1e-12))


def k_weight(x: np.ndarray) -> np.ndarray:
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return sig.lfilter(b2, a2, sig.lfilter(b1, a1, x))


def integrated_lufs(x: np.ndarray) -> float:
    """Stereo-identical content, so one channel measured and summed as two."""
    y = k_weight(x)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    n = (len(y) - block) // hop + 1
    p = np.array([np.mean(y[i * hop:i * hop + block] ** 2) * 2 for i in range(n)])
    lk = -0.691 + 10 * np.log10(np.maximum(p, 1e-12))
    keep = lk > -70
    if not keep.any():
        return -99.0
    rel = -0.691 + 10 * np.log10(p[keep].mean()) - 10
    keep2 = keep & (lk > rel)
    return float(-0.691 + 10 * np.log10(p[keep2].mean()))


def duck(bed: np.ndarray, vo: np.ndarray, lines) -> np.ndarray:
    """Duck the bed under the voice, keyed off where the voice actually is.

    Keying off the slot boundaries in `vo.ts` instead would duck continuously,
    because those slots tile the whole timeline — the bed would never be heard.
    A real line is shorter than its slot, and the gaps between lines are what
    give the reference its measured 27% music-only share. So the key is an
    envelope of the rendered voice, which reproduces that breathing.
    """
    depth = 10 ** (DUCK_DB / 20.0)

    # Envelope follower over the voice, then a hold so the bed does not pump
    # back up between words. These are all moving averages over ~8.6M samples,
    # so they go through uniform_filter1d (linear) rather than np.convolve,
    # which at these kernel sizes is quadratic and takes minutes.
    env = moving_rms(vo, int(0.05 * SR))
    thresh = max(env.max() * 0.02, 1e-5)
    active = env > thresh
    if active.any():
        active = uniform_filter1d(active.astype(np.float32), int(0.35 * SR)) > 0

    g = np.where(active, depth, 1.0)
    # Smooth the gain so transitions are ramps rather than steps.
    g = uniform_filter1d(g.astype(np.float64), int(0.30 * SR))
    g = np.clip(g, depth, 1.0)

    # The abstention beat: the bed leaves entirely for the hold, which is the
    # one piece of sound design the brief asks for besides the hook.
    hold_a, hold_b = int(84.0 * SR), int(87.6 * SR)
    fade = int(0.35 * SR)
    g[hold_a:hold_b] = 0.0
    g[max(hold_a - fade, 0):hold_a] *= np.linspace(1, 0, min(fade, hold_a))
    g[hold_b:hold_b + fade] *= np.linspace(0, 1, fade)
    return bed * g


def write_wav(path: Path, x: np.ndarray, stereo=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    x = np.clip(x, -1.0, 1.0)
    data = np.stack([x, x], axis=1) if stereo else x[:, None]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((data * 32767).astype(np.int16).tobytes())


def main():
    lines = read_vo_lines()
    print(f"{len(lines)} VO lines parsed from src/vo.ts")

    vo, report, tts_ok = build_vo(lines)
    if not tts_ok:
        print("WARNING: no TTS produced; VO track will be silent", file=sys.stderr)

    bed = build_bed()
    bed *= 10 ** ((BED_RMS_DB - rms_db(bed)) / 20.0)   # hit the measured level
    bed = duck(bed, vo, lines)

    # Voice sits above the bed; the bed was already placed at the measured
    # music-only level, so only the voice is trimmed to reach target loudness.
    if tts_ok:
        vo *= 10 ** ((-18.0 - rms_db(vo[np.abs(vo) > 1e-4])) / 20.0)

    # Loudness and peak are solved together rather than in sequence. Scaling to
    # the target LUFS and then hard-scaling the peaks down undoes the first
    # step, which is why a naive pass lands ~2.5 dB under target. A soft knee
    # takes the peaks off without costing the loudness, then the whole mix is
    # re-measured; a few passes converge.
    ceiling = 10 ** (TARGET_TRUE_PEAK_DB / 20.0)

    def soft_limit(x, ceil):
        """Smooth compression of only the part above the knee. Linear below."""
        knee = ceil * 0.72
        out = x.copy()
        over = np.abs(x) > knee
        if over.any():
            excess = (np.abs(x[over]) - knee) / max(1.0 - knee, 1e-6)
            out[over] = np.sign(x[over]) * (knee + (ceil - knee) * np.tanh(excess))
        return out

    gain = 1.0
    for _ in range(6):
        mix = soft_limit((bed + vo) * gain, ceiling)
        cur = integrated_lufs(mix)
        if cur <= -90:
            break
        err = TARGET_LUFS - cur
        if abs(err) < 0.15:
            break
        gain *= 10 ** (err / 20.0)

    bed, vo = bed * gain, vo * gain
    mix = soft_limit(bed + vo, ceiling)
    peak = np.abs(mix).max()
    if peak > ceiling:
        mix *= ceiling / peak

    # The *mix* is what ships. Writing stems and letting Remotion sum them
    # would re-create peaks after the limiter, so the file the render plays is
    # the exact file that was measured. The stems are written alongside for
    # reference and for re-balancing when the real take arrives.
    write_wav(OUT / "mix.wav", mix)
    # Stems go outside `public/`: Remotion copies that directory into every
    # bundle, and three 34 MB wavs there cost ~70 MB of copying per render for
    # files nothing references.
    write_wav(STEMS / "bed.wav", bed)
    write_wav(STEMS / "vo.wav", vo)

    # The bed's level is only comparable to the reference where the bed is
    # actually exposed: the ducked average over a track that is 72% voice is a
    # different quantity from the measured music-only RMS.
    vo_env = moving_rms(vo, int(0.05 * SR))
    exposed = vo_env <= max(vo_env.max() * 0.02, 1e-5)
    # Discount the deliberate silent hold, where the bed is muted by design.
    exposed[int(84.0 * SR):int(87.6 * SR)] = False
    bed_exposed_db = rms_db(bed[exposed]) if exposed.any() else float("nan")
    music_only_share = float(exposed.mean())

    result = {
        "generated_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "targets": {
            "integrated_lufs": TARGET_LUFS,
            "true_peak_dbfs": TARGET_TRUE_PEAK_DB,
            "bed_rms_db": BED_RMS_DB,
            "bpm": BPM,
            "duck_db": DUCK_DB,
            "duck_status": "chosen, not measured — see STYLE_SPEC.md §6.3",
        },
        "achieved": {
            "integrated_lufs": round(integrated_lufs(mix), 2),
            "true_peak_dbfs": round(20 * np.log10(max(np.abs(mix).max(), 1e-9)), 2),
            "bed_rms_db_where_exposed": round(bed_exposed_db, 2),
            "bed_rms_db_whole_track": round(rms_db(bed), 2),
            "mix_rms_db": round(rms_db(mix), 2),
            "music_only_share": round(music_only_share, 3),
            "reference_music_only_share": round(
                1 - PROFILE["vo"]["voiced_share_from_transcript"], 3),
        },
        "ships": "public/audio/mix.wav (stems written alongside for reference)",
        "tts_available": tts_ok,
        "lines": report,
    }
    (OUT / "audio_build.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "lines"}, indent=2))
    over = [r for r in report if r["fitted"]]
    if over:
        print(f"\n{len(over)} line(s) were rate-fitted to their slot:",
              ", ".join(r["id"] for r in over))


if __name__ == "__main__":
    main()
