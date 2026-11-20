"""Generate `audio/VO_SCRIPT.md` from `src/vo.ts`.

The author records against this. It is generated rather than written so the
recording windows, the burned-in captions and the scratch track can never
disagree — there is one copy of the words, in `src/vo.ts`.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_audio import PROFILE, read_vo_lines  # noqa: E402

ROOT = HERE.parent


def ts(s: float) -> str:
    return f"{int(s // 60)}:{s % 60:05.2f}"


def main():
    lines = read_vo_lines()
    words = sum(len(l["text"].split()) for l in lines)
    runtime = max(l["to"] for l in lines)
    ref_wpm = PROFILE["vo"]["wpm_over_runtime"]

    out = [
        "# Voice-over script",
        "",
        f"**{runtime:.1f} s · {len(lines)} lines · {words} words · "
        f"{words / (runtime / 60):.1f} wpm**",
        "",
        f"The reference measures **{ref_wpm} words per minute over runtime** "
        f"(`analysis/transcript.json`), and this script is within "
        f"{abs(words / (runtime / 60) - ref_wpm) / ref_wpm * 100:.1f}% of it.",
        "",
        "## How to record it",
        "",
        "- Pace to the **runtime** figure, not to speech rate. The reference is "
        "72.7% voiced; the silences are part of the measured cadence, not gaps "
        "to fill.",
        "- Let the picture cut first, then start the line. In the reference, a "
        "line starts a median **0.44 s** after the nearest cut.",
        "- **Beat 4.5 is the abstention.** Deliver the line, then stop. The bed "
        "drops out entirely and the frame holds in silence for ~3.6 s. Do not "
        "fill it — it is the most important moment in the video.",
        "- Beat 1.1-1.3 is the slowest in the film at ~100 wpm. Let it breathe.",
        "",
        "## Dropping your take in",
        "",
        "1. Record the whole thing to `video/audio/vo-take.wav` "
        "(48 kHz, mono is fine).",
        "2. Point `scripts/build_audio.py` at it instead of the TTS and re-run:",
        "",
        "```bash",
        "cd video && python scripts/build_audio.py",
        "```",
        "",
        "That rebuilds the bed's ducking against your actual envelope, "
        "re-normalises to the reference's measured loudness and rewrites "
        "`public/audio/mix.wav`. **Nothing in the edit moves** — the captions "
        "come from `src/vo.ts`, not from the recording.",
        "",
        "## The lines",
        "",
        "| beat | in | out | window | words | wpm | line |",
        "|---|---|---|---|---|---|---|",
    ]
    for l in lines:
        d = l["to"] - l["from"]
        w = len(l["text"].split())
        out.append(
            f'| {l["id"]} | {ts(l["from"])} | {ts(l["to"])} | {d:.1f} s | {w} | '
            f'{w / (d / 60):.0f} | {l["text"]} |'
        )

    dest = ROOT / "audio" / "VO_SCRIPT.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {dest.relative_to(ROOT)} — {len(lines)} lines, {words} words")


if __name__ == "__main__":
    main()
