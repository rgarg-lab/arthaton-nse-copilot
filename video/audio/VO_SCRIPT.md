# Voice-over script

**190.0 s · 27 lines · 424 words · 133.9 wpm**

The reference measures **119.3 words per minute over runtime** (`analysis/transcript.json`), and this script is within 12.2% of it.

## How to record it

- Pace to the **runtime** figure, not to speech rate. The reference is 72.7% voiced; the silences are part of the measured cadence, not gaps to fill.
- Let the picture cut first, then start the line. In the reference, a line starts a median **0.44 s** after the nearest cut.
- **Beat 4.5 is the abstention.** Deliver the line, then stop. The bed drops out entirely and the frame holds in silence for ~3.6 s. Do not fill it — it is the most important moment in the video.
- Beat 1.1-1.3 is the slowest in the film at ~100 wpm. Let it breathe.

## Dropping your take in

1. Record the whole thing to `video/audio/vo-take.wav` (48 kHz, mono is fine).
2. Point `scripts/build_audio.py` at it instead of the TTS and re-run:

```bash
cd video && python scripts/build_audio.py
```

That rebuilds the bed's ducking against your actual envelope, re-normalises to the reference's measured loudness and rewrites `public/audio/mix.wav`. **Nothing in the edit moves** — the captions come from `src/vo.ts`, not from the recording.

## The lines

| beat | in | out | window | words | wpm | line |
|---|---|---|---|---|---|---|
| 1.1 | 0:00.00 | 0:04.00 | 4.0 s | 7 | 105 | Most stock tools always have an answer. |
| 1.2 | 0:04.00 | 0:09.00 | 5.0 s | 7 | 84 | This one tells you when it doesn't. |
| 1.3 | 0:09.00 | 0:14.00 | 5.0 s | 10 | 120 | And it shows you the measurement that earns the refusal. |
| 1.4 | 0:14.00 | 0:21.00 | 7.0 s | 8 | 69 | This is it, running. Eighteen NSE large caps. |
| 1.5 | 0:21.00 | 0:28.00 | 7.0 s | 11 | 94 | One question each — and a refusal when conviction is low. |
| 2.1 | 0:28.00 | 0:33.00 | 5.0 s | 22 | 264 | Open any retail equity app in India and there is always a number. A target price. A buy badge. A confidence score. |
| 2.2 | 0:33.00 | 0:37.00 | 4.0 s | 12 | 180 | It is there whether or not anything about tomorrow is actually knowable. |
| 2.3 | 0:37.00 | 0:44.00 | 7.0 s | 11 | 94 | Next-session direction on large caps is close to a coin flip. |
| 3 | 0:44.00 | 0:55.00 | 11.0 s | 33 | 180 | NSE Copilot runs two independent heads over a fixed basket of large caps — one asks which way tomorrow goes, the other asks how big the move will be. They are never merged. |
| 3.5 | 0:55.00 | 1:12.00 | 17.0 s | 31 | 109 | One real call. April twenty-sixth, twenty twenty-two: Bajaj Finance, called down at sixty point nine percent. Next session it fell seven point two seven. Not luck — that band was calibrated. |
| 4.1 | 1:12.00 | 1:18.00 | 6.0 s | 13 | 130 | This is the real app. Today's board, every name in the committed panel. |
| 4.2 | 1:18.00 | 1:25.00 | 7.0 s | 21 | 180 | Will tomorrow be a big move? Sixty point two percent — on the sessions it calls, median of four out-of-sample windows. |
| 4.3 | 1:25.00 | 1:33.00 | 8.0 s | 21 | 158 | Four names tracked. Two it will call, at a confidence band measured right sixty-one percent of the time. Two it declines. |
| 4.4 | 1:33.00 | 1:39.00 | 6.0 s | 20 | 200 | Open one it declined. Conviction below the frozen gate — so it says nothing, and tells you that in words. |
| 4.5 | 1:39.00 | 1:42.00 | 3.0 s | 7 | 140 | There is no direction here at all. |
| 4.6 | 1:46.00 | 1:56.00 | 10.0 s | 26 | 156 | The refusal comes with evidence — the past sessions whose market state most resembles today's, with real dates and the real return that followed each one. |
| 4.7 | 1:56.00 | 2:06.00 | 10.0 s | 22 | 132 | The model card. Every figure read from one committed artifact — accuracy by confidence, and what each band actually costs in coverage. |
| 4.8 | 2:06.00 | 2:13.00 | 7.0 s | 14 | 120 | Nothing is ever sent without an approval. Every delivery is queued, reviewed, and recorded. |
| 5.1 | 2:13.00 | 2:23.00 | 10.0 s | 25 | 150 | Why believe any of it. Four expanding training windows, split on dates, with a five-session embargo — because the label for today is tomorrow's move. |
| 5.2 | 2:23.00 | 2:27.00 | 4.0 s | 11 | 165 | Then one final holdout, read exactly once, with a committed ledger. |
| 5.3 | 2:27.00 | 2:34.00 | 7.0 s | 10 | 86 | Isotonic calibration is what makes this a probability at all. |
| 5.4 | 2:34.00 | 2:38.00 | 4.0 s | 13 | 195 | And here is what it beats — four baselines, on the identical split. |
| 6.1 | 2:38.00 | 2:45.00 | 7.0 s | 16 | 137 | Forced to call every session, it is right half the time. That is the honest floor. |
| 6.2 | 2:45.00 | 2:51.00 | 6.0 s | 10 | 100 | Every configuration in the published search failed to beat it. |
| 6.3 | 2:51.00 | 3:01.00 | 10.0 s | 21 | 126 | The usable product is the accuracy on the sessions where conviction clears the gate — and knowing which sessions those are. |
| 7.1 | 3:01.00 | 3:06.00 | 5.0 s | 9 | 108 | Paper trading and historical analysis only. Not investment advice. |
| 7.2 | 3:06.00 | 3:10.00 | 4.0 s | 13 | 195 | I would rather tell you that than show you a number I invented. |
