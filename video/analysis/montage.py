"""Stage 0.2.3/0.2.4 — pull frames per detected shot and tile them into montages.

Full-resolution frames are extracted at the midpoint (and for longer shots, the
quarter and three-quarter points) of every shot in cuts.json, then tiled into a
handful of labelled grids so the whole video can be read in a few image reads.
"""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).resolve().parent
FRAMES = HERE / "frames"

COLS, ROWS = 5, 5          # 25 cells per montage
CELL_W = 384               # downscale per cell so a grid stays readable
LABEL_H = 22


def extract(src: Path, t: float, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [FFMPEG, "-v", "error", "-ss", f"{t:.3f}", "-i", str(src),
         "-frames:v", "1", "-q:v", "2", "-y", str(dest)],
        capture_output=True,
    )
    return r.returncode == 0 and dest.exists() and dest.stat().st_size > 0


def timestamps_for(shots) -> list[float]:
    ts = []
    for s in shots:
        a, b, ln = s["start"], s["end"], s["length_s"]
        if ln <= 0.2:
            continue
        ts.append(a + ln * 0.5)
        if ln >= 3.0:
            ts.insert(-1, a + ln * 0.25)
            ts.append(a + ln * 0.75)
    return sorted(set(round(t, 3) for t in ts))


def main(src: Path):
    cuts = json.loads((HERE / "cuts.json").read_text(encoding="utf-8"))
    ts = timestamps_for(cuts["shots"])
    print(f"{len(ts)} frames to extract from {len(cuts['shots'])} shots")

    got = []
    for t in ts:
        p = FRAMES / f"t{t:07.2f}.jpg"
        if p.exists() or extract(src, t, p):
            got.append((t, p))
    print(f"extracted {len(got)}")

    per = COLS * ROWS
    n_grids = (len(got) + per - 1) // per
    for g in range(n_grids):
        chunk = got[g * per:(g + 1) * per]
        probe = Image.open(chunk[0][1])
        ar = probe.height / probe.width
        cw, ch = CELL_W, int(CELL_W * ar)
        sheet = Image.new("RGB", (COLS * cw, ROWS * (ch + LABEL_H)), (14, 14, 16))
        draw = ImageDraw.Draw(sheet)
        for i, (t, p) in enumerate(chunk):
            x, y = (i % COLS) * cw, (i // COLS) * (ch + LABEL_H)
            sheet.paste(Image.open(p).convert("RGB").resize((cw, ch)), (x, y + LABEL_H))
            draw.text((x + 4, y + 5), f"{int(t // 60)}:{t % 60:05.2f}", fill=(235, 235, 235))
        out = HERE / f"montage_{g + 1}.png"
        sheet.save(out)
        print("wrote", out.name, f"({len(chunk)} frames, "
              f"{chunk[0][0]:.1f}s - {chunk[-1][0]:.1f}s)")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
