# Human tasks — the submission video

Everything in the video build that needs **your voice, your credentials, or a licence
decision**. Nothing here blocked the build: `video/out/arthaton-submission.mp4` renders,
measures and plays without any of it.

The repo's own `HUMAN_TASKS.md` at the root is a different file and still applies.

---

## 1. Record the voice-over — only you can do this

**Status: not done. The shipped video has no audio at all.**

Three rounds of synthesised score were built and you rejected all three on playback — the
last report named it exactly: a beat sound in the background and two automated sounds
layered over each other. So the film ships **silent**, and every line is burned in as a
caption instead. It plays, it reads, and it is honest about the fact that nobody has
narrated it. But a silent submission is a real risk if the judges expect sound, and this
is the one item worth doing before you submit.

The script, with per-line windows and delivery notes, is **[`audio/VO_SCRIPT.md`](./audio/VO_SCRIPT.md)**
— 26 lines, 414 words, 190 s, paced to the reference's measured 119.3 wpm.

```bash
# 1. record the whole thing to video/audio/vo-take.wav  (48 kHz, mono is fine)
# 2. build the mix from your take
cd video && WITH_VOICE=1 python scripts/build_audio.py
# 3. point audio.manifest.ts at the result (mix: "audio/mix.wav"), then
cd video && NO_AUDIO=0 npm run render
```

**Nothing in the edit moves.** The burned-in captions come from `src/vo.ts`, not from the
recording, so re-recording cannot desync them, and the beat boundaries are fixed in
`src/Main.tsx` independently of any audio.

> The two moments that matter most for delivery are beats 1.1–1.3, the slowest in the
> film, and beat 4.5 — where you stop talking and let the abstention hold.

---

## 2. Decide on the Remotion licence — 2 minutes, probably nothing to do

**Status: believed fine, but it is your call to confirm.**

Remotion is free for individuals and small teams and requires a paid company licence above
a threshold. This is a solo student hackathon entry by an individual, which falls inside
the free terms. Confirm at <https://remotion.dev/license> if you intend to use any of this
beyond the hackathon. Do not use it commercially without buying a licence.

---

## 3. Make the repo public at submission — 1 minute

**Status: not done, and deliberately not attempted.** Creating or changing a remote is an
outward-facing action with your credentials. This is the same task as root
`HUMAN_TASKS.md` §5.

The video's close card shows `github.com/rgarg-lab/arthaton-nse-copilot`. **If you publish
under a different name or account, change it in `src/scenes/Close.tsx` and re-render**, or
the link on screen will be wrong.

```bash
gh repo create rgarg-lab/arthaton-nse-copilot --private --source=. --remote=origin --push
# then, at submission time:
gh repo edit rgarg-lab/arthaton-nse-copilot --visibility public --accept-visibility-change-consequences
```

---

## 4. Optional: refresh the data before the final render

**Status: not done, and the video shows the real consequence.**

The committed panel runs to **2026-11-11**, and the app's signals page renders a red notice
saying it is several sessions behind. That notice is **real, honest, and on camera** in the
demo beat. It was left alone on purpose: `python ml/tasks.py data` re-fetches from Yahoo,
which was rate-limiting during this build, and a failed re-fetch can leave
`panel.parquet` worse than it is now.

If you want it gone before submitting:

```bash
python ml/tasks.py data      # ~10 min, needs Yahoo to cooperate
python ml/tasks.py signals   # rescore from the frozen model
# restart the ML service, then re-record and re-render:
cd video && node scripts/capture.mjs && FFMPEG=$(python -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())") node scripts/normalise-captures.mjs
cd video && npx remotion render MainComposition out/arthaton-submission.mp4 --codec=h264 --crf=18
```

**Do not run `train` or `eval`.** The model is frozen and the holdout has been read exactly
once; re-running `eval` would consume a second authoritative read and the headline would
stop being out-of-sample. The video's whole argument depends on that.

---

## 5. One documentation inconsistency, left alone

`MODEL_CARD.md:49` reads "49,759 labelled rows · 18 tickers". The committed panel contains
**17** — `TATAMOTORS.NS` stopped resolving after the demerger. `README.md` already carries
the full *Honest status of the universe* section and reads "17" where it counts, so this is
a stale line in one table rather than a claim the project makes anywhere else.

It was **not edited**, because `ml/tests/test_model_card_numbers.py` pins figures in that
file against the artifact and changing it is a repo-test question rather than a video one.
The video itself does not inherit the error: the universe grid renders
"18 configured · 17 in the committed panel" and draws the missing ticker as missing.

---

## What is NOT on this list

- **No music licence.** There is no third-party audio. The bed was synthesised to match
  the reference's measured profile — see `CREDITS.md`.
- **No stock footage, no fonts to license.** System families only.
- **No Gemini key needed for the video**, because the chat beat is not in it.

---

## 6. Your Gemini key in `.env.local` is not valid

**Status: needs replacing, but it did not affect this video.**

`.env.local` sets `LLM_MODE=live` and a `GEMINI_API_KEY`, and root `HUMAN_TASKS.md` §1
still says the key is "not done". Tested directly against the API during this build, that
key returns:

```
400  API key not valid. Please pass a valid API key.
```

So the app is effectively in mock mode: the agent loop, tool calls, rules layer and
approvals are all real, but the assistant's prose is locally generated and says so.

**This is why the video has no chat beat.** The brief's rule is explicit — either supply a
working key before recording the assistant, or do not show it; recording mock prose and
presenting it as the model talking is precisely the failure this project is a reaction to.
The time went to the evidence page and the confidence ladder instead.

If you want the beat in a later cut: get a key from <https://aistudio.google.com/apikey>,
put it in `.env.local`, confirm with `npm run preflight`, then re-record. Root
`HUMAN_TASKS.md` §1 has the full procedure.
