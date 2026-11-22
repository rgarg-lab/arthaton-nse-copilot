"""Generate the read-aloud script (HTML, then PDF) from `src/vo.ts`.

The first version of this document was written by hand. One retime later it was
describing a film that no longer existed — wrong timecodes, missing lines — and
it had already been handed to the author to record from. Same class of bug as
the three hard-coded runtimes found this session, so it gets the same fix: the
timeline is the single source of truth and every document is printed from it.

Emits:
  * a timecode for every line
  * a pacing checkpoint every 20 s, placed at the line that is live at that
    moment, so a drifting reader notices within twenty seconds rather than at
    the end
  * an explicit HOLD block wherever the timeline has a deliberate silence

Run:  python scripts/build_read_aloud.py && node scripts/build_script_pdf.mjs
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from build_audio import read_vo_lines  # noqa: E402

CHECKPOINT_EVERY = 20


def mmss(t: float) -> str:
    return f"{int(t) // 60}:{int(t) % 60:02d}"


def words(text: str) -> int:
    return len([w for w in re.split(r"\s+", text) if re.search(r"[A-Za-z0-9]", w)])


def where_in(line: dict, t: float) -> str:
    """Which part of a line should be on the reader's lips at time `t`."""
    span = max(line["to"] - line["from"], 0.001)
    frac = min(max((t - line["from"]) / span, 0.0), 1.0)
    ws = [w for w in re.split(r"\s+", line["text"]) if w]
    if not ws:
        return ""
    idx = min(int(frac * len(ws)), len(ws) - 1)
    return " ".join(ws[max(0, idx - 2) : idx + 3])


def rate(line: dict) -> float:
    span = line["to"] - line["from"]
    return words(line["text"]) / (span / 60) if span > 0 else 0.0


def note_for(line: dict, fastest: float, slowest: float) -> str | None:
    """Flag the lines whose pace is unusual, since those are where takes fail.

    Only the genuine extremes are named as such. A first version called three
    separate lines "the fastest line in the film", which is both wrong and the
    kind of thing a reader stops trusting after the second one.
    """
    span = line["to"] - line["from"]
    n = words(line["text"])
    wpm = rate(line)
    if span <= 0 or n < 8:
        return None
    if wpm >= fastest - 0.01:
        return (
            f"{n} words in {span:.0f} seconds — the fastest line in the film. "
            f"It should sound like a list being rattled off."
        )
    if wpm >= 155:
        return f"{n} words in {span:.0f} seconds. Quick — keep it crisp, don't swallow the ends."
    if wpm <= slowest + 0.01 and n >= 12:
        return (
            f"{n} words with {span:.0f} seconds to say them — the slowest line after the "
            f"opening. Take the pauses; this is slower than it reads."
        )
    if wpm <= 95:
        return f"{n} words in {span:.0f} seconds. There is room here; don't rush it."
    return None


def main() -> None:
    lines = sorted(read_vo_lines(), key=lambda l: l["from"])
    total = max(l["to"] for l in lines)
    rated = [l for l in lines if words(l["text"]) >= 8]
    fastest = max(rate(l) for l in rated)
    slowest = min(rate(l) for l in rated)

    body: list[str] = []
    next_check = CHECKPOINT_EVERY

    for i, ln in enumerate(lines):
        body.append(
            f'<div class="line"><div class="tc">{mmss(ln["from"])}</div>'
            f'<div class="say">{ln["text"]}'
        )
        n = note_for(ln, fastest, slowest)
        if n:
            body.append(f'<div class="note">{n}</div>')
        body.append("</div></div>")

        # Any checkpoint that falls inside this line goes immediately after it.
        while next_check <= ln["to"] and next_check < total:
            if next_check >= ln["from"]:
                body.append(
                    f'<div class="check">⏱ {mmss(next_check)} &nbsp; '
                    f'<span>— you should be around “{where_in(ln, next_check)}”</span></div>'
                )
            next_check += CHECKPOINT_EVERY

        # A gap to the next line is a deliberate silence, not an oversight.
        if i + 1 < len(lines):
            gap = lines[i + 1]["from"] - ln["to"]
            if gap >= 2.0:
                body.append(
                    f'<div class="stop"><h2>⏸ Now stop. '
                    f'{gap:.0f} seconds of silence — {mmss(ln["to"])} to '
                    f'{mmss(lines[i + 1]["from"])}.</h2>'
                    f"<p>Count it out. It will feel much longer than it is. Don't clear "
                    f"your throat, don't breathe into the mic, and don't start early.</p></div>"
                )

    body.append(
        f'<div class="check">⏱ {mmss(total)} &nbsp; <span>— end. Hold two seconds of '
        f"room tone before you stop recording.</span></div>"
    )

    css = (ROOT / "audio" / "read-aloud.css").read_text(encoding="utf-8")
    total_words = sum(words(l["text"]) for l in lines)

    html = f"""<meta charset="utf-8">
<title>NSE Copilot — voice-over script</title>
<style>
{css}
</style>

<h1>NSE Copilot — voice-over script</h1>
<p class="sub">{mmss(total)} &nbsp;·&nbsp; {len(lines)} lines &nbsp;·&nbsp; {total_words} words
&nbsp;·&nbsp; record straight through to vo-take.wav</p>

<div class="rules">
  <p><b>The amber bars are the clock, not the script.</b> When you reach one, your
  stopwatch should read that time. Ahead of it, you're rushing; behind it, cut the
  pause — never the words.</p>
  <p><b>Pause between lines, not inside them.</b> The windows already include the
  silence. The film is only about three-quarters voiced.</p>
  <p><b>Where a block says stop, stop.</b> The silences are written into the edit;
  filling one puts you ahead of the picture for the rest of the film.</p>
  <p><b>The opening is the slowest part of the film.</b> Let 0:00–0:14 breathe.</p>
</div>

{chr(10).join(body)}

<div class="page-break"></div>

<h3>Say it this way</h3>
<table>
  <tr><td>60.20%</td><td>sixty point two percent</td></tr>
  <tr><td>60.9%</td><td>sixty point nine percent</td></tr>
  <tr><td>−7.27%</td><td>seven point two seven &nbsp;— the word “fell” already carries the minus</td></tr>
  <tr><td>26 April 2022</td><td>April twenty-sixth, twenty twenty-two</td></tr>
  <tr><td>NSE</td><td>the letters — N, S, E</td></tr>
  <tr><td>Isotonic</td><td>eye-so-TON-ic</td></tr>
  <tr><td>SEBI</td><td>SEE-bee</td></tr>
  <tr><td>Bajaj Finance</td><td>BAH-jahj</td></tr>
</table>

<br>
<h3>Recording it</h3>
<p>One continuous take, straight through, to <code>video/audio/vo-take.wav</code> — 48 kHz,
mono is fine. Don't stop and restart between lines; a single take is far easier to align
to the picture than {len(lines)} fragments.</p>
<p>A quiet room matters more than an expensive microphone. Phone voice-memo held a hand's
width away, off-axis so you aren't breathing straight into it, is enough. If you fluff a
line, pause for three full seconds, then say the whole line again from the start — the
clean retake is easy to find and splice.</p>

<br>
<h3>What happens after</h3>
<p>Hand the file over and <code>scripts/build_voice_mix.py</code> normalises it to the
reference's measured loudness, peak-limits it, fits it to the {mmss(total)} timeline and
muxes it in. Only a re-encode is needed — the frames are already on disk, so the film is
not re-rendered and nothing in the edit moves. The captions come from
<code>src/vo.ts</code> and the beat boundaries from <code>src/Main.tsx</code>; neither is
touched by audio, so your take cannot knock them out of sync.</p>
<p><b>This document is generated from the timeline</b>
(<code>scripts/build_read_aloud.py</code>). If the edit changes, regenerate it rather than
editing it by hand — an earlier hand-written copy went stale after a retime and described
a film that no longer existed.</p>
"""
    dest = ROOT / "audio" / "read-aloud.html"
    dest.write_text(html, encoding="utf-8")
    print(f"wrote {dest.name} — {len(lines)} lines, {mmss(total)}, {total_words} words")


if __name__ == "__main__":
    main()
