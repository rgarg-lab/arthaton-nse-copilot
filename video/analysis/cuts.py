"""Stage 0.2.2 — frame-difference scene cut detection.

Decodes the reference at low resolution through the ffmpeg binary that
imageio-ffmpeg bundles, computes a per-frame mean-absolute-difference signal,
and calls a cut where that signal spikes above an adaptive threshold.
Writes cuts.json: cut timestamps, shot boundaries and shot lengths.
"""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).resolve().parent

# Decode scale for the difference signal. Small enough to be fast, large enough
# that a cut between two similar-looking slides still registers.
W, H = 160, 90


def gray_frames(path: Path, fps: float):
    cmd = [
        FFMPEG, "-v", "error", "-i", str(path),
        "-vf", f"fps={fps},scale={W}:{H}",
        "-pix_fmt", "gray", "-f", "rawvideo", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=10**8)
    size = W * H
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, dtype=np.uint8).reshape(H, W).astype(np.float32)
    proc.stdout.close()
    proc.wait()


def detect(path: Path, fps: float = 10.0, min_shot_s: float = 0.25) -> dict:
    diffs = []
    prev = None
    for f in gray_frames(path, fps):
        if prev is not None:
            diffs.append(float(np.abs(f - prev).mean()))
        prev = f
    d = np.asarray(diffs)
    if d.size == 0:
        raise SystemExit("no frames decoded")

    # Adaptive threshold: a cut is a frame-to-frame change far outside the
    # distribution of ordinary motion. Median + k*MAD is robust to the long
    # tail that camera moves and crossfades produce.
    med = float(np.median(d))
    mad = float(np.median(np.abs(d - med))) or 1e-6
    thresh = med + 6.0 * 1.4826 * mad
    floor = 6.0  # absolute floor so a near-static video does not fire on noise
    thresh = max(thresh, floor)

    cuts = []
    last = -1e9
    for i, v in enumerate(d):
        t = (i + 1) / fps
        if v >= thresh and (t - last) >= min_shot_s:
            cuts.append(round(t, 3))
            last = t

    dur = (d.size + 1) / fps
    bounds = [0.0] + cuts + [round(dur, 3)]
    shots = [
        {"index": i, "start": bounds[i], "end": bounds[i + 1],
         "length_s": round(bounds[i + 1] - bounds[i], 3)}
        for i in range(len(bounds) - 1)
    ]
    lengths = np.array([s["length_s"] for s in shots])

    return {
        "source": str(path),
        "method": (
            f"mean-abs-diff on {W}x{H} grayscale decoded at {fps} fps; "
            "cut where diff >= median + 6*1.4826*MAD (floor 6.0), "
            f"minimum shot {min_shot_s}s"
        ),
        "sampled_fps": fps,
        "analysed_duration_s": round(dur, 3),
        "threshold": round(thresh, 4),
        "diff_median": round(med, 4),
        "diff_mad": round(mad, 4),
        "diff_max": round(float(d.max()), 4),
        "cut_count": len(cuts),
        "cuts": cuts,
        "shots": shots,
        "shot_stats": {
            "count": int(lengths.size),
            "mean_s": round(float(lengths.mean()), 3),
            "median_s": round(float(np.median(lengths)), 3),
            "min_s": round(float(lengths.min()), 3),
            "max_s": round(float(lengths.max()), 3),
            "p25_s": round(float(np.percentile(lengths, 25)), 3),
            "p75_s": round(float(np.percentile(lengths, 75)), 3),
            "cuts_per_minute": round(len(cuts) / (dur / 60.0), 2),
        },
        "diff_signal": [round(float(x), 3) for x in d],
    }


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "cuts.json"
    res = detect(src)
    dest.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items()
                      if k not in ("diff_signal", "shots", "cuts")}, indent=2))
    print("cuts:", res["cuts"])
