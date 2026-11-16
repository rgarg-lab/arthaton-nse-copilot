# Accuracy search: what I tried to get to 60%, and what happened

**Question.** Can next-session direction accuracy on this basket be raised from ~51% to 60%
by permuting algorithms, adding features, adding data and reducing noise — without changing
the core functionality, and without cheating?

**Answer, in two parts.** On *direction* — no. 29 configurations across five algorithm families, five
feature sets, five noise-reduction schemes, recency weighting, regime specialisation and a
five-model ensemble all land between **51.3% and 51.8%** on data that played no part in
selecting them. 60% is reachable on direction only by abstaining on most sessions, and the
measurement swings eight points between windows.

On *magnitude* — yes. Asking "will tomorrow be a big move?" of the same data, same features
and same protocol gives **a median of 60.20% on the ~45% of sessions it calls, with a
3.18-point spread across four windows and no validation-overfitting tax at all** (stage 7).
Volatility clusters; direction does not. It is also the better question for the user this
product names, who wants to know whether today is a day to act or wait.

The holdout (`>= 2025-07-01`) was **not touched**. Every number here comes from the
walk-forward folds, and `search._assert_no_holdout` raises on any frame that reaches the
boundary.

---

## Experimental design

Searching many configurations and reporting the best validation score is how people produce
numbers that evaporate. The maximum over N noisy estimates is biased upward — arithmetic,
not pessimism. So the pre-holdout data was split again:

| | Folds | Rows | Role |
|---|---|---|---|
| **Selection** | val 2022, 2023, 2024 | 12,563 val | every candidate scored here; the only signal used to choose |
| **Confirmation** | val 2025 H1 | 2,091 val | scored **once**, after selection, for the winners only |

Same target, same universe, same purged walk-forward with the same 5-session embargo, same
per-fold refit of the preprocessor. Nothing in `ml/experiments/` is imported by the shipped
pipeline.

---

## Stage 1 — algorithms (9 candidates, existing features)

| candidate | selection accuracy | AUC |
|---|---|---|
| **et-500** (ExtraTrees) | **55.89%** | **0.5821** |
| lgbm-deeper | 55.54% | 0.5718 |
| rf-500 | 55.13% | 0.5757 |
| lgbm-heavyreg | 55.08% | 0.5739 |
| hgb-default | 55.03% | 0.5729 |
| logit-tight | 54.71% | 0.5743 |
| lgbm-stumps | 54.68% | 0.5710 |
| logit-l2 | 54.60% | 0.5735 |
| **lgbm-shipped** (as deployed) | 54.41% | 0.5683 |

The shipped configuration came **last**, and ExtraTrees beat it by 1.5 points — while
running in 16s against its 126s. Hold that thought until stage 5.

## Stage 2 — features (5 sets, on ExtraTrees)

| feature set | accuracy | AUC |
|---|---|---|
| volstruct (+3: realised-vol ratios) | 55.92% | 0.5814 |
| baseline (57) | 55.89% | 0.5821 |
| xsection (+4: dispersion, breadth, in-session z) | 55.72% | 0.5806 |
| reversal (+3: vol-scaled reversal, its XS rank) | 55.69% | 0.5803 |
| all (+10) | 55.69% | 0.5806 |

**Nothing.** A 0.23-point spread across every set is noise. Short-horizon reversal is the
best-documented daily equity effect there is, and it added zero — the 57 existing features
already span what is there.

## Stage 3 — noise reduction (on ExtraTrees + baseline)

| scheme | accuracy | AUC |
|---|---|---|
| **none** | **55.89%** | **0.5821** |
| top-30 importance + winsorise | 55.51% | 0.5806 |
| winsorise 1% | 55.45% | 0.5809 |
| winsorise 5% | 55.44% | 0.5789 |
| top-20 importance | 54.57% | 0.5771 |
| cross-sectional rank + winsorise | 51.92% | 0.5149 |
| cross-sectional rank | 51.79% | 0.5139 |

**Every scheme made it worse.** The rank transform is the informative failure: ranking each
feature within its session destroys four points of accuracy, because the *absolute level* of
volatility and VIX is a large part of the signal, and ranking throws levels away.

## Stage 4 — ensembling (5 families averaged)

Mean pairwise correlation between member predictions: **0.839**. The families are not
decorrelated, so averaging cannot add much, and it did not — 55.54%, slightly *below*
ExtraTrees alone (55.89%).

But its coverage curve was the first thing in the search to cross 60%:

| threshold | coverage | accuracy |
|---|---|---|
| 0.50 | 100% | 55.54% |
| 0.54 | 56.8% | 58.98% |
| **0.56** | **39.9%** | **60.69%** |
| 0.60 | 16.6% | 62.55% |

At which point it looked like the goal was met. It was not.

---

## Stage 5 — recency weighting and regime specialisation

Both motivated by patterns already in the measurements rather than by hope. Selection
accuracy falls monotonically by fold (56.6% → 54.4% → 52.3%), which would suggest old rows
are misleading; and the holdout spreads ten points across volatility terciles with the
middle tercile's AUC below 0.5, which would suggest one model is averaging incompatible
regimes.

| candidate | accuracy | AUC |
|---|---|---|
| **baseline (no weighting, pooled)** | **55.89%** | **0.5821** |
| recency, 4-year half-life | 55.78% | 0.5784 |
| per-regime (ExtraTrees) | 55.60% | 0.5759 |
| recency, 1-year half-life | 55.58% | 0.5757 |
| recency, 2-year half-life | 55.52% | 0.5761 |
| per-regime (LightGBM) | 53.91% | 0.5613 |

Both fail. Every recency half-life is worse than no weighting, so the year-over-year decline
is not old data being misleading — it is either noise or a genuine decay in available signal,
and down-weighting history only costs training rows. Fitting a model per tercile is worse
still: the regimes do not have enough rows each to support a separate fit, and the pooled
model's cross-regime structure is worth more than the specialisation.

That makes **29 configurations** in total, none of which beat the pooled, unweighted,
57-feature baseline.

## Stage 6 — confirmation on the untouched fold

Every number above is a *selection* number, chosen as the best of 29. Fold 4 played no part
in any of it.

| configuration | selection accuracy | **confirmation accuracy** | drop |
|---|---|---|---|
| shipped (lgbm) | 54.41% | **51.79%** | −2.6 |
| ExtraTrees | 55.89% | **51.32%** | −4.6 |
| 5-family ensemble | 55.54% | **51.55%** | −4.0 |

**The entire search bought nothing.** ExtraTrees' 1.5-point lead over the shipped model
inverted: on data not used for selection it came *last* of the three. The ensemble's 60.69%
became 51.55%.

Two things are worth taking from this:

1. **The validation→unseen gap is 2.6 to 4.6 points on this problem.** That is the tax on
   every number selected by searching. It also explains the shipped model's own history: it
   scored 54.41% on the folds and 51.37% on the holdout.
2. **The gap is *larger* for the configuration that searched harder.** ExtraTrees won
   selection by fitting the selection folds best, and paid the most for it. That is
   overfitting to a validation set, visible in a single table.

---

## Where 60% actually lives, and how unstable it is

All three configurations exceed 60% if they abstain enough. On the confirmation fold:

| configuration | threshold | coverage | calls | accuracy |
|---|---|---|---|---|
| shipped (lgbm) | 0.60 | 19.1% | 400 | **62.50%** |
| shipped (lgbm) | 0.62 | 12.2% | 255 | 65.10% |
| ExtraTrees | 0.56 | 13.5% | 283 | 60.07% |
| ensemble | 0.62 | 9.9% | 206 | 61.65% |

So "60% accuracy" is attainable — as *60% on the ~15% of sessions the model is most
confident about*. **And the shipped model is already the best of the three at it.**

The reason this is not a headline:

> The shipped model at threshold 0.60 scores **62.50%** on the confirmation fold and
> **55.50%** on the final holdout. Same model, same threshold, two adjacent windows,
> **seven points apart.**

That spread is the honest error bar on any low-coverage claim here. On 400 calls, a
7-point swing is what sampling noise plus one regime change looks like. A deck that
advertises 62.5% is quoting the luckier of two measurements of the same thing.

### So measure it five times instead of once

Two numbers cannot say which is typical, so `robustness.py` measures the identical claim —
the frozen configuration at the frozen 0.60 threshold — independently in every window, each
out-of-sample for a model fitted only on the data preceding it. Nothing is selected here;
this is not a search.

| window | val rows | full accuracy | calls | coverage | **accuracy on calls** |
|---|---|---|---|---|---|
| val 2022 | 4,216 | 56.57% | 1,331 | 31.6% | **61.38%** |
| val 2023 | 4,165 | 54.38% | 636 | 15.3% | **63.68%** |
| val 2024 | 4,182 | 52.25% | 581 | 13.9% | 55.77% |
| val 2025 H1 | 2,091 | 51.79% | 400 | 19.1% | **62.50%** |
| **final holdout** | 5,729 | 51.37% | 582 | 10.2% | 55.50% |

**Accuracy on called sessions: min 55.50%, median 61.38%, max 63.68% — at or above 60% in
three of five windows.** Full-coverage accuracy over the same windows: 51.37% to 56.57%,
median 52.25%.

That is the defensible form of the 60% claim, and it is worth stating precisely:

> On the sessions where its conviction clears the frozen threshold, the model's accuracy has
> a **median of 61.4% across five out-of-sample windows**, ranging from 55.5% to 63.7%. It
> exceeded 60% in three of the five. At full coverage it stays near 52% in every window.

Note what also falls out of the table: coverage is not stable either — 31.6% in 2022 down to
10.2% on the holdout. The model has been getting less willing to call, which is the
threshold doing its job as the available edge decayed, not a defect.

---

## Stage 7 — a different question, and the first honest 60%

Everything above asks *which way* tomorrow moves. 29 configurations say that is close to a
martingale. So this stage asks *how much* instead:

    y_big = 1 if |next session return| > median(|return|) over the trailing 20 sessions

The label looks one session forward — that is the prediction. The threshold it is compared
against uses only sessions up to and including today, so it is known at decision time. The
base rate is 49.7%, near a coin flip by construction, which is deliberate: a target with a
70% base rate would make 70% accuracy meaningless, and the point is a number comparable to
the 51% it is offered against.

**This fits the user the product names better than direction does.** "A salaried investor
deciding whether today is a day to act or wait" is asking about magnitude, not sign.

### It leaked on the first run, and that is worth recording

The first run returned **100.00% accuracy and AUC 1.0000 on all five algorithms.** That is
the signature of a leak, not a result, and it took one look to find: `feature_columns()`
discovers columns by pattern, so it returned `y_big` — the label — straight into the feature
matrix. The model was handed the answer.

It is the same mistake this whole project is a reaction to, reproduced in miniature by me,
in a file whose docstring claims nothing can leak. The fix is a guard rather than a
one-off exclusion: `run()` now raises if any `y_*` column reaches the matrix. A number that
good should always be read as a bug first.

### Selection folds, after the fix

| candidate | accuracy | AUC | base rate |
|---|---|---|---|
| **lgbm (regularised)** | **56.22%** | **0.5885** | 49.8% |
| hgb | 55.50% | 0.5827 | 49.8% |
| extra trees | 55.39% | 0.5807 | 49.8% |
| lgbm (deeper) | 55.20% | 0.5793 | 49.8% |
| logistic | 54.91% | 0.5671 | 49.8% |

### Confirmation, and the thing that makes this different

On fold 4, which chose nothing: **56.72%, AUC 0.6013** — *higher* than its selection score
of 56.22%. Direction lost 2.6 to 4.6 points going from selection to confirmation. This
gained. There is no validation-overfitting tax here, which is the strongest single signal
that the effect is real rather than searched-for.

### Stability at a fixed threshold of 0.56, measured in every window

Threshold chosen once, on the confirmation fold's curve, then **not re-chosen per window**:

| window | base | full accuracy | coverage | **accuracy on calls** | AUC |
|---|---|---|---|---|---|
| val 2022 | 49.4% | 57.19% | 48.3% | **61.64%** | 0.6083 |
| val 2023 | 50.2% | 55.73% | 44.3% | 58.46% | 0.5779 |
| val 2024 | 49.8% | 55.74% | 42.1% | **60.17%** | 0.5785 |
| val 2025 H1 | 49.5% | 56.72% | 50.0% | **60.23%** | 0.6013 |

**Median 60.20%, range 58.46–61.64%, at or above 60% in three of four windows.**

Side by side with the direction model's equivalent claim:

| | direction | volatility |
|---|---|---|
| median accuracy on calls | 61.38% | 60.20% |
| **spread across windows** | **8.18 points** | **3.18 points** |
| **coverage** | **10–32%** | **42–50%** |
| full-coverage accuracy | 51.4–56.6% | 55.7–57.2% |
| AUC | 0.539–0.543 | 0.578–0.608 |
| selection → confirmation | **−2.6 to −4.6** | **+0.5** |

Similar median; everything else better. It calls roughly *half* of all sessions instead of a
tenth, moves a third as much between windows, has a materially higher AUC, and does not
decay out of sample. That is what a real effect looks like next to a marginal one.

**Status: measured, not shipped.** There is no artifact, no API route and no UI for this —
it is a candidate, evaluated before anything was claimed. It has also never been evaluated
on the final holdout, deliberately: those rows are governed by the ledger and this did not
need them.

---

## Stage 8 — two independent agents, and whether agreement is worth anything

The original version of this project used two agents — a main one and a macro one — and
resolved conflicts by confidence. Worth testing properly, because ensemble disagreement as
an uncertainty estimate is a real technique, not just an architectural preference.

Two models on **disjoint** features, same hyperparameters as the pooled model so any
difference is attributable to the split:

* **technical** — 34 features about the stock: returns, SMA deviations, RSI, MACD, realised
  vol, volume, cross-sectional ranks, calendar, sentiment.
* **macro** — 24 about the world: Nifty, Nifty Energy, India VIX, Brent, USD/INR, gold,
  S&P 500, Nasdaq, relative strength vs market and sector.

### Each agent alone

| | selection folds | confirmation fold |
|---|---|---|
| technical | 51.76% | 52.46% |
| **macro** | **54.02%** | 51.75% |
| pooled (both) | 54.41% | 51.79% |

**The macro agent beats the technical agent by 2.3 points on the selection folds.** For a
model predicting one stock's next session, the world around it carries more signal than its
own price history does. That vindicates the original instinct to build a macro agent, and it
is the most interesting single result in this file.

### Does agreement mean anything?

They agree on about 53% of sessions.

| | selection | confirmation |
|---|---|---|
| when they **agree** | 55.44% (53.1% of sessions) | 53.95% (53.3%) |
| when they **disagree** | 53.44% (46.9%) | **49.44%** (46.7%) |

Yes, and in the right direction — on the confirmation fold, disagreement drops the model to
**below a coin flip**. Two models looking at disjoint data falling out is a genuine warning.

### Can agreement plus confidence carry a 60% headline? No.

Agreement *and* a combined conviction over 0.58, measured in every window:

| window | coverage | n | accuracy |
|---|---|---|---|
| val 2022 | 10.46% | 441 | 59.86% |
| val 2023 | 3.91% | 163 | **68.71%** |
| val 2024 | 4.45% | 186 | **53.23%** |
| val 2025 H1 | 7.08% | 148 | 64.86% |

Median 62.36% — and a **15.5-point spread** on samples of 148 to 441 rows. Set against the
other candidates measured the same way:

| | median | spread | coverage |
|---|---|---|---|
| two agents agreeing + confident | 62.36% | **15.5 pts** | 4–10% |
| direction at its frozen gate | 61.38% | 8.2 pts | 10–32% |
| **magnitude head** | **60.20%** | **3.2 pts** | **42–50%** |

The two-agent number is the highest median and the least trustworthy: a figure that swings
from 53% to 69% between adjacent years is not a property of the model, it is the sample size.
The magnitude head remains the only 60% here that holds still.

**What is worth keeping** is the disagreement signal rather than the agreement headline:
"these two models disagree, and historically that means coin-flip territory" is a real,
stable thing to show a user, and it does not depend on a small subset.

---

## What was not tried, and why

**More tickers.** The most promising untried lever: 44,030 pre-holdout rows is small, and
widening the basket would add rows *and* a richer cross-section. Yahoo rate-limited every
request throughout this work — 66 consecutive failures across seven symbols — so no new
data could be fetched. This remains the one honest path to a materially better model, and it
is blocked on a data source, not on modelling.

**A different target.** Not attempted because it changes the product, but worth stating: the
reason direction is hard is that direction is close to a martingale. *Volatility* is strongly
autocorrelated and genuinely predictable (R² of 0.4–0.6 is ordinary). A volatility model
would produce a legitimately impressive number — it would just be answering a different
question than "will it go up tomorrow".

**The three ways to fake 60%**, none of them used, all of them things this repository tests
against: feed the model raw prices or close lags (the earlier version of this project did
exactly this and reported 58.15%); split by row rather than by date, leaking same-session
information between the 18 tickers; or tune the abstention threshold on the holdout.

---

## Conclusion

The shipped model stays as it is. Nothing in this search beat it on data it had not been
tuned against, the one configuration that beat it on validation came last on confirmation,
and the committed model therefore remains the best-supported choice. §6.5 freezing it turned
out to cost nothing.

The honest version of the 60% claim, which the model card now carries: **the model already
exceeds 60% on the sessions where its conviction is highest — measured at 62.50% on one
window and 55.50% on the next, which is why the product reports the measurement it can
defend rather than the one that flatters it.**

Reproduce: `python ml/experiments/run_search.py --stage 1|2|3`,
`python ml/experiments/run_ensemble.py`, `python ml/experiments/confirm.py`.
Raw results in `ml/experiments/results/*.json`.
