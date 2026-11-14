# Model card — NSE Copilot direction model

Every figure below is read from `ml/artifacts/metrics.json`, produced by
`ml/src/copilot/evaluate.py`, which is the only code in this project permitted to compute a
model metric. `ml/tests/test_model_card_numbers.py` fails the build if any number here stops
matching that artifact.

**Generated** 2026-11-12T23:09:50 · **headline authoritative** yes · **holdout reads** 1
authoritative, 1 smoke.

---

## 1. Intended use

| | |
|---|---|
| **Task** | Direction of the next session's close versus today's, per name. |
| **Universe** | A fixed basket of 18 NSE large-caps. Not a stock screener. |
| **Horizon** | One session. Exactly one. |
| **Output** | A calibrated probability of an up move, **or** an explicit abstention. |
| **Intended user** | A salaried investor holding ₹2–5 lakh across 6–8 large-caps, checking weekly, deciding whether today is a day to act or wait. |
| **Intended decision** | Act today, or wait. Nothing finer. |

### Out of scope

Not intraday. Not a tip service or ranked pick list. Not portfolio optimisation — it says
nothing about size, allocation or hedging. No execution; paper trading and historical
analysis only. Not investment advice, and not from a SEBI-registered investment adviser.
Not a price target: see §5.2, where R² on return magnitude is approximately zero, which is
why the product acts on direction or says nothing.

### Unsuitable uses

- **Any horizon other than one session.** Nothing here was measured over a week or a month.
- **Names outside the basket.** The cross-sectional features are ranks *within* these 18.
- **Position sizing from the probability.** A 62% is not twice as actionable as a 31%; the
  magnitude head has no measurable skill (§5.2).
- **Buy-side conviction specifically.** See §5.5 — the measured edge above the threshold is
  almost entirely in down-calls, and the up-calls are close to a coin flip.

---

## 2. Data

| | |
|---|---|
| Source | yfinance auto-adjusted daily OHLCV, disk-cached per symbol |
| Span | 2015-01-01 → 2026-11-09 |
| Panel | **49,759** labelled rows · 18 tickers |
| Features | **58**, all scale-free, hard ceiling of 60 |
| Label | Sign of the next session's close-to-close return |
| Macro | Nifty 50, Nifty Energy, India VIX, Brent, USD/INR, gold, S&P 500, Nasdaq |
| Sentiment | FinBERT on a news corpus covering **Reliance only**, from 2024-12-10 |

**No raw prices and no close lags are features.** This is deliberate and it is the single
biggest correction from the earlier version of this project, which fed the model 300-odd
columns including absolute rupee prices and 30 raw close lags; it partitioned on 2017–2024
price *levels* and was then asked about 2026. Every feature here is a return, a ratio, a
z-score, a cross-sectional rank or a calendar flag.

---

## 3. Evaluation protocol

**Stated before the results, deliberately** — so it is visible that the metric was not
chosen after seeing which one flattered the model.

### 3.1 Purged walk-forward, with an embargo

Four expanding-window folds, split on **dates** rather than rows, with a **5-session
embargo** between every train and validation block:

| Fold | Train rows | Train end | Validation | Val rows |
|---|---|---|---|---|
| fold1 | 29,291 | 2021-12-24 | 2022-01-03 → 2022-12-30 | 4,216 |
| fold2 | 33,507 | 2022-12-23 | 2023-01-02 → 2023-12-29 | 4,165 |
| fold3 | 37,672 | 2023-12-21 | 2024-01-01 → 2024-12-31 | 4,182 |
| fold4 | 41,854 | 2024-12-23 | 2025-01-01 → 2025-06-30 | 2,091 |

Splitting on dates matters because the panel is pooled across 18 tickers: a row-wise split
would put 2022-03-11 Reliance in train and 2022-03-11 Infosys in validation, and the
cross-sectional rank features make same-date rows directly informative about each other.

The embargo exists because features look back up to 60 sessions. Without it the first days
of a validation fold share a window with the last days of training.

### 3.2 What was chosen where

Everything tunable — the three-candidate hyperparameter grid, scored by fold log loss, and
the abstention threshold — was chosen **on the folds above**. The selected model is the most
regularised of the three candidates: `num_leaves 7`, `learning_rate 0.03`,
`min_child_samples 200`, `n_estimators 300`.

Calibration is isotonic regression fit on **out-of-fold** walk-forward predictions, never on
the holdout.

### 3.3 The holdout, read once

| | |
|---|---|
| Window | 2025-07-01 → 2026-11-09 |
| Rows | **5,729** |
| Final model trained on | 43,945 rows, ending 2025-06-23 |

The model, the calibrator and the abstention threshold were frozen into `model.pkl` before
this window was read. `ml/artifacts/holdout_ledger.json` is an append-only, committed record
of every read: **1 authoritative, 1 smoke**, both with identical content hashes
(`3d37877d64dfbb4b`) and model fingerprints (`06ac4f817614aa67`).
`ml/tests/test_artifacts.py` fails if a second authoritative read ever appears, which is what
makes "read exactly once" a checkable claim rather than an assertion.

---

## 4. Metrics

### 4.1 Direction, on the holdout (n = 5,729)

| | |
|---|---|
| Accuracy | **51.37%** |
| Balanced accuracy | 51.83% |
| AUC | 0.5254 |
| Brier | 0.2507 |
| Log loss | 0.6947 (uncalibrated: 0.6956) |
| Base rate of up sessions | 48.91% |
| Share predicted up | **71.04%** |

### 4.2 Baselines, identical split

| | Accuracy | AUC | Brier |
|---|---|---|---|
| **This model** | **51.37%** | **0.5254** | **0.2507** |
| Always predict up | 48.91% | 0.5000 | 0.5109 |
| Previous-day sign | 48.54% | 0.4852 | 0.5146 |
| Logistic regression, 3 features | 48.58% | 0.5029 | 0.2505 |

All three directional baselines are beaten, by about 2.5 points. The honest framing of that
number is in §6.

### 4.3 Calibration

Expected calibration error **3.07%**, maximum 12.98%, across 5 populated bins. Of the
sessions where it said 47%, 46.9% went up.

### 4.4 Abstention, at the frozen threshold of 0.60

| | |
|---|---|
| Coverage | **10.16%** — it calls 582 of 5,729 sessions |
| Accuracy when it calls | **55.50%** |
| Accuracy if it called everything | 51.37% |
| Accuracy on the sessions it declined | 50.90% |

The threshold is not the accuracy-maximising point on the coverage curve — that sits further
right, at near-zero coverage. It was chosen on validation folds and frozen.

### 4.5 Return magnitude

| | |
|---|---|
| R² | **−0.0011** |
| MAE | 0.0104 |
| RMSE | 0.0146 |
| Mean absolute actual return | 0.0103 |

Approximately zero, as expected for this horizon and asset class. The MAE is essentially
the mean absolute return, i.e. the model has learned the average move and nothing about
which sessions are bigger. **This is why the product never shows a price target.**

---

## 5. Failure modes

### 5.1 It predicts "up" far more often than up happens

71.04% of its predictions are up, against a 48.91% base rate. The calibration layer keeps
the *probabilities* honest, but the argmax is strongly long-biased, which is why the UI
shows a probability and an abstention rather than a BUY/SELL badge.

### 5.2 It cannot size a move

Covered in §4.5. Treating the probability as a magnitude is the most likely way for a user
to misuse this.

### 5.3 It is worst in the middle volatility tercile

| Regime | VIX range | n | Accuracy | AUC |
|---|---|---|---|---|
| Calm | ≤ 14.21 | 4,148 | 50.51% | 0.5207 |
| Normal | 14.21 – 17.28 | 714 | 48.18% | 0.4568 |
| Stressed | > 17.28 | 867 | **58.13%** | 0.5939 |

I expected the opposite and had written the opposite into a source comment before reading
the table. In the normal tercile it is **below** a coin flip and its AUC is below 0.5, which
means on those 714 rows its ranking was worse than random.

### 5.4 One holdout window, and the per-year split moves

| Year | n | Accuracy | AUC |
|---|---|---|---|
| 2025 (from July) | 2,142 | 48.60% | 0.4931 |
| 2026 (to November) | 3,587 | 53.02% | 0.5437 |

The headline is a single 16-month measurement, not a stable estimate. On the 2025 half the
model is **below** the always-up baseline. Anyone reading 51.37% as a reliable forward
number is reading it wrong.

### 5.5 The edge above the threshold is almost entirely in the down-calls

This is the most important caveat in this card and it is not visible in any single published
metric, so here is the arithmetic, entirely from the calibration bins in §4.3 and the
threshold in §4.4:

| Calls | Bin | n | Mean predicted | Observed up-rate | Accuracy |
|---|---|---|---|---|---|
| **Down-calls** | 0.2–0.3 | 34 | 0.2878 | 0.2941 | 70.59% |
| **Down-calls** | 0.3–0.4 | 310 | 0.3905 | 0.4258 | 57.42% |
| **Down-calls** | *combined* | **344** | | | **58.72%** |
| **Up-calls** | 0.6–0.7 | 238 | 0.6382 | 0.5084 | **50.84%** |
| | **total** | **582** | | | **55.50%** |

344 + 238 = 582 signals and the combined accuracy reproduces the artifact's
`accuracy_when_signalling` of 0.554983 exactly, which is how you can check this table is a
reading of the published numbers and not a separate measurement.

Two consequences, and they matter more than the headline:

1. **The up-calls are a coin flip.** 50.84% on 238 calls, while the model was claiming an
   average 63.82% for them. In the one band where it chooses to speak on the upside, it is
   substantially over-confident on the holdout, despite a 3.07% ECE overall — the aggregate
   calibration is carried by the crowded bins near 0.5.
2. **The abstention product's measured value is a short/avoid signal**, not a buy signal.
   That is an awkward result for a retail tool, and the opposite of what a user wants.

I am reporting this rather than reporting 55.50% and stopping, because 55.50% on its own
invites exactly the wrong conclusion. Fixing it would mean changing the model, which §6.5 of
the build spec freezes once the holdout is read.

### 5.6 What it does when it cannot run

Nothing is estimated. With the model service unreachable every model-backed surface shows an
explicit error naming it, and the assistant says it cannot give a signal. There is no
fallback to a cached or interpolated figure anywhere in the application.

---

## 6. Why the accuracy is not higher

The question a judge should ask, answered before it is asked.

**51.37% is close to the ceiling for this problem as posed.** Pooled next-session direction
on liquid large-caps is near-efficient; published cross-sectional work on daily equity
direction lives in the low-to-mid fifties, and a number above 60% on a setup like this is
nearly always a leak rather than a discovery. The most common leaks are precisely the ones
this pipeline is built to exclude — a row-wise rather than date-wise split, no embargo
against look-back windows, calibration fit on the evaluation data, features standardised
before splitting, or a threshold tuned on the test set.

**Capacity is not the constraint.** The selected model is the *most regularised* of the
three candidates, chosen by fold log loss. A deeper model scored worse. The signal-to-noise
ratio on a one-session horizon is the constraint, and more parameters cannot manufacture
signal that is not in the data.

**This was tested rather than asserted.** `ml/experiments/RESULTS.md` records a search for
60%: 29 configurations across five algorithm families (LightGBM, HistGradientBoosting,
random forest, extra trees, regularised logistic regression), five feature sets, five
noise-reduction schemes, recency weighting, regime specialisation, and a five-model
ensemble — all on the walk-forward folds, with the holdout untouched.

Every one of them lands between **51.3% and 51.8%** on a fold that played no part in
selecting it. Added features contributed nothing (a 0.23-point spread, including
short-horizon reversal, the best-documented daily equity effect there is). Every
noise-reduction scheme made it worse. ExtraTrees beat this model by 1.5 points on the
selection folds and then came **last** of three on the confirmation fold — overfitting to a
validation set, visible in one table.

The search also measured the thing that makes all such numbers suspect: the
**validation-to-unseen gap on this problem is 2.6 to 4.6 points**, and it is largest for
whichever configuration searched hardest. That is why this card's headline is a holdout
number and not a validation number.

**The earlier version of this project reported 58.15%** with raw prices and 30 close lags as
features and a row-wise split. That number was higher and meant nothing. Going from 58.15%
to 51.37% is the actual result of this work.

**The usable product is not the headline.** It is the 55.50% on the 10.16% of sessions where
conviction clears a frozen threshold, plus knowing *which* sessions those are — and, per
§5.5, knowing that the edge there is concentrated in the down-calls.

### Where 60% does exist, and why it is not the headline

The model clears 60% if it abstains enough. On the 2025 H1 validation fold, at its own
frozen threshold of 0.60, it scores **62.50%** on the 19.1% of sessions it calls — 400
calls.

The same model, at the same threshold, scores **55.50%** on the final holdout.

Two adjacent windows, seven points apart, no change to anything. So rather than pick one,
`ml/experiments/robustness.py` measures the identical claim in every window, each
out-of-sample for a model fitted only on the data preceding it:

| window | full accuracy | coverage | accuracy on calls |
|---|---|---|---|
| val 2022 | 56.57% | 31.6% | **61.38%** |
| val 2023 | 54.38% | 15.3% | **63.68%** |
| val 2024 | 52.25% | 13.9% | 55.77% |
| val 2025 H1 | 51.79% | 19.1% | **62.50%** |
| final holdout | 51.37% | 10.2% | 55.50% |

**Median 61.38%, range 55.50–63.68%, at or above 60% in three of five windows.** Full
coverage stays near 52% throughout.

The defensible statement is therefore: *on the sessions where conviction clears the frozen
threshold, accuracy has a median of 61.4% across five out-of-sample windows and ranged from
55.5% to 63.7%.* Any single one of those numbers quoted alone — including the flattering
63.68% — would misrepresent an eight-point spread. The headline of this card stays the
full-coverage holdout figure because that is the number with the least room to flatter.

Coverage is not stable either: 31.6% in 2022 falling to 10.2% on the holdout. The model has
become less willing to call over time, which is the frozen threshold behaving correctly as
the available edge decayed rather than a defect.

---

## 7. Reproducibility

```bash
python -m venv ml/.venv && ml\.venv\Scripts\activate   # Windows
pip install -e "./ml[dev]"
python ml/tasks.py data     # re-ingest + features + labels   ~10 min
python ml/tasks.py train    # walk-forward + calibration      ~25 min
python ml/tasks.py eval     # metrics.json                    ~1 min
```

| | |
|---|---|
| Python | 3.12.x exactly — pinned in `ml/pyproject.toml` |
| Seed | `RANDOM_SEED` in `ml/src/copilot/config.py`, threaded into LightGBM and every split |
| Dependencies | Pinned to exact versions, not ranges |
| Single source of truth | `ml/src/copilot/config.py` — universe, dates, splits, embargo, costs |

**`python ml/tasks.py eval` will not reproduce the numbers in this card, and should not be
run casually.** It consumes a second *authoritative* holdout read, after which the headline
is no longer out-of-sample and `test_artifacts.py` fails by design. To exercise the
evaluation code without that, set `COPILOT_HOLDOUT_SMOKE=1`; the run is tagged in the ledger
and stamps `headline_authoritative: false` into the artifact, which the model card UI then
displays as a warning banner.

What `train` *does* reproduce deterministically, given the same panel, is the model
fingerprint `06ac4f817614aa67`.

### A known inconsistency in the artifact

`metrics.json` embeds a copy of the disclaimer string as it stood when the artifact was
generated, which was before the SEBI clause was added to `ml/src/copilot/config.py`. That
field is **not** what any user sees — the disclaimer rendered in the UI comes from
`src/components/finance/Disclaimer.tsx`, pinned by test to the Python constant, and the live
API generates its copy per request. Correcting the artifact's copy would require re-running
`eval` and consuming the holdout, so the stale string stays and is disclosed here instead.
No measurement is affected.

---

## 8. Known limitations

Read verbatim from `known_limitations` in the artifact:

1. **Survivorship bias.** The universe is *today's* large-caps, so names that were large-caps
   in 2015 and fell out are absent. This biases backtest returns upward and cannot be
   corrected without point-in-time constituent history.
2. **News sentiment covers Reliance only**, from 2024-12-10, so `news_available` is 1 on
   roughly 1% of panel rows and 0 everywhere else.
3. **`TATAMOTORS.NS` is fetched as `TMPV.NS`** after the Tata Motors demerger, and a demerged
   entity's pre-demerger history is not a perfectly continuous series.
4. **Prices are yfinance auto-adjusted closes.** A vendor restatement of a historical split
   or dividend would change the panel.
5. **Paper trading assumes a fill at the close** with a flat bps cost — no market impact, no
   partial fills, no borrow cost or availability for the short leg.

### Paper trading, for completeness

Historical only, on the holdout window, no real money and no broker. 337 sessions, a
position in 65 of them, 1.73 names held on average. At the default **realistic** cost
assumption of 13 bps per round trip: total return 10.08%, annualised 7.44%, Sharpe 0.847,
maximum drawdown −4.47%. Two other cost scenarios (7 and 25 bps) are reported in the
artifact and on `/dashboard`.

Given §5.5 and the survivorship bias above, treat this as an illustration under stated
assumptions, not a claim about tradeability. The directional edge is the measured claim.

---

## 9. Ethical and practical considerations

- **It can be wrong about money.** Roughly 48 times in 100 when it speaks, by its own
  measurement; and on the 2025 half of the holdout it was worse than always-up.
- **Abstention is the safety mechanism**, and it is load-bearing: a wrong call costs money
  and brokerage, while a skipped session forgoes an edge that was never measurable. The
  threshold is set to be paid for, not to be busy.
- **No real money path exists in the codebase.** Nothing reaches a broker; outbound actions
  queue for human approval.
- **The assistant quotes this card against itself**, including the regime table where it is
  below a coin flip, rather than defending its own output.
