# Voice-over script

**180.0 s · 25 lines · 373 words · 124.3 wpm**

The reference measures **119.3 words per minute over runtime** (`analysis/transcript.json`), and this script is within 4.2% of it.

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
| 1.2 | 0:04.00 | 0:09.00 | 5.0 s | 8 | 96 | This one tells you when it doesn't — |
| 1.3 | 0:09.00 | 0:15.00 | 6.0 s | 11 | 110 | and it can show you the measurement that earns the refusal. |
| 2.1 | 0:15.00 | 0:21.00 | 6.0 s | 22 | 220 | Open any retail equity app in India and there is always a number. A target price. A buy badge. A confidence score. |
| 2.2 | 0:21.00 | 0:27.00 | 6.0 s | 12 | 120 | It is there whether or not anything about tomorrow is actually knowable. |
| 2.3 | 0:27.00 | 0:35.00 | 8.0 s | 11 | 82 | Next-session direction on large caps is close to a coin flip. |
| 3.1 | 0:35.00 | 0:43.00 | 8.0 s | 14 | 105 | NSE Copilot runs two independent heads over a fixed basket of eighteen large caps. |
| 3.2 | 0:43.00 | 0:49.00 | 6.0 s | 15 | 150 | One asks which way tomorrow goes. The other asks how big the move will be. |
| 3.3 | 0:49.00 | 0:55.00 | 6.0 s | 13 | 130 | They are never merged, and on today's board direction calls nothing at all. |
| 4.1 | 0:55.00 | 1:02.00 | 7.0 s | 13 | 111 | This is the real app. Today's board, every name in the committed panel. |
| 4.2 | 1:02.00 | 1:09.00 | 7.0 s | 12 | 103 | The model only speaks when its calibrated conviction clears sixty percent — |
| 4.3 | 1:09.00 | 1:15.00 | 6.0 s | 15 | 150 | a threshold chosen on validation data and frozen before the final holdout was ever read. |
| 4.4 | 1:15.00 | 1:21.00 | 6.0 s | 11 | 110 | So open one it declined. This is not a weak buy. |
| 4.5 | 1:21.00 | 1:24.00 | 3.0 s | 7 | 140 | There is no direction here at all. |
| 4.6 | 1:28.00 | 1:36.00 | 8.0 s | 21 | 158 | When it abstains the API omits the direction field entirely — a client cannot render a call it was never given. |
| 4.7 | 1:36.00 | 1:50.00 | 14.0 s | 26 | 111 | And the refusal comes with evidence: the past sessions whose market state most resembles today's, with real dates and the real return that followed each one. |
| 5.1 | 1:50.00 | 2:02.00 | 12.0 s | 29 | 145 | Why believe any of it. Four expanding training windows, split on dates, with a five-session embargo between train and validation — because the label for today is tomorrow's move. |
| 5.2 | 2:02.00 | 2:10.00 | 8.0 s | 17 | 128 | Then one final holdout, read exactly once, with a committed ledger so you can check that claim. |
| 5.3 | 2:10.00 | 2:16.00 | 6.0 s | 10 | 100 | Isotonic calibration is what makes this a probability at all. |
| 5.4 | 2:16.00 | 2:20.00 | 4.0 s | 13 | 195 | And here is what it beats — four baselines, on the identical split. |
| 6.1 | 2:20.00 | 2:27.00 | 7.0 s | 17 | 146 | Fifty-one point four percent on the holdout. That is the honest number and it is the point. |
| 6.2 | 2:27.00 | 2:33.00 | 6.0 s | 10 | 100 | Every configuration in the published search failed to beat it. |
| 6.3 | 2:33.00 | 2:45.00 | 12.0 s | 29 | 145 | The usable product is not the headline — it is the accuracy on the small share of sessions where conviction clears the gate, and knowing which sessions those are. |
| 7.1 | 2:45.00 | 2:51.00 | 6.0 s | 9 | 90 | Paper trading and historical analysis only. Not investment advice. |
| 7.2 | 2:51.00 | 3:00.00 | 9.0 s | 21 | 140 | It is right about half the time, and I would rather tell you that than show you a number I invented. |
