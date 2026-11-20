# Script and shot list

**Runtime 180.0 s · 10,800 frames at 60 fps · 1920×1080**

Paced against `STYLE_SPEC.md`. Reconciled with the repo's `DEMO_SCRIPT.md` rather than
replacing it — that file's three-beat spine (*the problem is false confidence* → *the wow
moment is the refusal* → *why you should believe any of it*) is kept, and its closing line
is kept verbatim.

| target | from | value |
|---|---|---|
| Runtime | brief | 170–190 s → **180 s** |
| VO words | reference 119.3 wpm × 3 min | 358, band **322–394** → **363 written** |
| Cadence | within 10% of 119.3 wpm | **121.0 wpm** (+1.4%) |
| Mean shot | within 20% of 1.91 s | **1.53–2.29 s** → ~90 detectable transitions |

---

## Timing table

Source key — **3D**: Three.js set piece (§5 of the brief) · **CAP**: real screen capture ·
**GFX**: 2D motion graphics · **DATA**: figure read from `ml/artifacts/*.json` via
`data.ts`.

| # | in–out | s | on screen | source | VO | audio |
|---|---|---|---|---|---|---|
| **1. HOOK** |
| 1.1 | 0:00–0:04 | 4 | Black. The sentence types in, one clause at a time, on the paper field. | GFX | *"Most stock tools always have an answer."* | bed enters on beat 1, filtered |
| 1.2 | 0:04–0:09 | 5 | Hard cut. The second clause replaces it, orange. | GFX | *"This one tells you when it doesn't —"* | **sound design: single low hit** |
| 1.3 | 0:09–0:15 | 6 | 3D title: NSE COPILOT resolves out of a point cloud of the 18 tickers; camera pushes in once and stops. | **3D** | *"and it can show you the measurement that earns the refusal."* | bed opens up |
| **2. PROBLEM** |
| 2.1 | 0:15–0:21 | 6 | A grid of invented certainties — target prices, BUY badges, confidence scores — building fast, 8 cards in 6 s. Every one greyed and marked *illustrative*. | GFX | *"Open any retail equity app in India and there is always a number. A target price. A buy badge. A confidence score."* | ticks per card |
| 2.2 | 0:21–0:27 | 6 | The grid holds, then every badge drops away leaving empty frames. | GFX | *"It is there whether or not anything about tomorrow is actually knowable."* | bed only |
| 2.3 | 0:27–0:35 | 8 | A coin lands on the diagonal of a 50/50 axis. The holdout base rate appears beside it. | GFX + **DATA** | *"Next-session direction on large caps is close to a coin flip."* | |
| **3. WHAT IT IS** |
| 3.1 | 0:35–0:43 | 8 | **3D universe grid.** 18 tickers as a constellation; camera arcs once. | **3D** + **DATA** | *"NSE Copilot runs two independent heads over a fixed basket of eighteen large caps."* | |
| 3.2 | 0:43–0:49 | 6 | Direction head lights its nodes; label *which way*. | **3D** + **DATA** | *"One asks which way tomorrow goes. The other asks how big the move will be."* | two distinct ticks |
| 3.3 | 0:49–0:55 | 6 | Move-size lights 9 nodes; direction lights 0. Both counts from the committed panel. | **3D** + **DATA** | *"They are never merged, and on today's board direction calls nothing at all."* | |
| **4. DEMO — the real app** |
| 4.1 | 0:55–1:02 | 7 | `/signals` board, composited in the rounded frame. Cursor visible. | **CAP** | *"This is the real app. Today's board, every name in the committed panel."* | |
| 4.2 | 1:02–1:09 | 7 | The two tiles — calls today, abstentions — pulled out and scaled. | **CAP** + **DATA** | *"The model only speaks when its calibrated conviction clears sixty percent —"* | |
| 4.3 | 1:09–1:15 | 6 | The frozen-threshold chip; push-in on it. | **CAP** + **DATA** | *"a threshold chosen on validation data and frozen before the final holdout was ever read."* | |
| **4.4** | **1:15–1:21** | **6** | **One abstention card opens.** | **CAP** | *"So open one it declined. This is not a weak buy."* | bed drops to filtered |
| **4.5** | **1:21–1:28** | **7** | **THE ABSTENTION.** 3D: the signal card turns edge-on and a shutter closes over it. Full-bleed serif italic: *"I don't know."* **Held 4 s with no VO.** | **3D** | *"There is no direction here at all."* then **silence** | **sound design: shutter. Bed out entirely for 3 s, back on the cut.** |
| 4.6 | 1:28–1:36 | 8 | Back to the card: the API payload, with the `direction` key visibly absent. | **CAP** | *"When it abstains the API omits the direction field entirely — a client cannot render a call it was never given."* | |
| 4.7 | 1:36–1:50 | 14 | `/evidence` — the closest historical sessions, real dates and real subsequent returns, scrolling. Longest capture hold. | **CAP** | *"And the refusal comes with evidence: the past sessions whose market state most resembles today's, with real dates and the real return that followed each one."* | |
| **5. HOW IT WORKS** |
| **5.1** | **1:50–2:02** | **12** | **Purged walk-forward timeline — the money shot.** Four expanding train blocks march along a 3D time axis; the 5-session embargo is a visible glowing gap; each validation fold lights in turn; the final holdout sits behind a vault that opens **once**. | **3D** + **DATA** | *"Why believe any of it. Four expanding training windows, split on dates, with a five-session embargo between train and validation — because the label for today is tomorrow's move."* | build per fold |
| 5.2 | 2:02–2:10 | 8 | The vault opens; `holdout_ledger` stamps on — 1 authoritative read, content hash, model fingerprint. | **3D** + **DATA** | *"Then one final holdout, read exactly once, with a committed ledger so you can check that claim."* | single hit on the open |
| 5.3 | 2:10–2:16 | 6 | **Calibration ribbon** settles onto the diagonal; ECE annotated. | **3D** + **DATA** | *"Isotonic calibration is what makes this a probability at all."* | |
| 5.4 | 2:16–2:20 | 4 | Four baselines as bars beside the model, identical split. | GFX + **DATA** | *"And here is what it beats — four baselines, on the identical split."* | tick per bar |
| **6. HONESTY** |
| 6.1 | 2:20–2:27 | 7 | The holdout figure, full frame, in the blue tile, with its baseline beside it and the word **holdout** above it. | GFX + **DATA** | *"Fifty-one point four percent on the holdout. That is the honest number and it is the point."* | |
| 6.2 | 2:27–2:33 | 6 | Every searched configuration as a tick on one axis, all landing in the same narrow band; then the three best, on a fold that selected nothing, where the ranking inverts. | GFX + **DATA** | *"Every configuration in the published search failed to beat it."* | fast ticks |
| 6.3 | 2:33–2:45 | 12 | **Confidence ladder** — accuracy by conviction tier as ascending 3D steps, with the validation-vs-holdout reality check attached to the top step. | **3D** + **DATA** | *"The usable product is not the headline — it is the accuracy on the small share of sessions where conviction clears the gate, and knowing which sessions those are."* | rising per step |
| **7. CLOSE** |
| 7.1 | 2:45–2:51 | 6 | Disclaimer card, full bleed. | GFX | *"Paper trading and historical analysis only. Not investment advice."* | bed thins |
| 7.2 | 2:51–3:00 | 9 | Close card: thesis in serif italic, repo link, Arthaton tag, provenance strip. | GFX | *"It is right about half the time, and I would rather tell you that than show you a number I invented."* | bed resolves and ends |

---

## Word count per beat

| beat | words | seconds | wpm |
|---|---|---|---|
| 1 Hook | 25 | 15 | 100.0 |
| 2 Problem | 45 | 20 | 135.0 |
| 3 What it is | 42 | 20 | 126.0 |
| 4 Demo | 103 | 55 | 112.4 |
| 5 How it works | 67 | 30 | 134.0 |
| 6 Honesty | 51 | 25 | 122.4 |
| 7 Close | 30 | 15 | 120.0 |
| **total** | **363** | **180** | **121.0** |

Reference is 119.3 wpm over runtime. **+1.4%**, inside the ±10% acceptance band.

The hook is deliberately the slowest beat (100 wpm) and the abstention hold is deliberately
empty — both are the reference's own behaviour at its two text cards, measured in
`STYLE_SPEC.md` §7.

---

## Persistent elements — every frame

From `STYLE_SPEC.md` §4, items 2 and 3:

- **Top-left chip:** `NSE COPILOT · HOLDOUT READ ONCE`
- **Bottom provenance strip:** `REAL APP · FROZEN MODEL · EVERY FIGURE READ FROM ml/artifacts/ · PAPER TRADING ONLY, NOT INVESTMENT ADVICE`

The strip is the reference's single most transferable element and it is the honesty
constraint made visual. It never leaves.

---

## The two figures, and how each is labelled on screen

Enforced by `src/honesty.test.ts` and bound through `data.ts`. These must never be
conflated (§6 of the brief):

| figure | on-screen label | baseline shown beside it | appears in |
|---|---|---|---|
| direction, final holdout, 5,729 rows | **HOLDOUT · READ ONCE** | always-up, same split | 2.3, 6.1, 6.3 |
| move-size, median on called sessions | **VALIDATION · ON THE SESSIONS IT CALLS** | base rate, 4 windows | 3.3, 6.3 |

The move-size head **never read the final holdout**. It does not appear under any label
implying it did — `MODEL_CARD.md` §9.5 is explicit, and the artifact carries a
`holdout_note` saying so.

---

## What is deliberately not in this video

- **The assistant / chat beat.** The brief allows it only with a real `GEMINI_API_KEY`.
  There is none, so the app is in `LLM_MODE=mock` and its prose is locally generated.
  Recording that and presenting it as the model talking is exactly the failure this
  project is a reaction to. The beat is cut and the time given to evidence (4.7) and the
  confidence ladder (6.3) instead. → `HUMAN_TASKS.md`.
- **Paper-trading returns.** +10.08% is the most quotable number in the repo and the least
  defensible one — survivorship bias, and a short leg assuming borrow a retail account may
  not get. `MODEL_CARD.md` §8 calls it an illustration, not a claim about tradeability. It
  is not in a 3-minute video where there is no room for the caveat.
- **Any 60% figure for the direction head.** It exists on validation windows and would be
  the flattering number to lead with. §6 of the model card is explicit that quoting it
  alone misrepresents an eight-point spread.
