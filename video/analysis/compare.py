"""Stage 7 — run the render back through Stage 0's analysis and compare.

The same code that measured the reference measures the output, so "does it
match the reference" has an answer instead of an opinion. Writes COMPARISON.md.
"""
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

sys.path.insert(0, str(HERE))
from audio_profile import SR, band_energy, integrated_lufs  # noqa: E402
from cuts import detect  # noqa: E402
from probe import probe  # noqa: E402

REFERENCE = Path(
    r"C:\Users\Riyan Garg\Downloads\WhatsApp Video 2026-11-17 at 7.12.51 PM.mp4"
)
RENDER = ROOT / "out" / "arthaton-submission.mp4"


def palette_of(video: Path, tag: str) -> dict:
    """Dominant colours, sampled the same way as the reference's palette."""
    frames = HERE / f"frames_{tag}"
    frames.mkdir(exist_ok=True)
    if not any(frames.iterdir()):
        subprocess.run(
            [FFMPEG, "-v", "error", "-i", str(video), "-vf", "fps=1/3,scale=320:-1",
             "-y", str(frames / "f%04d.png")],
            check=True,
        )
    from PIL import Image

    rng = np.random.default_rng(7)
    counts: dict[tuple, float] = {}
    files = sorted(frames.glob("*.png"))
    for p in files:
        a = np.asarray(Image.open(p).convert("RGB")).reshape(-1, 3)
        px = a[rng.choice(a.shape[0], size=min(8000, a.shape[0]), replace=False)]
        for c in px:
            q = tuple((int(v) // 16) * 16 + 8 for v in c)
            counts[q] = counts.get(q, 0) + 1
    total = sum(counts.values())
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])

    def sat(c):
        mx, mn = max(c), min(c)
        return 0.0 if mx == 0 else (mx - mn) / mx

    bg = next(c for c, _ in ranked if sat(c) < 0.18)
    accents = [c for c, _ in ranked if sat(c) >= 0.35][:5]
    return {
        "frames": len(files),
        "background": "#{:02X}{:02X}{:02X}".format(*bg),
        "background_share": round(counts[bg] / total, 4),
        "accents": ["#{:02X}{:02X}{:02X}".format(*c) for c in accents],
    }


def audio_of(video: Path, tag: str) -> dict:
    """Measure a render's audio, extracting it fresh every time.

    This used to reuse `audio_<tag>.wav` if it was already on disk. After the
    film went silent that cache made the report state an integrated loudness
    and a true peak for a file with no audio stream at all — a measurement of
    the previous cut, presented as a measurement of this one. The extraction
    costs a few seconds; a false number costs more than that.
    """
    wav = HERE / f"audio_{tag}.wav"
    wav.unlink(missing_ok=True)
    # The imageio-ffmpeg wheel ships no ffprobe, so ask ffmpeg itself: it
    # prints the stream table to stderr and exits non-zero with no output file,
    # which is fine here because the table is all we want.
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", str(video)],
                          capture_output=True, text=True).stderr
    if not re.search(r"Stream #\d+:\d+.*: Audio:", info):
        return {"silent": True}
    subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(video), "-ac", "2", "-ar", str(SR),
         "-f", "wav", "-y", str(wav)],
        check=True,
    )
    with wave.open(str(wav), "rb") as w:
        if w.getnframes() == 0:
            return {"silent": True}
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        x = x.astype(np.float64).reshape(-1, 2) / 32768.0
    mono = x.mean(axis=1)
    if np.abs(mono).max() < 1e-6:
        return {"silent": True}
    return {
        "silent": False,
        **integrated_lufs(x, SR),
        "true_peak_dbfs": round(float(20 * np.log10(np.abs(x).max())), 2),
        **band_energy(mono, SR),
    }


def hex_to_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def main():
    if not RENDER.exists():
        raise SystemExit(f"no render at {RENDER}")

    ref_probe, out_probe = probe(REFERENCE), probe(RENDER)
    ref_cuts = json.loads((HERE / "cuts.json").read_text(encoding="utf-8"))
    out_cuts = detect(RENDER)
    (HERE / "cuts_render.json").write_text(json.dumps(out_cuts, indent=2), encoding="utf-8")

    ref_pal = json.loads((HERE / "palette.json").read_text(encoding="utf-8"))
    out_pal = palette_of(RENDER, "render")

    ref_audio = json.loads((HERE / "audio_profile.json").read_text(encoding="utf-8"))
    out_audio = audio_of(RENDER, "render")

    # VO cadence: the rendered words are known exactly from src/vo.ts, so they
    # are counted rather than re-transcribed. Re-running whisper on a synthetic
    # scratch voice would measure the TTS, not the edit.
    sys.path.insert(0, str(ROOT / "scripts"))
    from build_audio import read_vo_lines  # noqa: E402

    lines = read_vo_lines()
    # Alphanumeric tokens only, matching honesty.test.ts and check_script.py.
    # Counting bare em-dashes as words put this row 1.4 points above the other
    # two checks measuring the same script.
    words = sum(
        len([w for w in re.split(r"\s+", l["text"]) if re.search(r"[A-Za-z0-9]", w)])
        for l in lines
    )
    runtime = out_probe["duration_s"]
    out_wpm = words / (runtime / 60)
    ref_wpm = ref_audio["vo"]["wpm_over_runtime"]

    size_mb = RENDER.stat().st_size / 1e6

    rows = []

    def row(dim, ref, out, ok, note=""):
        rows.append({"dimension": dim, "reference": ref, "render": out,
                     "pass": bool(ok), "note": note})

    row("Duration", f'{ref_probe["duration_s"]:.1f} s', f"{runtime:.1f} s",
        170 <= runtime <= 300, "brief requires 170-300 s; the author raised the ceiling to 5 min")
    row("Resolution",
        f'{ref_probe["video"]["width"]}x{ref_probe["video"]["height"]}',
        f'{out_probe["video"]["width"]}x{out_probe["video"]["height"]}',
        (out_probe["video"]["width"], out_probe["video"]["height"]) == (1920, 1080),
        "reference was downscaled by WhatsApp; 1920x1080 is the spec target")
    row("Frame rate", f'{ref_probe["video"]["fps"]:.0f} fps',
        f'{out_probe["video"]["fps"]:.0f} fps',
        abs(out_probe["video"]["fps"] - 60) < 0.5, "spec target 60 fps")
    row("Codec", ref_probe["video"]["codec"], out_probe["video"]["codec"],
        out_probe["video"]["codec"] == "h264")

    rm, om = ref_cuts["shot_stats"]["mean_s"], out_cuts["shot_stats"]["mean_s"]
    drift = abs(om - rm) / rm
    row("Mean shot length", f"{rm:.2f} s", f"{om:.2f} s", drift <= 0.20,
        f"{drift * 100:+.1f}% — same detector on both; allowed +/-20%")
    row("Cut count", ref_cuts["cut_count"], out_cuts["cut_count"], True,
        f'{ref_cuts["shot_stats"]["cuts_per_minute"]:.1f} vs '
        f'{out_cuts["shot_stats"]["cuts_per_minute"]:.1f} cuts/min')
    row("Median shot", f'{ref_cuts["shot_stats"]["median_s"]:.2f} s',
        f'{out_cuts["shot_stats"]["median_s"]:.2f} s', True, "reported, not gated")

    rbg, obg = ref_pal["background"]["hex"], out_pal["background"]
    dbg = float(np.abs(hex_to_rgb(rbg) - hex_to_rgb(obg)).max())
    row("Background", rbg, obg, dbg <= 24,
        f"max channel distance {dbg:.0f}/255")

    racc = ref_pal["accents"][0]["hex"]
    dacc = min(float(np.abs(hex_to_rgb(racc) - hex_to_rgb(a)).max())
               for a in out_pal["accents"]) if out_pal["accents"] else 255.0
    row("Accent", racc, ", ".join(out_pal["accents"][:3]), dacc <= 40,
        f"nearest rendered accent is {dacc:.0f}/255 from the reference's primary")

    if out_audio.get("silent"):
        row("Integrated loudness", f'{ref_audio["loudness"]["integrated_lufs"]} LUFS',
            "silent", False, "no audio in the render")
        row("True peak", f'{ref_audio["rms_envelope"]["true_peak_dbfs"]} dBFS',
            "silent", False)
    else:
        rl = ref_audio["loudness"]["integrated_lufs"]
        ol = out_audio["integrated_lufs"]
        row("Integrated loudness", f"{rl} LUFS", f"{ol} LUFS", abs(ol - rl) <= 1.0,
            f"{ol - rl:+.2f} dB — allowed +/-1 dB")
        row("True peak", f'{ref_audio["rms_envelope"]["true_peak_dbfs"]} dBFS',
            f'{out_audio["true_peak_dbfs"]} dBFS',
            out_audio["true_peak_dbfs"] <= -1.0, "ceiling -1.0 dBFS")
        row("Spectral centroid", f'{ref_audio["spectrum"]["spectral_centroid_hz"]} Hz',
            f'{out_audio["spectral_centroid_hz"]} Hz', True, "reported, not gated")

    row("VO cadence", f"{ref_wpm} wpm", f"{out_wpm:.1f} wpm",
        abs(out_wpm - ref_wpm) / ref_wpm <= 0.10,
        f"{(out_wpm - ref_wpm) / ref_wpm * 100:+.1f}% — allowed +/-10%")
    row("File size", f"{REFERENCE.stat().st_size / 1e6:.1f} MB", f"{size_mb:.1f} MB",
        size_mb < 200, "submission portals cap uploads at 200 MB")

    passed = sum(r["pass"] for r in rows)
    result = {"rows": rows, "passed": passed, "total": len(rows),
              "render_palette": out_pal, "render_audio": out_audio,
              "render_cuts": {k: v for k, v in out_cuts.items()
                              if k not in ("diff_signal", "shots")}}
    (HERE / "comparison.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    md = [
        "# Comparison — render vs reference",
        "",
        "The same measurement code, run over both files. `analysis/compare.py` produces",
        "this; `analysis/comparison.json` has the raw output.",
        "",
        f"**{passed} of {len(rows)} dimensions pass.**",
        "",
        "| Dimension | Reference | This render | Pass | Note |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        md.append(
            f'| {r["dimension"]} | {r["reference"]} | {r["render"]} | '
            f'{"PASS" if r["pass"] else "FAIL"} | {r["note"]} |'
        )
    (ROOT / "COMPARISON.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print("\n".join(md))
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
