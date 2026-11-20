"""Stage 1 acceptance — parse SCRIPT.md's timing table and check it against the
reference's measured cadence and the brief's runtime window."""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def parse_hms(s: str) -> float:
    m, sec = s.strip().split(":")
    return int(m) * 60 + int(sec)


def main() -> int:
    text = (ROOT / "SCRIPT.md").read_text(encoding="utf-8")
    tr = json.loads((HERE / "transcript.json").read_text(encoding="utf-8"))
    ref_wpm = tr["wpm_over_runtime"]

    rows = []
    for line in text.splitlines():
        if not line.startswith("| ") or "–" not in line:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7:
            continue
        m = re.match(r"(\d+:\d\d)–(\d+:\d\d)", cells[1].replace("**", ""))
        if not m:
            continue
        a, b = parse_hms(m.group(1)), parse_hms(m.group(2))
        vo = cells[5]
        # VO words are the italicised quotes only; stage directions are not spoken.
        spoken = " ".join(re.findall(r"\*\"(.*?)\"\*", vo))
        spoken = re.sub(r"[—–]", " ", spoken)
        words = [w for w in re.split(r"\s+", spoken) if re.search(r"[A-Za-z0-9]", w)]
        rows.append({"id": cells[0].replace("**", ""), "start": a, "end": b,
                     "dur": b - a, "words": len(words), "source": cells[4]})

    if not rows:
        print("FAIL: no timing rows parsed")
        return 1

    total_s = max(r["end"] for r in rows)
    total_w = sum(r["words"] for r in rows)
    wpm = total_w / (total_s / 60.0)
    drift = abs(wpm - ref_wpm) / ref_wpm

    # contiguity: every row must start where the previous one ended
    gaps = [(rows[i]["id"], rows[i]["end"], rows[i + 1]["start"])
            for i in range(len(rows) - 1) if rows[i]["end"] != rows[i + 1]["start"]]

    unsourced = [r["id"] for r in rows
                 if not re.search(r"3D|CAP|GFX|DATA", r["source"])]

    print(f"rows parsed            {len(rows)}")
    print(f"runtime                {total_s:.0f} s      "
          f"[{'PASS' if 170 <= total_s <= 190 else 'FAIL'}] need 170-190")
    print(f"VO words               {total_w}         "
          f"[{'PASS' if 322 <= total_w <= 394 else 'FAIL'}] need 322-394")
    print(f"cadence                {wpm:.1f} wpm   vs reference {ref_wpm} wpm")
    print(f"cadence drift          {drift * 100:+.1f}%     "
          f"[{'PASS' if drift <= 0.10 else 'FAIL'}] need within 10%")
    print(f"timeline contiguous    {'PASS' if not gaps else 'FAIL ' + str(gaps)}")
    print(f"every beat sourced     "
          f"{'PASS' if not unsourced else 'FAIL ' + str(unsourced)}")
    print()
    for r in rows:
        print(f"  {r['id']:<5} {r['start']:>4.0f}-{r['end']:<4.0f} {r['dur']:>3.0f}s  "
              f"{r['words']:>3}w  {r['source']}")

    ok = (170 <= total_s <= 190 and 322 <= total_w <= 394 and drift <= 0.10
          and not gaps and not unsourced)
    print("\nSTAGE 1 ACCEPTANCE:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
