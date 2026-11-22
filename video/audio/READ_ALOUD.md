# Read this out — NSE Copilot, 3:10 total

Record straight through to `video/audio/vo-take.wav` (48 kHz, mono is fine).
Don't stop and restart between lines — one continuous take is easier to align.

**How to use the checkpoints.** The ⏱ lines are not script. They are the clock:
when you reach that point in the page, the stopwatch should read that time.
Ahead of it → you're rushing. Behind it → trim the pause, not the words.

**Three rules that matter more than speed:**

1. Pause **between** lines, not inside them. The windows below already include
   the silence — the film is only about three-quarters voiced.
2. At **1:39** you say one short line and then **stop for four full seconds.**
   That silence is the most important moment in the video. Do not fill it.
3. The opening (0:00–0:14) is the slowest in the film. Let it breathe.

---

## ⏱ 0:00 — start

**0:00** Most stock tools always have an answer.

**0:04** This one tells you when it doesn't.

**0:09** And it shows you the measurement that earns the refusal.

**0:14** This is it, running. Eighteen NSE large caps.

> ### ⏱ 0:20 — you should be on the last three words of that line

**0:21** One question each — and a refusal when conviction is low.

**0:28** Open any retail equity app in India and there is always a number.
A target price. A buy badge. A confidence score.

*(That one is dense — 22 words in 5 seconds. It's meant to sound like a list
being rattled off.)*

**0:33** It is there whether or not anything about tomorrow is actually knowable.

**0:37** Next-session direction on large caps is close to a coin flip.

> ### ⏱ 0:40 — you should be around "large caps is close to…"

**0:44** NSE Copilot runs two independent heads over a fixed basket of large
caps — one asks which way tomorrow goes, the other asks how big the move will
be. They are never merged.

**0:55** One real call. April twenty-sixth, twenty twenty-two: Bajaj Finance,
called down at sixty point nine percent. Next session it fell seven point two
seven. Not luck — that band was calibrated.

> ### ⏱ 1:00 — you should be around "called down at sixty point nine percent"

*(This line has a 17-second window for 31 words. It is the slowest line in the
film after the opening. Take the pauses: after "One real call." and again
before "Not luck".)*

**1:12** This is the real app. Today's board, every name in the committed panel.

**1:18** Will tomorrow be a big move? Sixty point two percent — on the sessions
it calls, median of four out-of-sample windows.

> ### ⏱ 1:20 — you should have just said "Will tomorrow be a big move?"

**1:25** Four names tracked. Two it will call, at a confidence band measured
right sixty-one percent of the time. Two it declines.

**1:33** Open one it declined. Conviction below the frozen gate — so it says
nothing, and tells you that in words.

**1:39** There is no direction here at all.

> ### ⏱ 1:40 — you should be inside that line
>
> ## ⏸ NOW STOP. Four seconds of silence, 1:42 → 1:46.
> Count it out. It will feel much longer than it is. Do not clear your throat,
> do not breathe into the mic, do not start early.

**1:46** The refusal comes with evidence — the past sessions whose market state
most resembles today's, with real dates and the real return that followed each
one.

**1:56** The model card. Every figure read from one committed artifact —
accuracy by confidence, and what each band actually costs in coverage.

> ### ⏱ 2:00 — you should be around "one committed artifact"

**2:06** Nothing is ever sent without an approval. Every delivery is queued,
reviewed, and recorded.

**2:13** Why believe any of it. Four expanding training windows, split on dates,
with a five-session embargo — because the label for today is tomorrow's move.

> ### ⏱ 2:20 — you should be around "because the label for today…"

**2:23** Then one final holdout, read exactly once, with a committed ledger.

**2:27** Isotonic calibration is what makes this a probability at all.

**2:34** And here is what it beats — four baselines, on the identical split.

**2:38** Forced to call every session, it is right half the time. That is the
honest floor.

> ### ⏱ 2:40 — you should have just started that line

**2:45** Every configuration in the published search failed to beat it.

**2:51** The usable product is the accuracy on the sessions where conviction
clears the gate — and knowing which sessions those are.

> ### ⏱ 3:00 — you should be on the last few words of that line

**3:01** Paper trading and historical analysis only. Not investment advice.

**3:06** I would rather tell you that than show you a number I invented.

> ### ⏱ 3:10 — end. Hold two seconds of room tone before you stop recording.

---

## Pronunciation, so a retake isn't needed

| Written | Say |
|---|---|
| 60.20% | "sixty point two percent" |
| 60.9% | "sixty point nine percent" |
| −7.27% | "seven point two seven" (the word "fell" already carries the minus) |
| 26 April 2022 | "April twenty-sixth, twenty twenty-two" |
| NSE | the letters — "N, S, E" |
| Isotonic | eye-so-TON-ic |
| SEBI | "SEE-bee" |

## When you're done

```bash
cd video && WITH_VOICE=1 python scripts/build_audio.py
# then set  mix: "audio/mix.wav"  in src/audio.manifest.ts
cd video && NO_AUDIO=0 npm run render
```

Re-encode only — about six minutes. The 11,400 frames are already on disk, so
this does **not** re-render the film, and nothing in the edit moves: the
captions come from `src/vo.ts` and the beat boundaries from `src/Main.tsx`,
neither of which the audio touches.
