"""Print `SCRIPT.md` from the timeline, rather than maintaining it by hand.

`src/Main.tsx` holds the beats and `src/vo.ts` holds the caption lines; between
them they *are* the film. This script reads both and writes the table that
`analysis/check_script.py` validates, so the document can never drift from the
thing it documents — which it had, before this existed: a retime moved every
beat and left SCRIPT.md describing the previous cut.

The `source` column is derived from which component each beat renders, so a new
scene is classified by what it actually is:

  CAP   a real screen recording of the running application
  3D    a Three.js set piece
  DATA  a scene whose figures come straight out of ml/artifacts
  GFX   typography and 2D motion

Run: python scripts/build_script_md.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

FPS = 60

# component -> source tag. Anything unlisted falls back to GFX, and the
# acceptance check fails loudly on a beat it cannot source.
SOURCE = {
    "Capture": "**CAP**",
    "AppSlabs": "**3D**",
    "CoinFlip3D": "GFX + **DATA**",
    "TwoHeads": "**3D** + **DATA**",
    "WorkedExample": "**3D** + **DATA**",
    "AbstentionReadout": "**3D** + **DATA**",
    "WalkForward": "**3D**",
    "CalibrationRibbon": "**3D**",
    "ConfidenceLadder": "**3D**",
    "Baselines": "GFX + **DATA**",
    "HonestNumber": "GFX + **DATA**",
    "FailedSearch": "GFX + **DATA**",
    "HookTitle": "**3D**",
    "ProblemWall": "GFX",
    "DisclaimerCard": "GFX",
    "CloseCard": "GFX",
}


def hms(s: float) -> str:
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def beats() -> list[dict]:
    src = (ROOT / "src" / "Main.tsx").read_text(encoding="utf-8")
    body = src.split("const beats: Beat[] = [", 1)[1]
    out = []
    for m in re.finditer(
        r'B\(\s*"([^"]+)",\s*(\d+),\s*(\d+),\s*<(\w+)', body, re.S
    ):
        out.append(
            {
                "id": m.group(1),
                "from": int(m.group(2)),
                "to": int(m.group(3)),
                "component": m.group(4),
            }
        )
    return sorted(out, key=lambda b: b["from"])


def vo() -> dict[str, str]:
    src = (ROOT / "src" / "vo.ts").read_text(encoding="utf-8")
    lines = {}
    for m in re.finditer(
        r'id:\s*"([^"]+)",\s*\n?\s*from:\s*\d+,\s*\n?\s*to:\s*\d+,\s*\n?\s*text:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)',
        src,
    ):
        parts = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(2))
        lines[m.group(1)] = "".join(parts)
    return lines


def main() -> None:
    bs = beats()
    lines = vo()
    total = max(b["to"] for b in bs)

    rows = []
    words = 0
    for b in bs:
        # 5.1+5.2 is one beat carrying two VO lines; join them in order.
        ids = b["id"].split("+")
        text = " ".join(lines[i] for i in ids if i in lines)
        words += len([w for w in re.split(r"\s+", text) if re.search(r"[A-Za-z0-9]", w)])
        rows.append(
            "| {id} | {a}–{b} | {d} | {src} | {cap} |".format(
                id=b["id"],
                a=hms(b["from"]),
                b=hms(b["to"]),
                d=b["to"] - b["from"],
                src=SOURCE.get(b["component"], "GFX"),
                cap=f'*"{text}"*' if text else "—",
            )
        )

    doc = f"""# Script and shot list

**Runtime {total}.0 s · {total * FPS:,} frames at 60 fps · 1920×1080**

Generated from `src/Main.tsx` and `src/vo.ts` — the timeline is the source of truth,
this table is its printout. Regenerate with `python scripts/build_script_md.py`.

> **The shipped mix has no audio at all.** Three rounds of synthesised score were
> built and all three were rejected on playback, so the film ships silent and the
> lines below are burned in as captions. See `BUILD_LOG.md` D8.3 and
> `HUMAN_TASKS.md` §1.

{len(bs)} beats · {words} caption words · {words / (total / 60):.1f} wpm

| # | in–out | s | source | caption line |
|---|---|---|---|---|
""" + "\n".join(rows) + "\n"

    (ROOT / "SCRIPT.md").write_text(doc, encoding="utf-8")
    print(f"wrote SCRIPT.md - {len(bs)} beats, {total} s, {words} words")


if __name__ == "__main__":
    main()
