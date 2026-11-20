"""Stage 0.2.1 — probe the reference container. Measurement only, no design."""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
# imageio-ffmpeg ships ffmpeg but not ffprobe, so the container facts are parsed
# out of ffmpeg's own stderr banner rather than from ffprobe JSON.
HERE = Path(__file__).resolve().parent


def probe(path: Path) -> dict:
    out = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stderr

    info: dict = {"source": str(path), "raw_banner": out.strip().splitlines()}

    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    if m:
        h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        info["duration_s"] = round(h * 3600 + mi * 60 + s, 3)
    m = re.search(r"bitrate: (\d+) kb/s", out)
    if m:
        info["bitrate_kbps"] = int(m.group(1))

    v = re.search(
        r"Stream #\d+:\d+.*?: Video: (\w+).*?, (\w+)[^,]*, (\d+)x(\d+)[^,]*"
        r"(?:, (\d+) kb/s)?, ([\d.]+) fps",
        out,
    )
    if v:
        info["video"] = {
            "codec": v.group(1),
            "pix_fmt": v.group(2),
            "width": int(v.group(3)),
            "height": int(v.group(4)),
            "bitrate_kbps": int(v.group(5)) if v.group(5) else None,
            "fps": float(v.group(6)),
        }
    a = re.search(
        r"Stream #\d+:\d+.*?: Audio: (\w+).*?, (\d+) Hz, ([^,]+), [^,]+(?:, (\d+) kb/s)?",
        out,
    )
    if a:
        info["audio"] = {
            "codec": a.group(1),
            "sample_rate_hz": int(a.group(2)),
            "channel_layout": a.group(3).strip(),
            "bitrate_kbps": int(a.group(4)) if a.group(4) else None,
        }
    return info


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "probe.json"
    info = probe(src)
    dest.write_text(json.dumps(info, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in info.items() if k != "raw_banner"}, indent=2))
