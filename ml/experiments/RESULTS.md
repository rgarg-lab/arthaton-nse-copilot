# Accuracy search: what I tried to get to 60%, and what happened

**Question.** Can next-session direction accuracy on this basket be raised from ~51% to 60%
by permuting algorithms, adding features, adding data and reducing noise — without changing
the core functionality, and without cheating?

**Answer.** No, at full coverage. 23 configurations across five algorithm families, five
feature sets, five noise-reduction schemes and a five-model ensemble all land between
**51.3% and 51.8%** on data that played no part in selecting them. 60% *is* reachable, but
only by abstaining on most sessions, and the measurement is unstable at ±7 points between
windows.

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

## Stage 5 — confirmation on the untouched fold

Every number above is a *selection* number, chosen as the best of 23. Fold 4 played no part
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
