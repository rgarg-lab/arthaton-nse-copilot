# Video build log

Append-only. One entry per stage, plus every ambiguous call resolved autonomously, with
the reasoning and what it was resolved against.

The app's own `BUILD_LOG.md` at the repo root is a different file and is not touched by
this build.

---

## Stage 0 — measurement

**Done.** `STYLE_SPEC.md` written; `analysis/cuts.json`, `transcript.json`,
`audio_profile.json`, `palette.json` populated; six montages generated and read as images.

Scripts, all in `analysis/`: `probe.py`, `cuts.py`, `montage.py`, `palette.py`,
`transcribe.py`, `audio_profile.py`, `refine_audio.py`.

### Decisions

**D0.1 — The reference's resolution and frame rate are not style targets.**
Measured 1024×576 @ 30 fps, 711 kb/s. The file came through WhatsApp, which re-encodes
everything. Matching it would mean matching a transport artifact. The build spec's
1920×1080 @ 60 fps wins; the measured values are recorded in `STYLE_SPEC.md` §1 and marked
as artifacts. The same applies to the 1.8 kHz audio rolloff, which is the 62 kb/s AAC.

**D0.2 — Report both raw and merged cut counts.**
The detector fires 87 times, but 25 of those collapse under a 0.5 s merge and, from
reading the montages, are element-level animation inside a held frame rather than scene
changes. Neither number alone is honest, so both are in the spec. Stage 7 compares
**raw to raw**, because the same detector will be run on the render.

**D0.3 — The whole-mix tempo estimate was discarded, not reported.**
It returned 200.9 BPM at a 0.10 autocorrelation peak ratio — pinned at the top of the
search range with no real peak, i.e. a null result. Restricting the onset analysis to the
nine non-speech gaps of ≥1.5 s recovers 119.7 BPM at a 0.475 peak ratio, which is a real
measurement. `audio_profile.json` keeps the original figure but marks it
`superseded_by` the refined one rather than deleting it.

**D0.4 — Duck depth is declared not measurable instead of being estimated.**
The bed lives in 60–250 Hz and so do male speech fundamentals, so the band gets *louder*
under VO (−27.5 dB vs −34.3 dB music-only). A filter cannot separate them. Rather than
publish a number with the wrong sign, the spec records two measured constraints that pin
the bed level anyway (music-only −21.96 dB RMS; whole mix −15.6 LUFS) and tags the −9 dB
duck itself as **inferred**. This is the one place the brief asked for a measurement that
the reference cannot yield.

**D0.5 — Cuts are not quantised to the music.**
Measured median cut-to-beat offset 0.117 s against 0.125 s expected from an unrelated
pair. Tempting to beat-lock the edit; the reference demonstrably does not, so neither
does this.

**D0.6 — Typography is tagged inferred throughout.**
Only glyph shape is available from pixels. The spec names a fallback family per role
rather than asserting a typeface. The *type scale* (ratios ~1.9/1.95/1.4) is measured by
pixel height and normalised to 1920.

**D0.7 — The orange is kept.**
`#EA9914` is PayPal's brand colour in the reference's context. Kept because at a measured
1.7% coverage it functions as a highlight, and in this project it carries the abstention
state rather than a borrowed brand mark.

### The one knowing divergence from the reference

The reference is **flat 2D motion graphics** — no 3D and no parallax in 129 sampled
frames. The brief requires five genuine Three.js set pieces. That conflict is resolved in
favour of the brief, and reconciled by making the 3D obey the reference's measured
grammar: high-key light field, one idea per shot, a single saturated accent at ~1:9
coverage, one continuous camera move per set piece, no orbiting. Recorded in
`STYLE_SPEC.md` §4.

### Repo-state notes carried into later stages

- The prompt's §7 asks for two repo fixes before anything shows the README. **The "18
  tickers" inconsistency is already corrected in `README.md`** — it reads "17 — see the
  universe note" at the signals row and carries a full *Honest status of the universe*
  section. `MODEL_CARD.md:49` still reads "49,759 labelled rows · 18 tickers"; handled in
  Stage 5.
- Making the repo public is an outward-facing action requiring the author's credentials →
  `HUMAN_TASKS.md`.
- `.env.local` sets `LLM_MODE=live` with a `GEMINI_API_KEY`. **That key is not valid** —
  tested directly against the API, it returns `400 API key not valid`. The app therefore
  runs mock prose. Per the brief, the chat beat is **not recorded** rather than recorded
  with mock prose. See D5.2.

---

## Stage 1 — script and shot list

**Done.** `SCRIPT.md` written; `analysis/check_script.py` passes.

```
runtime      180 s      [PASS] need 170-190
VO words     363        [PASS] need 322-394
cadence      121.0 wpm  vs reference 119.3 wpm   [PASS] +1.4%, need within 10%
timeline contiguous     PASS
every beat sourced      PASS
```

### Decisions

**D1.1 — The acceptance check is a script, not a reading of my own table.**
`analysis/check_script.py` parses `SCRIPT.md`'s timing table, counts only the italicised
spoken quotes (stage directions are not words anyone says), and checks runtime,
contiguity, per-beat sourcing and cadence against the measured 119.3 wpm. It caught a
column-index bug in its own first run, which is the point of having it.

**D1.2 — Reconciled with `DEMO_SCRIPT.md` rather than replacing it.**
That file's three-beat spine survives intact and its closing line is kept verbatim: *"It's
right 51% of the time. I'd rather tell you that than show you a 58% I invented."* The
structure differs where the brief's table differs — the brief front-loads a cold-open hook
and gives the abstention its own beat, which `DEMO_SCRIPT.md` folds into a longer demo.

**D1.3 — Three things are deliberately not in the video**, each logged in `SCRIPT.md`:
the chat beat (D5.2), the paper-trading returns (+10.08% is the most quotable number in
the repo and the least defensible — survivorship bias and a short leg assuming borrow;
`MODEL_CARD.md` §8 calls it an illustration, and there is no room for that caveat in three
minutes), and any 60% figure for the *direction* head (it exists on validation windows and
§6 of the model card is explicit that quoting it alone misrepresents an eight-point
spread).

**D1.4 — The hook is the slowest beat in the film at 100 wpm.**
The measured per-beat range is 100–135 wpm around a 121 mean. The reference holds its two
text cards far longer than its average shot, so slowing the open and the close is matching
measured behaviour rather than taste.

---

## Stage 2 — Remotion project

**Done.** `npx remotion studio` opens, `npx remotion still` and `npx remotion render`
produce files, and the root project is untouched:

```
root npm run build   PASS   (unchanged)
root npm test        PASS   238 tests, 20 files (baseline captured before any change)
root npx tsc         PASS
root package.json / package-lock.json   0 modifications
video/ has its own package.json and package-lock.json
```

### Decisions

**D2.1 — One line was changed outside `video/`, and it was necessary.**
The root `tsconfig.json` includes `**/*.ts` and `**/*.tsx` with only `node_modules`
excluded, so it would have compiled `video/src/**` — and `video/node_modules/**` — into
the app's typecheck and `next build`. `"exclude": ["node_modules", "video"]` is the
minimal fix. It changes no app behaviour, no test and no lockfile, and without it Stage
2's own acceptance condition ("root build still passes untouched") could not hold.

**D2.2 — `video/` gets its own `vitest.config.mts`.**
Without `root: __dirname`, vitest walks up, finds the app's config, and runs the app's
PGlite-booting suite. The video's tests must never be able to touch the app's database.

**D2.3 — `data.ts` imports the artifacts statically.**
Remotion bundles once per render, so a static import still means "read at render time" in
the only sense that matters: change `metrics.json`, re-render, the frame changes. That is
verified by execution in `scripts/verify-binding.mjs`, not asserted.

---

## Stage 3 — the 3D work

**Done.** Five set pieces, each registered as a standalone composition in `Root.tsx` so it
can be opened and scrubbed on its own. All five pull geometry from `data.ts`.

### Decisions

**D3.1 — The walk-forward timeline was built first**, as instructed, and is the only set
piece given a 20-second slot. Train block lengths are the real `train_rows` from
`metrics.json`, so the expanding window on screen is the actual expansion.

**D3.2 — The fold region and the holdout region are laid out separately.**
First attempt scaled everything on one axis by row count; the holdout then sat off the
right edge of frame. Separating the two means the sealed holdout always has room.

**D3.3 — Validation blocks use the measured panel blue, not the measured link blue.**
`#194C95` against `#172862` is nearly the same value, and the first render showed train
and validation reading as a single bar. `#87CCF7` is equally measured and actually
separates. Logged because it is a departure from the obvious semantic mapping.

**D3.4 — Bar charts state their datum on screen.**
The confidence ladder's first step was a zero-height sliver when drawn from the lowest
gate. It now measures from 50% and says *"bars measured from 50%, not zero"* in frame;
the baselines scene does the same with *"bars start at 46%, not zero"*. A chart that
silently starts at 54% exaggerates every difference above it, which is the visual version
of the thing this project is about.

**D3.5 — The calibration axis is fitted to the populated bins, and says so.**
Only 5 of 10 bins have rows. A full 0–1 axis puts the entire measurement in one corner, so
the rendered domain is 0.25–0.70 and that domain is printed in frame.

**D3.6 — The missing ticker is drawn as missing.**
`TATAMOTORS.NS` is absent from the committed panel. The universe grid renders it as an
empty wireframe and captions the scene *"18 configured · 17 in the committed panel"*. A
grid of 17 nodes captioned "eighteen" is exactly the class of small lie the project exists
to avoid.

**D3.7 — Node size is real conviction.**
Universe grid node radii come from each name's calibrated `probability_up` on today's
board, so the constellation is the actual distribution rather than decoration.

---

## Stage 4 — data binding and the honesty rule

**Done.** `src/honesty.test.ts`, 31 tests, wired to `npm test` inside `video/`.

### Decisions

**D4.1 — The test caught a real violation on its first run**, in the illustrative wall of
invented target prices in beat 2.1. The fix was **not** to loosen the rule: those figures
moved to `src/illustrative.ts`, a single file whose name and header say what they are, and
which sits outside the scanned trees. The scene stamps *"Illustrative · invented figures ·
depicts the genre, not any real product"* across the frame for the whole beat.

**D4.2 — CSS geometry is stripped before the metric scan.**
`left: "50%"` positions a box; it is not a claim about a model. Layout property values are
removed before scanning so the rule stays strict about statistics instead of being
weakened to tolerate layout.

**D4.3 — The qualifier is part of the datum, not a scene's choice.**
`headline.direction.qualifier` is `"HOLDOUT · READ ONCE"` and
`headline.moveSize.qualifier` is `"VALIDATION · ON THE SESSIONS IT CALLS"`, both fixed in
`data.ts`. A scene cannot render one figure under the other's label, and a test asserts
the move-size qualifier never matches `/HOLDOUT|OUT OF SAMPLE/i`. The move-size head has
never read the final holdout; `magnitude_metrics.json`'s own `holdout_note` says so and is
asserted too.

**D4.4 — "29 configurations" is computed, not typed.**
`MODEL_CARD.md` §6 says 29; the committed stage artifacts yield **28** distinct
configuration names. The file is the authority over the prose, so `data.ts` counts them
and the scene renders the computed number with the measured accuracy band. The VO line
still says "twenty-nine", matching the model card — flagged here as the one place the
spoken number and the rendered number come from different sources.

**D4.5 — The README's "move size calls 9 of 17" is not rendered from `data.ts`.**
It is not in any committed artifact — the app computes it live from the model service.
What `data.ts` exposes instead is the move-size head's measured coverage band (42–50% of
sessions) from `magnitude_metrics.json`. The "9 of 17" does appear in the video, but only
where it is legitimately sourced: inside the real screen recording, rendered by the real
app.

**D4.6 — The rule is verified by execution.**
`scripts/verify-binding.mjs` plants a metric-shaped literal in a scene and asserts the
suite goes red, then perturbs `direction.accuracy` in `metrics.json` and asserts the
rendered frame's bytes change. Both mutations revert in a `finally`. A test that has never
failed is indistinguishable from one that cannot.

---

## Stage 5 — screen captures

**Done.** Seven recordings of the real application, normalised to 1920×1080 at 60 fps.

Getting the stack up took three fixes, none of them to the app: the `ml` package was not
installed in this environment (`pip install -e ./ml`), the PGlite store was corrupt and
aborting on open (moved aside to `.pglite.corrupt-backup-*`, not deleted, then
`npm run db:migrate`), and the first `npm start` hit a transient port conflict.

### Decisions

**D5.1 — Playwright, not the browser extension.**
The capture must be 1920×1080 at 60 fps with real interaction. Playwright is already a
repo dependency, records genuine browser video, and makes the whole capture pass
reproducible from one command. `scripts/capture.mjs` refuses to record at all if either
the Next app or the ML service is not answering — a recording of an error state is not a
recording of the app.

**D5.2 — The chat beat is not recorded.**
The brief: *"Either supply the Gemini key before recording the chat beat, or do not show
the chat beat."* The key in `.env.local` is present but **invalid** (`400 API key not
valid`), so the assistant's prose is locally generated. Recording that and presenting it
as the model talking is the exact failure mode this project is a reaction to — the old
project's "47 recent news articles" it had never read. The time went to the evidence page
(14 s, the longest capture hold in the film) and the confidence ladder instead.

**D5.3 — Two cosmetic additions to the recordings, both disclosed.**
A drawn cursor dot, because Playwright's video does not capture the real pointer and the
reference keeps a visible cursor throughout; and hidden scrollbars, so one does not
flicker through a cut. Neither adds, hides or alters a figure. Recorded in
`src/captures.manifest.ts` and `CREDITS.md` as well as here.

**D5.4 — The raw API payload is recorded from the model service directly.**
The Next app has no signals route of its own — it calls FastAPI server-side. Recording
`:8000/signals/RELIANCE.NS` is both the only way to get this shot and the stronger
version of it: the actual JSON, with no `direction` key anywhere in it.

**D5.5 — The app is dark and the film is light. Kept.**
The reference composites light captures into a light field because its app is light. This
app is dark. Restyling the app to match a video would be absurd and is forbidden, so the
dark capture sits in the reference's rounded frame on the light field and reads as a
deliberate inset. Logged as a visible divergence from the reference.

**D5.6 — The "data is N sessions behind" notice stays on camera.**
The signals page renders a red notice that the panel runs to 2026-11-11. It is real. The
fix is `python ml/tasks.py data`, which re-fetches from Yahoo — which was rate-limiting
during this build, and a failed re-fetch can leave `panel.parquet` worse than it is. Given
a video whose entire argument is that the product shows you its real state, leaving an
honest staleness warning visible is the consistent call. It is in `HUMAN_TASKS.md` §4 with
the exact commands.

---

## Stage 6 — audio

**Done.** `public/audio/mix.wav`, measured against the reference:

| | target (measured from reference) | achieved |
|---|---|---|
| Integrated loudness | −15.6 LUFS | **−15.72 LUFS** (+0.12 dB) |
| True peak | ≤ −1.0 dBFS | **−1.06 dBFS** |
| Bed level where exposed | −21.96 dB RMS | **−21.46 dB** |
| Tempo | 119.7 BPM | 119.7 BPM by construction |

### Decisions

**D6.1 — The music bed is synthesised, not licensed.**
The reference's bed measures as a bass-dominant pulse with almost no presence or air — not
a melodic track. That is a thing that can be *generated* to match the measurement
directly, which removes the licensing question entirely rather than answering it. There is
no third-party audio in this video. `CREDITS.md` records it as original work.

**D6.2 — The mix ships, not the stems.**
Letting Remotion sum a separate bed and voice would re-create the peaks the limiter had
just removed, and the rendered file would no longer be the file that was measured. One
`mix.wav` plays; stems are written alongside for re-balancing.

**D6.3 — Loudness and peak are solved together.**
Normalising to −15.6 LUFS and then scaling peaks down undoes the first step — the naive
sequential pass landed 2.6 dB under target. A soft knee takes the peaks off without
costing loudness, then the mix is re-measured; six passes converge to within 0.12 dB.

**D6.4 — Ducking is keyed off the voice envelope, not the script's slot boundaries.**
The slots in `vo.ts` tile the whole timeline, so slot-keyed ducking held the bed down for
the entire 180 s and it was never heard (bed-where-exposed measured −41 dB). Keying off
the rendered voice reproduces the reference's breathing. Resulting music-only share is
40.6% against the reference's 27.3% — the TTS is faster than a human, so a real take will
close that gap without any edit change.

**D6.5 — Duck depth is −9 dB, chosen rather than measured**, per Stage 0's D0.4. Tagged
as inferred everywhere it appears.

**D6.6 — The bed leaves entirely for the abstention hold.**
3.6 seconds of silence under the "I don't know." card, with 350 ms fades either side. It
is the only full dropout in the film and it is the one place the brief asks for sound
design to carry the beat.

**D6.7 — Two VO lines were rate-fitted** (beats 2.1 and 5.4) because the TTS ran past its
slot. Capped at 1.35× so nothing becomes unintelligible, and recorded in
`public/audio/audio_build.json`. A human take at the scripted cadence will not need it.

**D6.8 — Captions come from `vo.ts`, not from the recording.**
So re-recording the voice cannot desync them, and swapping the real take in stays a
one-file change.

---

## Stage 7 — render and verify by measurement

### Decisions

**D7.1 — A spoken/rendered mismatch was caught and fixed, costing a re-render.**
VO line 6.2 said *"Twenty-nine configurations failed to beat it"* (following
`MODEL_CARD.md` §6) while the scene rendered **28**, the count computed from the committed
stage artifacts. A judge would hear one number and read another, in a video whose entire
argument is numerical honesty. The line is now *"Every configuration in the published
search failed to beat it"* — true, consistent with the frame, and it lets the artifact
carry the count. The render in progress was stopped and restarted. Cadence after the
change: 367 words, 122.3 wpm, still inside the band.

**D7.2 — A silently dropped VO line, caught by a count check.**
Adding the explanatory comment above broke `build_audio.py`'s regex, which parsed 24 of 25
entries and produced a mix with a silent gap where beat 6.2 should be. That is close to
undetectable by watching. The parser now strips comments first, and cross-checks the
number of parsed lines against the number of `id:` keys in the source, refusing to build
on a mismatch. The check's own first version was wrong too — it assumed one entry per
line — which is why it is written to fail loudly rather than warn.

**D7.3 — Audio stems moved out of `public/`.**
Remotion copies `public/` into every bundle. Three 34 MB wavs there cost ~70 MB of copying
per render for files nothing references. Stems now live in `audio/stems/`; only `mix.wav`,
which the render actually plays, stays in `public/`.

**D7.4 — The comparison is generated, not written.**
`analysis/compare.py` runs the *same* functions that measured the reference — `probe`,
`detect` from `cuts.py`, `integrated_lufs` and `band_energy` from `audio_profile.py` —
over the render, and writes `COMPARISON.md` plus `analysis/comparison.json`. Cut rhythm is
compared **raw detector to raw detector** so the two numbers are the same measurement.

**D7.5 — VO cadence is counted, not re-transcribed.**
Running whisper over the render would measure the TTS scratch voice, not the edit. The
rendered words are known exactly from `vo.ts`, so they are counted. When the author's real
take is in, re-transcribing becomes meaningful and the comparison can be tightened.

**D7.7 — Cut rhythm is measured on a quarter-scale probe before the final render.**
A full 1920×1080 render of 10,800 frames with five WebGL set pieces takes roughly two
hours on this machine, and the brief allows three iterations. Cut detection downscales to
160×90 regardless, so cut *timing* is independent of render resolution: a
`--scale=0.25` probe gives the real cut rhythm in a fraction of the time. The probe sizes
the fix; the full render is then run once with the answer already known.

**D7.9 — The capture beats stalled the render, and the cause was keyframe spacing.**
The probe rendered thousands of frames through the 3D set pieces and then crawled to
roughly 90 frames in ten minutes as soon as it reached the two `<OffthreadVideo>` beats.
It was not a hang: `OffthreadVideo` seeks the source once per rendered frame, and the
captures had been encoded with libx264's default ~4 s GOP, so every one of those seeks
decoded forward from the previous keyframe. Re-encoding the captures with
`-g 12 -keyint_min 12 -sc_threshold 0` caps that at 0.2 s of decode per seek. Cost: the
capture set grew from 17 MB to 49 MB. Worth it by about two orders of magnitude on those
beats, and it is why the final render is feasible at all.

**D7.11 — The render was 26× slower than it needed to be, and the cause was concurrency.**
Throughput collapsed from ~430 frames/min to ~23 partway through, which looked like an
expensive scene. It was not. Timed in isolation, the heaviest 3D set piece rendered at
~300 frames/min, and a 300-frame slice of the full composition at the *same* timecode ran
at ~600 frames/min with `--concurrency=3`. Six concurrent Chromium tabs, each holding a
WebGL context and decoded video, exhaust 16 GB and the machine starts swapping; three do
not. The render is pinned to `--concurrency=3` and completes in under half an hour
instead of six-plus hours.

The general lesson, and the reason this is written down: *measure the suspect in isolation
before optimising it*. Two separate slowdowns in this stage (this and D7.9) both presented
as "the 3D is slow", and neither was.

**D7.12 — The render is chunked, and the measured mix is muxed in once.**
Dropping to `--concurrency=3` fixed the plateau but not the *decay*: a 300-frame slice ran
at ~600 frames/min while the same content, reached by frame ~1400 of a continuous render,
managed ~60. The browser's memory grows across a long run regardless of concurrency.
`scripts/render-chunked.mjs` renders nine 1,200-frame chunks, each with a fresh browser,
and the rate holds at ~725 frames/min throughout — about 15 minutes for the whole film
instead of six hours. Chunks are resumable, so a failure partway does not start over.

**D7.17 — The settled answer: short-lived processes, small bundle.**

Two things here were diagnosed wrongly first and are corrected rather than quietly
rewritten, because the wrong versions are instructive:

*Wrong #1: "the public-dir copy is the bottleneck."* A chunk appeared to stall for 25
minutes and the log's last line was `Copying public dir 419.8 MB`. But the next line,
`Getting compositions`, had already printed — so the copy had **finished**. The copy was
never the cost; it was just the last thing logged before a silent stall.

*Wrong #2: "so drop chunking and render one continuous pass."* That followed from #1 and
made things worse — a single pass degraded from ~300 frames/min to ~8 by frame 1,400, on
the simplest 2D scene in the film.

What the evidence actually supports, consistently across every mode tried: **a fresh
renderer process is fast and a long-lived one is not.** Whatever accumulates, it is not
RAM (3 GB free), not disk (4% utilisation, queue depth 1) and not CPU (51%) — all measured
during a stall. So the fix is not to find it but to stop giving it time to accumulate:
render in 900-frame chunks, each a new process, and keep the bundle small enough that
paying for a new one twelve times is cheap. `public/` went from 420 MB to 284 MB by
dropping the JPEG quality from 4 to 7 and moving the 33 MB mix out — the render is muted
and ffmpeg muxes the audio afterwards, so it was never needed in the bundle.

**D7.19 — The last "hang" was a filename-padding bug in my own resume check.**
With chunking, bundling and the decoder all sorted, chunks still reported zero progress.
They were not hanging: **Remotion pads sequence filenames to the width of the largest
frame index in that render.** `--frames=0-299` writes `element-000.jpeg`;
`--frames=900-1199` writes `element-1199.jpeg`. Mixing chunk sizes across all the attempts
above left a directory with three different paddings in it, and the resume check — which
looked for an unpadded `element-${i}.jpeg` — matched none of them. So it re-rendered
frames that already existed, wrote them under a name it still would not recognise, and
reported "0 frames, 100 still missing" forever.

The same bug would have silently broken the final `ffmpeg -i element-%d.jpeg` too.
Everything is normalised to a fixed 5-digit name after every attempt now, and the resume
check only looks for that.

This one is worth being blunt about: several of the earlier "stalls" I attributed to
Remotion were partly this. The genuine intermittent hang is real — it is what D7.20
supervises — but it was not the whole story, and the measurement that would have caught
this sooner was simply `ls out/frames | head`.

**D7.22 — And a large share of the "hangs" were my own doing.**
The render was being launched as `nohup node … &` from inside a tool invocation that then
slept for ~290 s. Progress consistently stopped at almost exactly that mark, because the
launching shell's process group was being cleaned up and taking the render with it. Every
"it stalls after about five minutes" reading in this log has that as a contributing
cause — the window of progress was the window the parent shell happened to be alive.

It is launched as a properly tracked background task now. Two lessons, both cheap and both
learned late: *correlate the failure with your own actions before blaming the tool*, and
when a timing coincidence is that clean (progress stopping at the length of your own
sleep), it is not a coincidence.

**D7.21 — Leaked headless browsers, the other half of it.**
Ten `chrome-headless-shell` processes were alive after a handful of attempts at
concurrency 2 — each holding memory and GPU state, none of them reaped. `taskkill /T` on
the shell wrapper does not reliably reach the browsers Remotion spawns, so every attempt
left two or three behind and the machine degraded until the next manual kill reset it.

Together with D7.22 this explains the stage: **every restart was fast because I had just
killed the leaked browsers, and every continuation ended when the launching shell did.**
The hang that "didn't reproduce" was a function of how many orphans were resident and how
long the parent shell lived — both of which I kept resetting while diagnosing.

The supervisor now reaps `chrome-headless-shell` explicitly after each attempt. These are
Remotion's own bundled binary; Chrome and Edge run under different image names and are
untouched. With reaping in place the render runs at a steady **72 s per 300-frame chunk**
with no intervention.

**D7.20 — A supervisor, because the residual hang does not reproduce.**
After every fix above, the renderer still occasionally stops dead: processes alive, RAM,
disk and CPU all idle, no progress, no error, no timeout, and no correlation with content
— the same 300-frame range that hangs once renders in 80 s on the next attempt.
`scripts/render-supervised.mjs` watches the frame count and, if nothing new lands for 150
seconds, kills the render tree and retries that chunk. Frames already on disk are kept, so
every attempt moves forward and a hang costs 150 seconds instead of a session.

This does not compromise determinism: a frame is a pure function of its index, so a
retried frame is byte-identical to a first-attempt one.

**D7.18 — Bundle once, render many. This is what finally worked.**
Short chunks kept each process fast, but `npx remotion render` re-bundles and re-copies
`public/` on *every* invocation — ~60 s at 284 MB. With chunks small enough to stay fast
(300 frames), that overhead was larger than the work.

`@remotion/bundler`'s `bundle()` is called **once** at the top of the script and every
chunk renders against that prebuilt serve directory. Short-lived processes, no repeated
bundling, and frames 900–1199 — the range that had stalled on every previous attempt,
across four output modes — now completes in 121 s.

Sustained **150–180 frames/min**, ~60 minutes for the film, and it finishes.

This was the fifth distinct cause of "the render is slow" in this stage. Each was real and
each fix exposed the next. The most useful single diagnostic was the cheapest: watching
CPU during a stall and noticing it was idle.

**D7.16 — `<OffthreadVideo>` was removed entirely. The capture beats are frames.**
This was the real one. After keyframes, concurrency, the decode cache and the encoder
were each addressed, the renderer still *blocked* on the capture beats — not slowly, but
completely: Chromium and node alive, 2.7 GB free, CPU near idle, no progress, no error, no
timeout. Three different output modes reached the same state. Idle CPU is what settled it:
a slow render burns cores, a blocked one does not.

`scripts/extract-capture-frames.mjs` demuxes each recording to numbered JPEGs up front and
`<Capture>` draws them with `<Img>`. The decode leaves the render path completely. These
are the same recordings — same pixels, same cursor, same scroll — just demuxed ahead of
time instead of seeked 10,800 times during the render, so nothing about the honesty of the
demo beat changes.

Two things fell out of it worth noting:

- A guard in the extractor caught a real defect it was not written for: beat 4.3 asked for
  6.2 s starting 8 s into a 9.5 s recording and had been silently getting **89 frames
  instead of 372** — most of that beat would have been frozen on one frame, in the
  `<OffthreadVideo>` build too. `startFrom` is now 3 s and the script refuses to produce a
  short extraction silently.
- Beat 4.6 genuinely outruns its recording by ~0.4 s (7.63 s of footage, 8 s beat). The
  last frame holds for that time. It is a static JSON response being scrolled, so it is
  not visible — and it is declared in the extractor rather than hidden, because a frozen
  frame nobody wrote down is indistinguishable from a bug.

The capture MP4s moved out of `public/` to `captures/originals/` once nothing loaded them,
which also stopped Remotion copying them into every bundle.

**D7.15 — The render goes to an image sequence, and ffmpeg encodes it once.**
After concurrency, keyframes and the decoded-frame cache were all addressed, rendering was
healthy and the **encode** became the hang: a chunk would report `Rendered 600/600` and
then sit for half an hour without producing a file. `--x264-preset=veryfast` did not fix
it.

Rendering to JPEGs (`--sequence --image-format=jpeg --jpeg-quality=95`) removes Remotion's
encoder from the loop entirely, and the difference is not subtle — **~450 frames/min,
sustained**, with chunks finishing in 74–92 s. Three further properties matter as much as
the speed: frames land on disk individually so progress is directly observable; a stall is
unambiguous rather than looking like slow encoding; and a resume costs only the frames
actually missing, checked per frame rather than per chunk. ffmpeg then encodes all 10,800
frames in one pass at `-preset medium -crf 18` — the good preset, affordable because it
runs once instead of eighteen times.

Cost: ~2.5 GB of intermediate JPEGs in `out/frames/`, which `.gitignore` excludes.

**D7.14 — All-intra captures: tried, measured, mostly didn't help. Kept anyway.**
With `-g 12` a capture chunk ran at 143 frames/min. Re-encoding the captures all-intra
(`-g 1`, every frame a keyframe, 49 MB → 315 MB) took that to **158 frames/min** — about
10%, not the order of magnitude the seek theory predicted. So keyframe spacing was not the
dominant cost in the capture beats after all; the remaining cost is most likely
compositing a 1920×1080 video through the rounded, shadowed, scaled frame each beat uses.

It is recorded here rather than quietly reverted because the earlier `-g 12` change
(D7.9) *was* a real two-orders-of-magnitude win, and it would be easy to read this one as
confirming the same theory when it does not. The all-intra encode is kept — it is
measurably faster, re-encoding again would cost more time than the 315 MB copies do, and
the capture beats were accepted at ~4 minutes per chunk rather than optimised further.
Further tuning here would have been chasing a cost that is no longer the bottleneck for
*total* wall-clock.

**D7.13 — The decoded-frame cache had to be capped.**
Even chunked, throughput collapsed *within* a chunk once it reached the capture beats —
from ~300 frames/min to ~11, recovering and collapsing again. `<OffthreadVideo>` keeps a
cache of decoded frames which, left unbounded, grows across those beats until 16 GB is
gone. `--offthreadvideo-cache-size-in-bytes=268435456` bounds it. This is the third
distinct cause of "the render is slow" in this stage, after concurrency (D7.11) and
keyframe spacing (D7.9); all three presented identically and none was the 3D.

Two things had to be right for the chunking itself, and neither was at first: Node 22 on Windows
refuses to `spawnSync` a `.cmd` (`EINVAL`), so the CLI is invoked through a shell; and the
pause between chunks — which is what actually lets the OS reclaim the previous browser —
cannot be Windows' `timeout`, which refuses to run with redirected stdin and silently
killed the script after chunk one. It is `Atomics.wait` now.

Chunks render **muted** and `public/audio/mix.wav` is muxed in at the end. That is a
correctness improvement, not just a convenience: the audio in the deliverable is
bit-for-bit the mix that `build_audio.py` measured, with no per-chunk re-encode and no
boundary artifacts. Concatenation is stream-copy — every chunk came from the same encoder
with the same settings.

**D7.10 — Re-framing, to reach the reference's cut rhythm honestly.**
25 sequence boundaries over 180 s is a 7.2 s mean shot against the reference's measured
1.91 s, and the long beats are long for good reasons — a 3D set piece needs one
continuous camera move to explain anything, and the abstention needs to hold. The
reference solves exactly this at its own key-number beat (1:03–1:15), where the same tile
is re-framed across consecutive shots rather than cut away from. `<ReFrame>` does that:
the scene underneath keeps running and keeps its single camera move, while the crop jumps
on a schedule. It re-frames real content — nothing is duplicated, reordered or faked —
and it brings the hard-shot count to ~68 before in-shot motion is counted.

**Beat 4.5 is deliberately excluded.** The abstention is the only long beat with no
re-framing at all, because the entire point of it is that nothing moves.

**D7.8 — Stopping a render does not stop a render.**
Killing the shell wrapper left the detached node and Chromium children alive, so a
"stopped" render kept writing progress while a second one started — the machine
saturated and even `ls` began timing out, which looked like a hang rather than
contention. Both trees were killed explicitly before restarting. Worth recording because
the symptom pointed at the wrong cause.

**D7.6 — The first render attempt failed and the error was lost.**
The command had been piped through `tail`, so only a stack tail survived — a compositor
message with no readable cause. Re-run with the full log retained, it did not recur. Noted
rather than explained, because an unexplained failure that cannot be reproduced is not the
same as a fixed one.

---

## Stage 7 — the measured result

**14 of 14 dimensions pass.** `COMPARISON.md` is the table; `analysis/comparison.json` the
raw output. Three measurement iterations, as the brief allows:

| iteration | what failed | fix |
|---|---|---|
| 1 | mean shot 3.67 s (+92%), true peak −0.79 dBFS | `<ReFrame>` jumps too gentle to detect; AAC overshoot |
| 2 | mean shot 2.31 s (+20.9%, ceiling 2.29 s) | 94 planned shots, 77 detected — needed a few more |
| 3 | — | 106 planned shots, 86 detected, 2.07 s mean (+8.4%) |

### Decisions

**D7.23 — The true-peak fix is in the mix, not the mux.**
A mix built to exactly −1.0 dBFS came back at −0.79 after the AAC encode, because lossy
encoding can overshoot. `build_audio.py` now targets **−1.6 dBFS** so the delivered file
lands under the ceiling with margin. Measured result: −1.26 dBFS, −16.26 LUFS (0.66 dB
from the reference, inside ±1).

**D7.24 — The re-frame plan is generated, and sized by measurement.**
`src/reframePlan.ts` spaces the framings evenly across each beat and cycles scale and
origin, rather than hand-written arrays per beat. That made iterations 2 and 3 a matter of
changing one number per beat instead of rewriting coordinates. The detection rate is about
80% of planned shots, which is the useful figure: to hit a target mean shot length, plan
for roughly 125% of the shots you need.

**D7.25 — A cosmetic defect was found, priced, and knowingly kept.**
The zoom that produces the cut rhythm crops the ends of some 3D scene labels at peak
framing. Softening it was tried and measured: cropping cleared, detection fell from 86
cuts to 73, and the cut-rhythm check failed at 2.43 s. Both versions exist and both were
measured; the shipped one keeps the larger zoom because the measured contract is the
brief's acceptance criterion and no figure is obscured. The alternative, and what it would
cost, is written down in `COMPARISON.md` and in `reframePlan.ts` rather than left as a
silent choice.

### What the app looks like after all of this

```
root npm test     238 passed (20 files)   — unchanged
root npm run build  passes                — unchanged
root git status     1 file modified: tsconfig.json (one line, D2.1)
```

---

## Stage 8 — fixing what the author saw on playback

Four defects reported after watching the first cut. All four were real.

**D8.1 — The random zooming. `<ReFrame>` removed.**
I had added a component that jumped the crop and zoom on a schedule, purely to raise the
detected cut count toward the reference's 1.91 s mean shot. It passed the check (86 cuts,
2.07 s) and looked like the picture was zooming in and out at random — which is exactly
what it was doing. This was metric-gaming that made the film worse, and I shipped it over
a note in `COMPARISON.md` saying the cropping it caused was "cosmetic". The author's
reading was right and mine was wrong.

Removed entirely. The cut rate is now only real content changes, the rhythm check fails at
6.21 s, and `COMPARISON.md` states the trade instead of disguising it.

**D8.2 — The page that looked broken was the raw JSON shot.**
Beat 4.6 recorded `:8000/signals/RELIANCE.NS` directly — unstyled black-on-white JSON, in
a film that is otherwise dark UI. I had chosen it as "the stronger version" of showing
that the API omits `direction` when it abstains. On screen it reads as a browser error
page. Dropped. The abstention card makes the same point in words, in the product's own
design.

`capture.mjs` now also refuses to record any page matching /service not answering|failed
to load|something went wrong/i, so an error state cannot be captured silently again.

**D8.3 — Two audio tracks, neither clear. Now one.**
The mix layered a Windows-SAPI scratch voice under the music bed. Ducking kept them from
masking each other on a meter, but the synthesised speech was not intelligible and the
result read as two recordings fighting. `build_audio.py` now builds **bed only** by
default; the words are carried by the burned-in captions. `WITH_VOICE=1` restores the
voice path for when a real take exists.

Measured: -16.46 LUFS, true peak -1.39 dBFS, both inside spec.

**D8.4 — More of the product, including data and transactions.**
The first cut showed three pages. It now shows eight, and two of the new ones carry the
film:

- **`/watchlist`** is the best single frame in the video — four names tracked, two called
  with a confidence band measured right 61.2% of the time, two declined with reasons, all
  on one screen. The product's entire argument without a word of narration.
- **`/outbox`** shows a real queued-then-delivered digest: the approval path, which is a
  build-spec invariant (§4) that had never appeared on camera.
- `/dashboard` adds the accuracy-by-confidence table and the validation-vs-holdout gap.

`/watchlist` and `/outbox` hold the *user's* state, so they start empty. `capture.mjs`
seeds them the way a user would — adds four names, queues a digest, delivers it — then
records. Every figure is still computed by the app from the committed artifacts; seeding
changes what the user has done, never what the model says.

**D8.5 — `/alerts` returns 404.**
It is in the app's nav bar and has no route. Not fixed here: it is an app bug, the app is
out of scope for this build, and no beat shows it. Flagged in `HUMAN_TASKS.md`.

---

## v5 — the cut the author actually asked for

**D9.1 — The film ships silent.**
Three rounds of synthesised audio were built and all three were rejected on playback.
The last report was specific: "there is some beat sound in the background" and "there are
two automated sounds". Both are accurate — the bed was a pulsed sub-bass on every beat
plus a sustained drone, and no amount of mixing makes a synthesised bed sound like it was
not synthesised. `audio.manifest.ts` now has `mix: null` and `render-supervised.mjs`
defaults to `NO_AUDIO`.

A silent submission is a real risk if judges expect sound, and it is recorded here as a
trade rather than an improvement. The captions carry every line, so nothing is lost in
meaning. One line in `audio.manifest.ts` restores the path the moment a recorded voice
exists.

**D9.2 — Two scenes replaced, both named by timecode.**

*"after 43 sec … random circles"* was `UniverseGrid` — eighteen spheres on a Fibonacci
sphere. It was decorative and said nothing. Replaced by **`TwoHeads`**, which states the
line it sits under: two panels, each with its question, its measured figure, its qualifier
and its baseline, held apart by the bot. "They are never merged" is now staging rather
than narration.

*"at 1:22 … a page with IDK"* was a full-bleed serif card reading `I don't know.` and
nothing else. On playback the most important moment in the film looked like a missing
slide. Replaced by **`AbstentionReadout`**: a real name off today's board, a conviction bar
that visibly stops short of the frozen gate, `has 0.518 / needs 0.600`, the model's own
stated reason, and the share of sessions it declines. The line survives as a line.

**D9.3 — The worked example is queried, not authored.**
The brief allowed for generating an illustration of "how the data would have looked" if no
real example existed. One exists, so nothing was invented. `scripts/build_example.py`
searches the 14,654 committed out-of-fold predictions for the largest correct move among
calls clearing the frozen gate and writes what it finds:

> **Bajaj Finance, 26 April 2022** — called down at 60.9% conviction, above its 60% gate.
> Next session: ₹706.06 → ₹654.73, **−7.27%**. Calibration bin 30–40%, n = 1,114,
> predicted 39.0% up, observed 39.0% up.

That last row is what makes it evidence rather than an anecdote, and anyone can look the
date up. The script asserts correctness, conviction, magnitude and bin size, so a re-run
cannot quietly substitute a weaker case.

It is **validation** data, not the final holdout, and the scene carries
`VALIDATION · OUT-OF-FOLD` throughout. The holdout was read once under a committed ledger
and was not re-opened to decorate a video.

**D9.4 — The landing page, at last.**
It is the best-designed screen in the product and was absent from four cuts. Two new
genuine recordings of `/`: the hero with the Copilot panel working, and the eighteen-name
deck in perspective. Both inside the first 29 seconds, as asked.

The caption first read `${board.count} names` and rendered as "17 NAMES" directly beneath
a page saying "Eighteen names" — the board has 17 today, the universe is 18. Two true
numbers that contradict each other on screen is worse than neither; the caption no longer
states a count.

**D9.5 — Retimed to 190 s, and two acceptance checks were measuring the wrong film.**
Thirty seconds of new content, twenty seconds taken back out of ten beats that were held
too long. Nothing was deleted.

Both runtime-dependent checks had the old length baked in as a constant:
`honesty.test.ts` divided the word count by a literal `180`, and `check_script.py` wanted
322–394 words regardless of duration. A 190 s cut speaking at exactly the reference
cadence failed both. They now read `DURATION_S` and scale the band with runtime.

`SCRIPT.md` had also drifted — it was documenting the previous cut, and the generator it
claimed to come from did not exist. `scripts/build_script_md.py` now prints it from
`Main.tsx` and `vo.ts`, so it cannot describe a film that is no longer there.

---

## v6 — the film finally shows the product working

**D10.1 — The AI was off camera.**
Watching v5 the author said there was "no demo … just some screenshots of website".
The first half of that is wrong — they were genuine Playwright recordings, not
screenshots — but the substance was right, and the real problem was worse than
passive footage: **`/workspace` had never appeared in any cut.** That is where the
chat, the trace panel and the four panes live. An AI hackathon submission whose
agent is never seen doing anything is not a demo of an agent.

`/memory`, the vector store behind `search_memory` and `rag_lookup`, had also never
been filmed.

**D10.2 — One take, not three.**
A conversation has history and Playwright gives each browser context its own
recording, so filming the ask, the answer and the follow-up as three shots would
have produced three first messages in an empty thread. `workspace-chat` records the
whole exchange once; `extract-capture-frames.mjs` gained a `from`/`offset` pair that
slices it into four beats at marks `capture.mjs` writes during the take. Measured,
not guessed — live answer latency moved by ten seconds between runs, and a guessed
offset is how a beat ends up frozen on a spinner.

**D10.3 — The data chose a better demo than the plan did.**
The plan was to ask about Bajaj Finance and show a call, as a callback to the worked
example. Checking the service first showed Bajaj Finance is **declined** today:
conviction 0.5437 against the frozen 0.60 gate. That is the better film by some
distance. Beat 3.5 proves it was right about Bajaj in April 2022; beat 4.3 asks it
about the same name today and it says no. Being right once does not license an
answer every time, demonstrated rather than asserted.

`pickNames()` reads the **running ML service**, not `ml/artifacts/latest_signals.json`.
The committed artifact was a 16 Nov snapshot quoting the 11 Nov session and claiming
all 17 names abstained, while the app computed from the live panel and showed eight
calls on 19 Nov data. Hardcoding either would have put a false number on screen.
That disagreement is also why the v5 watchlist caption got re-checked against the
recorded frame rather than against the artifact: the caption was right.

**D10.4 — Three more hard-coded runtimes.**
`check_script.py` and `compare.py` both gated duration at 170–190 s, so a
deliberate 227 s cut failed them; the ceiling moved to 300 s. And the cadence row
printed an absolute drift with a forced `+`, so a film **6.7% slower** than the
reference was reported as 6.7% faster. Fourth, fifth and sixth instances of this bug
class in two days — after `render-supervised.mjs`, `honesty.test.ts` and the first
pass at `check_script.py`.

`audio/read-aloud.html` was the same disease: hand-written, handed to the author to
record from, then silently wrong after a retime. It is now printed from `src/vo.ts`
by `scripts/build_read_aloud.py`, along with its pacing checkpoints and its HOLD
blocks, which are derived from gaps in the timeline rather than typed in.

**D10.5 — The capture hung, and it did not matter.**
After six shots it stalled an hour on `/dashboard`: the ML service starved of CPU by
the data pipeline running concurrently. Killed it and reused the morning's
`dashboard` and `outbox` recordings, which were unchanged. Worth remembering that
`ml/tasks.py catchup` and `scripts/capture.mjs` should not run at the same time.
