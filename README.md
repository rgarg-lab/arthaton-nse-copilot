# NSE Copilot

**Most stock tools always have an answer. This one tells you when it doesn't.**

Two frozen models over a fixed basket of NSE large-caps, with an explicit abstention when
conviction is low, the closest historical sessions as evidence, and a measured track record
the assistant will quote against itself.

**Judging this?** [`SUBMISSION.md`](./SUBMISSION.md) maps each criterion to the file that
evidences it, and lists what is wrong with the project before you find it.

### What it actually scores

| | measured | on |
|---|---|---|
| **Will tomorrow be a big move?** | **60.20%** | the 42–50% of sessions it calls · median of 4 out-of-sample windows, range 58.46–61.64%, ≥60% in 3 of 4 |
| **Which way will it move?** | **63.06%** | the 16.2% of sessions clearing its frozen gate · walk-forward validation |
| *the same gate, on the final holdout* | *55.50%* | *7.57 points lower — validation flatters, and the app shows both* |
| *direction, if forced to call every session* | *51.37%* | *final holdout, read exactly once* |

The first row is the honest headline: **volatility clusters and direction does not**, so a
model asked "how big?" beats the same features asked "which way?" by a wide margin — and it
has something to say about nearly half the sessions rather than a tenth.

The last row is the one most projects would bury. Next-session direction on liquid
large-caps is close to a coin flip, and
[29 configurations](./ml/experiments/RESULTS.md) failed to beat it. That number is the
result of the work, not a shortfall in it — the previous version of this project reported
58.15%, and [one line of splitting code](./README.md#what-i-got-wrong-and-what-this-is-a-reaction-to)
explains the entire difference.

Submission for **Arthaton 2026** — theme *AI for Finance*, track *Trading and market
insights*. Solo entry.

> **Historical and paper-trading analysis only. Not investment advice.** No real money, no
> broker, no live execution. Past measured accuracy does not predict future results.

---

## The measured result, up front

Every number in this section is read from
[`ml/artifacts/metrics.json`](./ml/artifacts/metrics.json), which is produced by
[`ml/src/copilot/evaluate.py`](./ml/src/copilot/evaluate.py) and committed. Nothing here
was typed by hand, and `tests/honesty.test.ts` fails the build if a metric-shaped literal
appears anywhere in the UI.

**For the full evaluation protocol, failure modes and limitations, read
[`MODEL_CARD.md`](./MODEL_CARD.md).** It states the protocol before the results, and §5.5
carries the caveat that matters most and is not visible in any single headline figure: above
the abstention threshold the measured edge is almost entirely in the *down*-calls, while the
up-calls are close to a coin flip.

**Final holdout: 2025-07-01 → 2026-11-09, 5,729 rows the model never saw.** Read exactly
once; the ledger is at [`ml/artifacts/holdout_ledger.json`](./ml/artifacts/holdout_ledger.json).

### Two predictions, and the second one is the good one

There are **two independent heads**, and it is worth being blunt about which is better:

| | direction | **move size** |
|---|---|---|
| question | will it close up or down? | will the move be bigger or quieter than this name's recent normal? |
| accuracy | **51.37%** on the holdout | **60.20% median** on the sessions it calls |
| how stable | 8.18-point spread across windows | **3.18-point spread** |
| how often it calls | ~10% of sessions | **42–50% of sessions** |
| held up out of sample? | lost 2.6–4.6 points | **gained 0.5** |

Direction is close to a martingale, and §6 of the model card records 29 configurations that
failed to beat 51.37% — different algorithms, extra features, noise reduction, recency
weighting, regime models, an ensemble. That number is not a shortfall, it is the answer.

**Volatility clusters**, so the same features answer a magnitude question far better. That
head is measured across four out-of-sample windows (58.46% / 60.17% / 60.23% / 61.64%) and,
unlike everything in the direction search, it *gained* accuracy on the fold that selected
nothing — which is the difference between an effect and a search artefact.

It is also the question this product's user actually asks: *is today a day to act or wait* is
about magnitude, not sign. On the current panel direction calls 0 of 17 names and move size
calls 9.

The two are never merged. "Bigger than usual" is not "up", the agent's tool description
forbids combining them, and the rules layer flags a directional claim with no `get_signal`
behind it. Full detail in [`MODEL_CARD.md` §9](./MODEL_CARD.md).

| | Accuracy | AUC | Brier |
|---|---|---|---|
| **This model** (calibrated LightGBM) | **51.37%** | **0.5254** | **0.2507** |
| Always predict up | 48.91% | 0.5000 | 0.5109 |
| Previous-day sign (momentum) | 48.54% | 0.4858 | 0.5146 |
| Logistic regression, 3 features | 48.58% | 0.5095 | 0.2501 |

**51.37% is the honest answer, and it is the point.** Next-session direction on large-cap
equities is close to a coin flip. The model beats all three directional baselines by
2.5–2.8 points and has a positive AUC, which is a real but small edge — and a tool
reporting 58% here would be reporting a leak, not a discovery. See
[What I got wrong](#what-i-got-wrong-and-what-this-is-a-reaction-to).

### What abstention buys

| | |
|---|---|
| Frozen conviction threshold | **60.0%** |
| Coverage — sessions it will call | **10.2%** (582 of 5,729) |
| Accuracy **when it calls** | **55.50%** |
| Accuracy if it called everything | 51.37% |

Declining 89.8% of sessions moves accuracy from 51.4% to 55.5%. The threshold was chosen
on walk-forward validation and **frozen before the holdout was read**, so that is an
out-of-sample consequence rather than a curve fitted to the result.

### The things that are not flattering

| | | |
|---|---|---|
| Return-magnitude R² | **−0.0011** | Approximately zero. The model cannot predict the *size* of a move, which is why the product acts on direction with abstention and labels its range as volatility-implied. |
| Expected calibration error | 3.07% | Probabilities mean what they say. |
| Max calibration error | 12.98% | One sparse decile. Only 5 of 10 bins are populated — a well-behaved model on this problem concentrates near 0.5. |
| Accuracy, 2025 half-year | 48.60% | Worse than always-up, on 2,142 rows. |
| Accuracy, 2026 | 53.02% | On 3,587 rows. The headline is an average of these two. |

### Per volatility regime — where my expectation was wrong

| Regime (India VIX tercile) | Rows | Accuracy |
|---|---|---|
| Calm | 4,148 | 50.51% |
| Normal | 714 | 48.18% |
| Stressed | 867 | **58.13%** |

I expected the stressed tercile to be the *worst* — more volatility, more noise — and
wrote that into a docstring before reading the table. It is the best, and the middle
tercile is the weakest. A plausible reading is that high-VIX sessions have larger, more
persistent moves while mid-vol sessions have neither drift nor momentum. **But this is
three numbers from one window, not an established fact, and nothing in the product is
tuned on it** — the threshold is regime-independent. The note is kept in
`evaluate.py` because the original claim is the kind of confident sentence this project's
own artifact would have contradicted.

### Cost-aware paper trading

Long/short the names clearing the frozen threshold, equal-weighted, flat otherwise, over
the 337 holdout sessions. Costs charged on every position change, three scenarios:

| | Total return | Sharpe |
|---|---|---|
| Optimistic (7 bps round trip) | +14.45% | 1.17 |
| **Realistic (13 bps)** | **+10.08%** | **0.85** |
| Pessimistic (25 bps) | +1.82% | 0.20 |
| Buy and hold, no costs | +2.63% | 0.22 |

**Read this with the survivorship caveat below.** The universe is today's large-caps, which
biases any backtest return upward, and the short leg assumes borrow that a retail account
may not get. The directional edge is the measured claim; this table is an illustration of
what it would be worth under stated assumptions.

The equity curve is on the model card, and it is flat for long stretches on purpose: the
strategy inherits the model's abstention and holds a position on **65 of 337 sessions**,
sitting in cash for the rest. That is also why "positive sessions" reads 9.5% — it is a
share of *all* sessions, not of the ones it traded.

---

## What it does

Five surfaces, each backed by a real endpoint.

| Surface | What it shows |
|---|---|
| **`/signals`** | Today's call for each name in the panel (17 — see the universe note below) — or an abstention card with the reason. Calibrated probability, conviction against the threshold, volatility-implied range. |
| **`/dashboard`** | The model card: calibration curve, four baselines, coverage-vs-accuracy curve, per-year and per-regime breakdowns, known limitations. |
| **`/evidence`** | The historical sessions most like today, with real dates and the real return that followed each one, plus the empirical up-rate among them. |
| **`/workspace`** | The Copilot. Asks the model service for figures rather than reasoning about prices itself; the trace shows every tool call and every rule that fired. |
| **`/watchlist`** | The names you track, each with its live call, plus the risk profile. The only state here that is the user's rather than the model's. |

### The abstention is the product

Ask it to call a stock on a low-conviction day and it declines, then explains the refusal
with its own measured accuracy and the split among the closest historical sessions. That
is the thing the other nine stock predictors in the room will not have.

It is not a hedge or a degraded mode. When the model abstains, the API **omits the
`direction` field entirely** — a client cannot render a call it was never given, which is a
stronger guarantee than trusting every call site to check a flag. `src/lib/rules/finance.ts`
enforces it a second time, independently, on the agent's prose.

---

## Run it

Python 3.12 and Node 22 are the only prerequisites. **Three commands**, and no API keys:

```bash
npm ci                                 # 1. install the app
pip install -e ./ml && npm run db:migrate   # 2. install the ML service and the embedded DB
npm run demo                           # 3. http://localhost:3000
```

`npm run demo` boots **both** processes — it finds the right Python interpreter, waits for
the model service to finish loading its artifacts before starting the web server, does a
production build rather than `next dev`, and stops both on one Ctrl-C. Those four details
are each a way this used to go wrong for someone running it for the first time.

To run the two services yourself instead: `python ml/tasks.py serve` in one terminal,
`npm run dev` in another.

The app runs **without** the ML service — the agent loop, memory, approvals and the outbox
all work, and the model-backed panels show an explicit "service not answering" state. They
do not show placeholder figures. That is deliberate and it is the whole argument of this
project.

With no `GEMINI_API_KEY` the assistant runs in mock mode: real tool calls, real rules, real
approvals, with locally-generated prose that says it is not a real model call. See
[`HUMAN_TASKS.md`](./HUMAN_TASKS.md) to add the key.

### Verify it

```bash
npm run build          # production build; types checked here too
npm test               # 197 tests, mock mode, no keys needed
npm run demo-check     # preflight + eval suite + browser smoke test
python ml/tasks.py test # 38 tests, including the leakage and purge tests
```

### Rebuild the model from scratch

```bash
python ml/tasks.py data      # re-ingest, rebuild features and labels  (~10 min)
python ml/tasks.py train     # walk-forward selection + calibration    (~25 min)
python ml/tasks.py eval      # metrics.json                            (~1 min)
python ml/tasks.py signals   # today's calls
```

`python ml/tasks.py help` lists every target. `make -C ml <target>` works identically
wherever `make` is installed — the Makefile is a thin wrapper over `tasks.py`, which is the
canonical implementation, so the pipeline also runs on a machine without `make`.

**`ml/data/processed/panel.parquet` and `ml/artifacts/**` are committed on purpose.** A
fresh clone has to run without Yahoo Finance cooperating; an upstream outage on judging day
cannot be the thing that makes the project unrunnable.

---

## How the ML works

### Data

- **18 NSE large-caps**, fixed: Reliance, HDFC Bank, ICICI Bank, Infosys, TCS, L&T, ITC,
  SBI, Axis Bank, Bharti Airtel, Kotak Mahindra, HUL, Maruti, Sun Pharma, Tata Motors,
  Asian Paints, Bajaj Finance, NTPC.
- **8 macro series**: Nifty 50, Nifty Energy, India VIX, Brent, USD/INR, Gold, S&P 500,
  Nasdaq.
- 2015-01-01 → today, **49,759 labelled rows**, yfinance, disk-cached per symbol.

### Features — 58, scale-free

No raw prices and no close lags. Returns at six horizons, moving-average *deviations*,
RSI, price-normalised MACD, Bollinger %B, realised volatility at four windows, vol-of-vol,
return skew, volume z-score, intraday spreads, **cross-sectional ranks within the basket**,
relative strength vs the index and the sector, a macro block, calendar flags including F&O
expiry week, and FinBERT sentiment with a staleness decay.

Everything is a ratio, a z-score, a rank or a bounded oscillator. That is what makes
pooling across 18 tickers valid: a 1.2% move means the same thing in HDFC Bank and in NTPC;
a ₹1,600 close does not. **Ticker identity is not a feature** — the model is a claim about
market states, not about which eighteen names were picked.

The top-weighted feature is the **S&P 500's previous close** (14.6% of total gain), which
is the sensible answer: the US session closes before the NSE opens.

### Validation — the part that decides whether any of this means anything

- **Purged walk-forward**, expanding window, four folds (val 2022 / 2023 / 2024 / 2025H1).
- **Five-session embargo** between train and validation. The label for row *t* is the
  *t → t+1* return, so without the purge the last training row's *outcome* is the first
  validation session's *move*.
- Splits are on **dates**, not rows: 18 tickers share each session, and cross-sectional
  rank features make same-date rows directly informative about each other.
- All preprocessing — VIX terciles, imputation medians — refit **inside each fold** on
  training rows only.
- **Final holdout 2025-07-01 → today, read exactly once**, after the model, the calibrator
  and the threshold were frozen.

`ml/tests/test_purge.py` asserts that no date appears on both sides of any fold, that the
embargo gap is at least five sessions, and that no fold touches a holdout date.
`ml/tests/test_leakage.py` asserts the stronger property: **perturb the last 30 sessions'
prices and no earlier feature row moves.** If any feature read its own future, that test
fails.

### Model

Pooled LightGBM, two heads (direction classifier, return regressor), the most heavily
regularised of three candidate parameter sets — selected by mean per-fold log loss, not
accuracy, because the product shows a *probability*.

**Isotonic calibration on out-of-fold predictions.** This is what makes the displayed
number a real probability, and it is the direct replacement for the earlier project's
hardcoded 60.

---

## What I got wrong, and what this is a reaction to

This project is a rebuild of my earlier Reliance predictor
(`Reliance-Stock-AI`). The pipeline was rewritten rather than ported, because the old one
had specific, nameable defects. Each one is now a constraint with a test behind it:

| Old defect | What it actually was | Fix here |
|---|---|---|
| A polished metrics page: accuracy 58.15%, a confusion matrix, an AUC, 50 "epochs" of training curves | **Every figure invented**, as literals in the frontend — for a tree model that has no epochs | One producer of metrics (`evaluate.py`), one artifact, and a test that fails the build on a metric-shaped literal in TSX |
| A confidence of "60%" | A **Python function default argument** | Isotonic calibration on out-of-fold predictions; the curve is on the model card |
| An LLM summary citing "47 recent news articles" | It had read **none** | Explanations are grounded by tool calls; a rule annotates any directional claim with no `get_signal` behind it |
| Features: every column, including raw rupee prices and 30 raw close lags | The model partitioned on 2017–2024 price *levels*, then was asked about 2026 | 58 scale-free features, no prices, no lags, ≤60 ceiling |
| A row-wise random train/test split | **This was the real leak** — see the measurement below | Purged walk-forward split on dates, with a 5-session embargo |

### Which of those defects actually cost the accuracy — measured, not assumed

This table blamed the price features for the inflated number. That was wrong, and
`ml/experiments/why_58.py` reintroduces each defect to the current pipeline one at a time to
find out which mattered:

| setup | accuracy | AUC | accuracy at 0.70 conviction |
|---|---|---|---|
| Honest: date split, no prices | 55.03% | 0.5681 | 63.46% |
| **+ raw prices and 30 close lags** | **54.64%** | 0.5693 | 61.39% |
| **+ row-wise random split** | **64.23%** | **0.6941** | **82.78%** |
| Both (the old pipeline) | 63.62% | 0.6855 | 80.47% |

**The random split is worth +9.2 points on its own. The price features are worth nothing**
(−0.4, inside noise). The intuition that absolute rupee prices let a tree memorise the time
axis is reasonable, and it is also not what happened — with a date-based split the model
cannot exploit them, and with a random split it does not need them. Eighteen tickers share
the same ~2,900 sessions, so a random split puts the same date on both sides of the
boundary, and the cross-sectional rank features make those rows mutually informative.

That is the honest answer to "why was the old number higher": one line of splitting code.
| `improved_model_v4.py` | Future-target leakage, in-sample stacking, test-based model selection | Purged walk-forward, a once-read holdout, a ledger that makes the claim auditable |
| No disclaimer anywhere in `src/` | Directional calls on a real listed company with no notice at all | `<Disclaimer />` on every signal surface, asserted by a test, duplicated into every API payload |

**What was worth keeping**, and was ported: FinBERT sentiment with the staleness decay for
no-news days and the one-session shift that avoids same-day look-ahead; the day-ahead
backtest loop shape from `history.py`; and the RAG knowledge base as *content*, rewritten
for this domain.

---

## Known limitations

Written into [`metrics.json`](./ml/artifacts/metrics.json) as well as here, so they travel
with the numbers.

1. **Survivorship bias.** The universe is *today's* large-caps. A name that was a large-cap
   in 2015 and fell out is absent, which biases backtest returns upward. Not fixable
   without a point-in-time constituent history, which is not freely available.
2. **News sentiment covers Reliance only, from 2024-12-10.** `news_available` is 1 on
   roughly 1% of rows. The corpus is ~520 analyst-style impact statements written for my
   earlier project, FinBERT-scored — the scoring is real, the provenance is not a news API.
   Universe-wide sentiment is a stretch goal this build does not claim.
3. **`TATAMOTORS.NS` is fetched as `TMPV.NS`** after the Tata Motors demerger; Yahoo no
   longer serves the old symbol. A demerged entity's pre-demerger history is not a
   perfectly continuous series. **In the committed panel this ticker is absent entirely** —
   see *Honest status* below.
4. **`cal_month` is the second-heaviest feature** (8.5% of gain). A month-of-year effect on
   next-session direction is more likely a calendar artifact of this sample than a real
   signal, and it is the feature I would drop first in a v2.
5. **Prices are yfinance auto-adjusted closes.** A vendor restatement of a historical split
   or dividend would change the panel.
6. **Paper trading assumes a fill at the close** with a flat bps cost. No market impact, no
   partial fills, no borrow cost or availability for the short leg, no circuit limits.
7. **R² on next-session returns is approximately zero.** The product acts on calibrated
   direction, not on a return forecast.
8. **One holdout window.** 51.37% is one measurement over 16 months, not a stable estimate.
   The per-year split (48.60% / 53.02%) shows how much it moves.

### Honest status of the universe

The spec fixes the universe at 18 tickers. **The committed panel contains 17.**
`TATAMOTORS.NS` stopped resolving on Yahoo after the demerger, and the successor symbol
`TMPV.NS` — which does carry the full history back to 2015 — was rate-limited for the
entire build window after the first probe, across ~90 minutes of retries at ten-minute
intervals. The alias is implemented and tested (`config.SYMBOL_ALIASES`); the data is not
in the panel.

Consequences, stated rather than buried: all reported metrics are over 17 names, and
`python ml/tasks.py data` **fails loudly** if any ticker is missing rather than silently
building a smaller panel. Re-running it once Yahoo's throttle clears will produce the full
18, and will require re-running `train` — which, per §6.5 of the build spec, would mean
re-reading the holdout and saying so.

---

## Architecture

```
app/              Next.js 16 App Router — landing, signals, model card, evidence, workspace
src/
  lib/ml/         the only path from TypeScript to the model
  lib/tools/      finance.ts: get_signal, get_model_metrics, find_similar_days
  lib/rules/      finance.ts: four invariants the model cannot override
  components/     finance/ alongside the inherited shell; the shell is unchanged
ml/
  src/copilot/    config, ingest, features, sentiment, labels, validation,
                  train, evaluate, magnitude, confidence, neighbors, signals, api
  artifacts/      COMMITTED: model.pkl, calibrator.pkl, magnitude_model.pkl,
                  metrics.json, magnitude_metrics.json, confidence_tiers.json,
                  latest_signals.json, feature_importance.json, holdout_ledger.json
  data/processed/ COMMITTED: panel.parquet
  experiments/    the accuracy search — RESULTS.md, search.py, why_58.py, two_agents.py
  tests/          10 files, 104 tests, including leakage and purge
  Dockerfile      the model service as a container (see DEPLOY.md)
tests/            20 files, 238 TypeScript tests; e2e/ is the Playwright smoke test
evals/            scored agent transcripts
scripts/          preflight, demo, migrate, seed, eval, cache-clear,
                  schedule-catchup.ps1, render-walkthrough.mjs
public/
  walkthrough.html  a self-advancing 13-scene deck of the whole project (see below)
video/            the submission video — its own project, own lockfile (see below)
```

**Python owns all modelling, evaluation and finance maths. TypeScript owns the UI, the
agent loop and the conversation.** There is no model code in TypeScript and no UI logic in
Python. The agent reaches the model only through tools, and those tools compute nothing —
so there is no arithmetic in TypeScript for a wrong number to come out of.

Python has **no LLM dependency at all**. Every model call goes through
`src/lib/llm/router.ts`, which already has Gemini, a response cache, a mock provider and a
per-session budget.

### The four invariants

`src/lib/rules/finance.ts` runs on every tool call and before every final answer, and each
rule that fires appears in the trace where a judge can watch it work:

1. **No directional claim without a `get_signal` call behind it.** A language model asked
   "will Reliance go up tomorrow?" will produce a fluent, hedged, plausible paragraph from
   nothing at all. It reads identically to a real answer.
2. **An abstention is final.** The tempting bug is "marginally up" about a session the model
   declined to call — a calibrated 0.52 is still above 0.5.
3. **No phrasing implying a guaranteed return.** Annotated loudly rather than silently
   rewritten: hiding a guardrail firing is the wrong trade in a build whose argument is that
   the guardrails are visible.
4. **The disclaimer is attached to any answer containing a signal.**

---

## The video, and the walkthrough deck

Two separate things, for two separate jobs.

### `video/` — the submission video

A 3-minute video **rendered from code**: Remotion (React → frame-accurate MP4) with
`@remotion/three` for real Three.js, compositing genuine Playwright recordings of the
running app. Deterministic and re-renderable; not generative video.

```bash
cd video && npm ci && npm run render     # -> out/arthaton-submission.mp4
```

It has its own dependency tree, its own lockfile and no entry in the root
`package.json`, so it cannot affect the app build.

**The honesty rule extends to it.** Every figure on screen is read from
`ml/artifacts/*.json` at render time through `video/src/data.ts`; `video/src/honesty.test.ts`
fails the build if a metric-shaped literal appears in any scene. That matters more here than
in the app — a video is where this normally breaks, because people say "60% accurate" on
camera and nobody diffs a video against an artifact.

Its own docs: [`video/README.md`](./video/README.md),
[`STYLE_SPEC.md`](./video/STYLE_SPEC.md) (measured style contract),
[`SCRIPT.md`](./video/SCRIPT.md) (the 25-beat timing table),
[`CREDITS.md`](./video/CREDITS.md).

**Two known defects, stated rather than discovered:**

- **The voice is a synthetic scratch track** (Windows SAPI) and must be replaced with a
  real recording before submission. `video/HUMAN_TASKS.md` task 1.
- **Beat 4.6 (1:28–1:36) judders.** The capture beats are realtime Playwright recordings
  composited into a 60 fps timeline, and realtime recording cannot hold a locked 60.
  Measured unique frames per second of source footage:

  | capture | real fps |
  |---|---|
  | `abstention-payload` | **29.6** |
  | `signals-threshold` | 49.2 |
  | `signals-board` | 50.4 |
  | `evidence` | 51.8 |
  | `abstention-card`, `signals-tiles` | 55.8 |

  `abstention-payload` was recorded at ~30 fps and extracted to 60, so every frame shows
  twice for eight seconds. The fix is to re-capture by frame-stepping rather than
  recording in realtime; it is not an encoding problem — the shipped MP4 measures
  **SSIM 0.9948** against its own source frames.

Large derived artifacts are not committed: `video/out/` (the MP4 and ~2.5 GB of
intermediate frames), `video/public/frames/` (~290 MB of extracted capture sequences) and
`video/audio/*.wav` (~104 MB). All three regenerate from committed sources —
`captures/originals/` **is** committed, because the recordings cannot be reproduced without
the stack running.

### `public/walkthrough.html` — the walkthrough deck

A self-contained, self-advancing 13-scene deck covering the whole project: the honest
51.37%, the leak post-mortem, abstention, the validation-optimism tax, the magnitude head.
Open it, press `f`, press Start; space pauses a scene for narration.

It is served by the app, so on a deployed instance it is at `/walkthrough.html`.

```bash
node scripts/render-walkthrough.mjs --fps 30   # -> dist/walkthrough.webm
```

That renderer is worth a line because it is the technique the video's captures need:
`?render=1` pauses every CSS transition on the page and exposes `window.__deck`, so frames
are produced by seeking to an exact timestamp rather than by racing a clock. Capture speed
cannot affect the output, so there is no judder by construction.

---

## Credits

Arthaton requires open-source libraries and AI APIs to be credited. Every dependency is
pinned exactly in `package.json` and `ml/pyproject.toml`.

### AI APIs and models

| | Used for | Licence / terms |
|---|---|---|
| **Google Gemini** (`gemini-2.5-flash`) | The agent loop, the chat, explanations. The only LLM provider in this build. | Google AI Studio terms |
| **ProsusAI/finbert** | News sentiment scoring | Apache 2.0, via HuggingFace |
| **Claude Code** (Anthropic) | Development assistant — see *What I built vs what AI generated* |

### Python

**LightGBM** (MIT) · **scikit-learn** (BSD-3) — isotonic calibration, the logistic
baseline, metrics · **pandas** (BSD-3) · **NumPy** (BSD-3) · **SciPy** (BSD-3) ·
**PyArrow** (Apache 2.0) · **yfinance** (Apache 2.0) · **FastAPI** (MIT) · **Uvicorn**
(BSD-3) · **Pydantic** (MIT) · **joblib** (BSD-3) · **transformers** (Apache 2.0) ·
**PyTorch** (BSD-3) · **pytest** (MIT) · **ruff** (MIT)

### JavaScript / TypeScript

**Next.js** (MIT) · **React** (MIT) · **TypeScript** (Apache 2.0) · **Tailwind CSS** (MIT)
· **shadcn/ui** (MIT) · **Radix UI** (MIT) · **Recharts** (MIT) — the calibration and
coverage charts · **Drizzle ORM** (Apache 2.0) · **PGlite** (Apache 2.0) — the embedded
Postgres · **pgvector** (PostgreSQL licence) · **next-auth** (ISC) · **Motion** (MIT) ·
**lucide-react** (ISC) · **zod** (MIT) · **Vitest** (MIT) · **Playwright** (Apache 2.0) ·
**ESLint** (MIT) · **@xyflow/react** (MIT) · **Spline** (proprietary SDK, free tier) ·
**thinking-orbs** (MIT)

### Data

**Yahoo Finance** via `yfinance`, for prices and macro series. Not an official NSE feed;
see limitation 5.

### My own prior work

The UI shell is from my `hackathon-template`, an agentic-AI starter I built, which itself
inherits its layout from `pathwise` (a project I worked on with
`iAnmolAgarwal`). The ML pipeline is a rewrite of my `Reliance-Stock-AI`;
what was ported and what was deliberately not is in the table above.

---

## What I built vs what AI generated

Claude Code wrote most of the code in this repository. What was mine was the judgement:

- **The design decisions.** Pooling across tickers to make the cross-sectional features
  possible. Abstention as the product rather than a feature. Calibrating on out-of-fold
  predictions. Freezing the threshold before reading the holdout. Reporting a near-zero R²
  instead of hiding it.
- **The diagnosis of the old project.** Every row of the defects table is a conclusion I
  reached by reading my own earlier code — the `confidence=60` default argument, the
  invented metrics page, the feature selection that fed trees raw rupee prices.
- **Deleting rather than re-dressing.** The template's landing page had three well-built
  sections whose only content was counts from a seeded PRNG. Dropping them and replacing
  them with four figures read from the evaluation artifact was a choice to have a page with
  a gap in it rather than a comforting fabrication.
- **Catching the wrong claim.** The per-volatility-regime result contradicted what I had
  already written down. Finding that and correcting it, rather than shipping the sentence
  that sounded right, is the discipline this whole project is about.

[`BUILD_LOG.md`](./BUILD_LOG.md) records each decision as it was made, and marks whether it
was mine, specified, or generated.

---

## Licence

MIT — see [`LICENSE`](./LICENSE).
