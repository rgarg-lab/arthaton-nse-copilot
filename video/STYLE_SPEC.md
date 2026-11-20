# Style spec — measured from the reference

The contract for the Arthaton submission video. Every entry is tagged **measured**
(computed from the reference file by a script in `analysis/`, with the script named) or
**inferred** (a reading of what was measured, which could be wrong).

**Reference:** `WhatsApp Video 2026-11-17 at 7.12.51 PM.mp4` — the author's prior PayPal
hackathon submission for *Worth*, used as a style template with permission (it is his own
work).

**Nothing in this file is a style opinion.** Where a thing could not be measured, it says
so rather than guessing — see §6.2 (duck depth) and §7 (typography).

---

## 1. Container — measured (`probe.py` → `probe.json`)

| | reference | my target | why different |
|---|---|---|---|
| Duration | **168.0 s** | 170–190 s | the brief's window; the reference sits just under it |
| Resolution | 1024×576 | **1920×1080** | the reference was transported through WhatsApp, which downscaled it |
| Frame rate | 30 fps | **60 fps** | same reason |
| Video codec | h264, 646 kb/s | h264, CRF 18 | |
| Audio | AAC 44.1 kHz stereo, 62 kb/s | AAC 48 kHz stereo | |

> **The reference's resolution, frame rate and bitrate are transport artifacts, not style
> choices.** WhatsApp re-encodes everything it carries. They are recorded for completeness
> and are deliberately *not* matched — the build spec's 1920×1080/60 wins. The measured
> 95% spectral rolloff of 1.8 kHz (§6) is the same artifact in the audio.

---

## 2. Cut rhythm — measured (`cuts.py` → `cuts.json`)

Frame-differenced at 10 fps on 160×90 greyscale; a cut is a frame-to-frame change at or
above `median + 6×1.4826×MAD`, floored at 6.0, with a 0.25 s minimum shot.

| | raw | merged (<0.5 s clusters collapsed) |
|---|---|---|
| Cuts | **87** | 62 |
| Shots | 88 | 63 |
| **Mean shot** | **1.91 s** | 2.67 s |
| Median shot | 1.05 s | 1.80 s |
| p25 / p75 | 0.30 / 2.80 s | 1.00 / 3.65 s |
| Longest hold | **11.20 s** | 11.20 s |
| Cuts per minute | 31.1 | 22.1 |

**Both numbers are reported because the detector cannot tell a scene change from an
in-shot UI animation** — *inferred* from reading the montages: the 25 cuts that collapse
under a 0.5 s merge are overwhelmingly element-level builds inside a held frame (a card
sliding in, a figure counting up), not new scenes. The raw figure is the one Stage 7
compares against, because the same detector will be run on my render.

**Targets.** Mean shot length within 20% of raw: **1.53–2.29 s**. Keep at least one hold of
8 s or more — the reference's 11.2 s hold is its single longest shot and it lands on the
product's key number.

**Cuts are not locked to the musical grid** — measured (`refine_audio.py`): median offset
to the nearest beat is 0.117 s against 0.125 s expected if the two were unrelated. Do not
quantise cuts to the bed.

**Pacing shape** — *inferred* from the shot table: fast clusters of 0.3–1.0 s shots during
UI walkthroughs, long 3–11 s holds on the key figures and on the two text cards. The video
is not uniformly fast; it alternates.

---

## 3. Palette — measured (`palette.py` → `palette.json`)

k-means (k=6) over 20,000 random pixels in each of 129 extracted frames, pooled on a
16-level RGB grid weighted by coverage, then refined to exact centroids.

| role | hex | coverage weight | note |
|---|---|---|---|
| **Background** | `#F5F5F5` | 94.5 | the dominant surface by a wide margin |
| Paper / warm surface | `#EFEEEC` | 46.5 | a slightly warm off-white, used for full-bleed text cards |
| **Primary accent** — panel | `#87CCF7` | 9.5 | the signature light-blue tile the key number sits in |
| **Secondary accent** | `#EA9914` | 1.7 | orange; used sparingly and always as a highlight |
| Brand dark | `#172862` | 2.5 | navy, for headline numerals and the logo |
| Link / active blue | `#194C95` | 0.8 | buttons and interactive state |
| Ink | `#2B2C30` | 1.3 | body text |

**The palette is light-mode, high-key, and overwhelmingly neutral**: a single saturated
tile carries the eye and everything else is near-white. Measured accent-to-background
coverage ratio is roughly **1:9**.

**Adopted as-is**, with one substitution — *inferred, logged as a decision*: `#EA9914`
orange is PayPal's brand colour in context. It is kept, because in this project it reads as
the *abstention/caution* colour rather than as a borrowed brand mark, and the measured
coverage of 1.7% keeps it a highlight.

### Semantic assignment for this project — inferred

The reference has no equivalent of a direction signal, so these are assignments, not
measurements:

| meaning | colour |
|---|---|
| Measured / holdout figure | `#172862` navy |
| Abstention, the product's hero state | `#EA9914` orange |
| Validation-only figure (never "out of sample") | `#194C95` blue |
| Baseline, the thing to beat | `#2B2C30` ink at 55% |
| Surface for the key number | `#87CCF7` |

---

## 4. Layout grammar — inferred (from reading `montage_1..6.png`)

Read off the montages; these are descriptions of what is on screen, not measurements of it.

1. **A single centred card on a near-white field.** One idea per frame. The card has a
   large corner radius (~12–16 px at 1024 wide → ~24–30 px at 1920) and a soft, low-contrast
   drop shadow.
2. **Persistent top-left date chip** — a small all-caps mono strip (`FRI · NOV 13`) that
   survives almost every cut and anchors the whole video in one day.
3. **Persistent bottom provenance strip** — all-caps, tracked, tiny:
   `REAL APP · PAYPAL SANDBOX · ALEX'S MONTH IS SAMPLE DATA`. **This is the single most
   directly transferable element in the reference.** It states what is real and what is
   sample data, on screen, continuously. This project's video inherits it.
4. **Key-number push-in.** The hero figure is held in the blue tile and scaled up across
   consecutive shots rather than cut away from.
5. **Progressive chip rows** build along the bottom to narrate a pipeline
   (`① Claude reads the question · ② Worth's engine does the maths · ③ Every sentence is
   checked`, 2:04–2:11).
6. **Full-bleed serif-italic text cards** for the two emotional beats — the refusal
   (`Not today.`, 1:15) and the close (`Your balance says you can.`, 2:42).
7. **Real screen capture is composited into a rounded frame**, never full-bleed, always
   with the provenance strip beneath it.

**Transitions: hard cuts, essentially exclusively** — *inferred*; no dissolve or wipe was
visible in 129 sampled frames. Motion happens *inside* shots, not between them.

**Dimensionality: flat 2D motion graphics with soft shadows.** No 3D, no parallax.

> **Divergence, logged.** The brief requires five genuine Three.js set pieces. This is the
> one place the video departs from the reference by instruction. It is reconciled by making
> the 3D obey the reference's *grammar* — light field, one idea per shot, a single
> saturated accent, one continuous camera move per set piece and no orbiting — so the 3D
> reads as the same film rather than as a different one. See `BUILD_LOG.md`.

---

## 5. Typography — inferred

**Typeface cannot be measured from pixels.** Only glyph shape was available, so every claim
here is an inference and the build uses the named fallback rather than asserting a match.

| role | observation | what the build uses |
|---|---|---|
| Headline numerals | geometric sans, tight tracking, very heavy weight | Inter / system sans, weight 800 |
| Labels | all-caps, wide tracking (~0.12 em), small, medium weight | same family, 600, `letter-spacing: 0.12em` |
| Body | humanist sans, regular | same family, 400 |
| Emotional beats | **serif italic** — a clear, deliberate break from the sans | a serif italic (Georgia / system serif) |
| Provenance strip | monospace or heavily tracked caps, ~9 px at 1024 wide | mono, tracked, ~16 px at 1920 |

**Type scale** — measured by pixel height in sampled frames, then normalised to 1920 wide:

| role | at 1024 | **at 1920** |
|---|---|---|
| Hero numeral | ~58 px | **~109 px** |
| Section headline | ~22 px | **~41 px** |
| Body | ~11 px | **~21 px** |
| Label / caps | ~8 px | **~15 px** |
| Provenance strip | ~6 px | **~11 px** |

Ratio between steps is roughly **1.9 / 1.95 / 1.4** — *inferred* as an intentionally wide
scale: the hero numeral is ~5× body size, which is what gives the frames their single
focal point.

---

## 6. Audio — measured (`audio_profile.py`, `refine_audio.py` → `audio_profile.json`)

### 6.1 Loudness and dynamics

| | measured | target for the render |
|---|---|---|
| **Integrated loudness** | **−15.6 LUFS** | −15.6 ±1.0 LUFS |
| Loudness range | 4.36 LU | comparable |
| Momentary max | −9.45 LUFS | |
| True peak | −1.34 dBFS | ≤ −1.0 dBFS |
| Crest factor | 16.76 dB | |
| RMS p10 / median / p90 | −32.87 / −22.88 / −13.59 dB | |

Gated per BS.1770-4 (absolute −70 LUFS, relative −10 LU), K-weighting implemented in
`audio_profile.py`.

### 6.2 Music bed

Isolated by restricting the analysis to the **9 non-speech gaps of ≥1.5 s** (23.2 s total).
This matters: measured over the whole mix the tempo estimate is worthless — peak ratio
0.10, pinned at the 200 BPM ceiling of the search — because speech swamps the onset
envelope. On the gaps alone it resolves cleanly.

| | measured |
|---|---|
| **Tempo** | **119.7 BPM** (autocorrelation peak ratio **0.475**) |
| Beat / bar (4/4) | 0.501 s / 2.005 s |
| RMS, music alone | −21.96 dB |
| Spectral centroid | 251.8 Hz |
| Band balance | sub 47% · bass 35% · low-mid 10% · mid 6% · everything above 2 kHz <2% |

**Character** — *inferred*: a bass-dominant pulsed bed, not a melodic track. Almost no
presence or air. Target **118–122 BPM**, same band balance.

### 6.3 Duck depth — NOT MEASURABLE, stated rather than guessed

The bed's energy is in 60–250 Hz, which is also where male speech fundamentals sit. The
band level therefore *rises* under VO (−27.5 dB) instead of falling (−34.3 dB music-only),
so filtering cannot recover the duck and a mixed track cannot yield it without source
separation.

**What is used instead**, as a derived constraint rather than a claimed measurement: set
the bed so music-only passages read **−21.96 dB RMS** and the whole mix integrates to
**−15.6 LUFS**. Both are measured; satisfying both fixes the bed level without asserting a
duck figure. The duck itself is **−9 dB, inferred** — a conventional value, logged as a
choice.

### 6.4 Voice-over cadence — measured (`transcribe.py` → `transcript.json`)

faster-whisper `base`, word timestamps, no VAD filter. Mean segment log-probability
**−0.134**, so `small` was not needed.

| | measured |
|---|---|
| Words | **334** |
| **Cadence over runtime** | **119.3 wpm** |
| Cadence over voiced time | 164.0 wpm |
| Voiced share | 72.7% |
| Segments | 35 |

**Target for a 180 s video: 358 words**, acceptance band ±10% → **322–394 words**. Write to
the runtime figure, not the voiced figure — the gaps are part of the pacing.

**VO against the cuts** — measured: median distance from a VO segment start to the nearest
cut is **0.44 s**, with 19 of 35 starts within 0.5 s. *Inferred:* lines are loosely led by
picture — the cut lands, then the line starts — rather than cut to the word.

### 6.5 Sound design

*Inferred.* Discrete UI ticks on element builds; no whooshes on cuts. Per the brief,
sound design is reserved for two places only: the hook and the abstention beat.

---

## 7. Scene timing table — measured from `cuts.json` + `transcript.json`

The reference's own structure, derived from merged shot boundaries and transcript content.
This is what the script in Stage 1 is paced against.

| # | window | s | beat | shots | treatment |
|---|---|---|---|---|---|
| 1 | 0:00–0:10 | 10 | Hook — a date, a number, a want | 3 | 3D-ish calendar prop, hero numeral |
| 2 | 0:10–0:28 | 18 | Problem — the money is already spoken for | 8 | blue tile, progressive bar build |
| 3 | 0:28–0:45 | 17 | The ask — one connection | 9 | real capture, cursor visible |
| 4 | 0:45–1:03 | 18 | Ingest — reading real activity | 11 | real capture, long holds |
| 5 | 1:03–1:15 | 12 | **The key number** | 6 | push-in, longest holds of the film |
| 6 | **1:15–1:17** | 2 | **The refusal — `Not today.`** | 1 | full-bleed serif italic, held |
| 7 | 1:17–1:52 | 35 | Evidence — charts, dates, consequences | 21 | dense, fastest cutting |
| 8 | 1:52–2:12 | 20 | The assistant answering | 12 | real capture + provenance chips |
| 9 | 2:12–2:42 | 30 | Payoff — the day it does work | 13 | real capture through checkout |
| 10 | 2:42–2:48 | 6 | Close — thesis, logo, links, disclaimer | 2 | full-bleed serif italic |

**The two structural lessons** — *inferred*, and both are adopted:

1. **The refusal gets its own full-bleed card and its own hold.** It is the only moment in
   the reference given a bare text frame with nothing else on screen. This project's
   abstention beat inherits that treatment exactly.
2. **The provenance strip never leaves.** What is real and what is sample data is on screen
   for essentially the entire runtime, not disclosed once at the end.

---

## 8. Acceptance — Stage 0

- [x] `analysis/cuts.json` — 87 cuts, 88 shots, full diff signal
- [x] `analysis/transcript.json` — 35 segments, 334 words, word-level timestamps
- [x] `analysis/audio_profile.json` — loudness, spectrum, bed, cadence, refinements
- [x] `analysis/palette.json` — 129 frames sampled, pooled and refined
- [x] `analysis/montage_1..6.png` — generated **and read as images**
- [x] No style claim in this file is unsourced: each carries **measured** + the producing
      script, or **inferred**, or an explicit *not measurable*.
