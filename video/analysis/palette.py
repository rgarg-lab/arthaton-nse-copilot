"""Stage 0.2.5 — sample the reference's actual pixels for a measured palette.

Per shot: k-means over a subsample of pixels for dominant colours, plus a
background / foreground / accent split derived from coverage and saturation
rather than from eyeballing a frame.
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
FRAMES = HERE / "frames"
K = 6
SAMPLE = 20000
RNG = np.random.default_rng(7)


def hexof(c) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(int(round(x)) for x in c))


def kmeans(px: np.ndarray, k: int, iters: int = 25):
    idx = RNG.choice(px.shape[0], size=min(k, px.shape[0]), replace=False)
    cent = px[idx].astype(np.float64)
    for _ in range(iters):
        d = ((px[:, None, :] - cent[None, :, :]) ** 2).sum(axis=2)
        lab = d.argmin(axis=1)
        new = np.array([px[lab == i].mean(axis=0) if (lab == i).any() else cent[i]
                        for i in range(len(cent))])
        if np.allclose(new, cent, atol=0.5):
            cent = new
            break
        cent = new
    counts = np.bincount(lab, minlength=len(cent))
    return cent, counts / counts.sum()


def saturation(c) -> float:
    mx, mn = max(c), min(c)
    return 0.0 if mx == 0 else (mx - mn) / mx


def luma(c) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def main():
    frames = sorted(FRAMES.glob("*.jpg"))
    if not frames:
        raise SystemExit("no frames; run montage.py first")

    per_frame = []
    all_counts: Counter = Counter()
    for p in frames:
        im = Image.open(p).convert("RGB")
        a = np.asarray(im).reshape(-1, 3)
        px = a[RNG.choice(a.shape[0], size=min(SAMPLE, a.shape[0]), replace=False)]
        cent, share = kmeans(px.astype(np.float64), K)
        order = np.argsort(-share)
        cols = [{"hex": hexof(cent[i]), "share": round(float(share[i]), 4),
                 "sat": round(saturation(cent[i]), 3), "luma": round(luma(cent[i]), 1)}
                for i in order]
        t = float(p.stem[1:])
        per_frame.append({"t": t, "colors": cols})
        # quantise to a 16-level grid so near-identical colours pool across frames
        for c in cols:
            q = tuple((int(c["hex"][i:i + 2], 16) // 16) * 16 + 8 for i in (1, 3, 5))
            all_counts[q] += c["share"]

    pooled = [{"hex": hexof(c), "weight": round(w, 3), "sat": round(saturation(c), 3),
               "luma": round(luma(c), 1)}
              for c, w in all_counts.most_common(24)]

    # background: the highest-coverage low-saturation colour.
    bg = next(c for c in pooled if c["sat"] < 0.18)
    # foreground: the darkest low-saturation colour with meaningful coverage.
    fgs = [c for c in pooled if c["sat"] < 0.35 and c["weight"] > 0.5]
    fg = min(fgs, key=lambda c: c["luma"])
    # accents: saturated colours, ranked by coverage.
    accents = [c for c in pooled if c["sat"] >= 0.35][:6]

    out = {
        "method": (
            f"k-means (k={K}) over {SAMPLE} random pixels per extracted frame "
            f"({len(frames)} frames), pooled on a 16-level RGB grid weighted by "
            "per-frame coverage share. Background = highest-coverage colour with "
            "saturation < 0.18; foreground = darkest low-saturation colour with "
            "weight > 0.5; accents = saturated colours by coverage."
        ),
        "frames_sampled": len(frames),
        "pooled": pooled,
        "background": bg,
        "foreground": fg,
        "accents": accents,
        "per_frame": per_frame,
    }
    (HERE / "palette.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "per_frame"}, indent=2))


if __name__ == "__main__":
    main()
