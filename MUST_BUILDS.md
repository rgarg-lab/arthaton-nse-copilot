# Must-builds

The things this submission has to have for the rubric it is judged against, with the
evidence for each. Every path here is asserted to exist by `tests/honesty.test.ts`, so this
table cannot drift into claiming files that were renamed or never written.

---

## Shipped

### 1. Calibrated next-session probability for a basket of NSE large-caps

A pooled LightGBM direction classifier with isotonic calibration on out-of-fold
walk-forward predictions. The displayed number is a real probability, which is the direct
replacement for my earlier project's hardcoded `confidence=60`.

**Evidence** · `ml/src/copilot/train.py` · `ml/src/copilot/signals.py` ·
`ml/artifacts/latest_signals.json` · `src/lib/tools/finance.ts` ·
`src/components/finance/SignalsBoard.tsx` · `app/signals/page.tsx`
**Verify** · calibration curve and expected calibration error of 3.07% on `/dashboard`

### 2. Explicit "no signal today" below a frozen threshold

Conviction threshold of 60%, chosen on validation and frozen into `model.pkl` before the
holdout was read. When the model abstains the API omits the `direction` field entirely, so
a client cannot render a call it was never given. `src/lib/rules/finance.ts` enforces it a
second time, independently, on the agent's prose.

**Evidence** · `ml/src/copilot/train.py` (`choose_threshold`) ·
`src/components/finance/SignalCard.tsx` (`AbstentionCard`) · `src/lib/rules/finance.ts` ·
`tests/rules.finance.test.ts`
**Verify** · 51.37% accuracy on all rows against 55.50% on the 10.2% it calls

### 3. Purged walk-forward evaluation with a once-only final holdout

Expanding window, four folds, five-session embargo, splits on dates rather than rows,
preprocessing refit inside each fold. Final holdout 2025-07-01 → 2026-11-09, read once,
with a committed append-only ledger.

**Evidence** · `ml/src/copilot/validation.py` · `ml/src/copilot/evaluate.py` ·
`ml/tests/test_purge.py` · `ml/tests/test_leakage.py` · `ml/artifacts/holdout_ledger.json`
**Verify** · `python ml/tasks.py test` — 38 tests, including a test that perturbs the last
30 sessions' prices and asserts no earlier feature row moves

### 4. Model card: calibration curve, four baselines, coverage-accuracy curve

Every figure read from one artifact. Includes the unflattering ones: a near-zero R², the
max calibration error beside the expected one, the per-year split that shows how much the
headline moves, and the weakest volatility regime.

**Evidence** · `app/dashboard/page.tsx` · `src/components/finance/ModelCard.tsx` ·
`src/components/finance/Charts.tsx` · `ml/artifacts/metrics.json`
**Verify** · `tests/honesty.test.ts` fails the build on a metric-shaped literal in any
finance component

### 5. Evidence from similar past sessions

Strictly-causal KNN over a twelve-dimension standardised market-state space, restricted to
sessions before the query date, standardised on the candidate pool only. Returns real dates
and the real return that followed each.

**Evidence** · `ml/src/copilot/neighbors.py` ·
`src/components/finance/EvidenceTimeline.tsx` · `app/evidence/page.tsx`
**Verify** · `ml/tests/test_artifacts.py::test_neighbors_are_strictly_causal`

### 6. An assistant that quotes its own measured failure rate

`metrics.json` is injected into the system prompt on every turn — including both fallback
paths, which is where an assistant is most likely to drift into unearned confidence. The
`get_model_metrics` tool supplies the detail.

**Evidence** · `src/lib/chatContext.ts` · `src/lib/agent/loop.ts` ·
`src/lib/tools/finance.ts`
**Verify** · ask "how accurate are you, really?" and compare the answer to
`ml/artifacts/metrics.json`

### 7. Every UI number traces to a committed artifact

The constraint, enforced mechanically. No statistic is written by hand in a component or in
`idea.config.ts`; `src/lib/ml/client.ts` is the only path from TypeScript to the model and
has no mock-numbers mode at all; `src/data/demo-seed.ts` contains no numeric content.

**Evidence** · `tests/honesty.test.ts` · `src/lib/ml/client.ts` · `src/data/demo-seed.ts`
**Verify** · `npm test`

### 8. Disclaimer on every signal surface, paper-trading only

One component, imported by every surface that renders model output, with the text
duplicated into `ml/src/copilot/config.py` so every API payload carries it too. My earlier
project had **zero** occurrences of "not investment advice" in its entire `src/` tree while
making directional calls on a real listed company.

**Evidence** · `src/components/finance/Disclaimer.tsx` · `ml/src/copilot/config.py`
**Verify** · `tests/honesty.test.ts` asserts the import on all five signal components, that
the two copies match, and the Playwright suite asserts the rendered text on all three pages

---

## Deliberately not built

Each of these was a real option. Not building them was a choice, and the reason matters
more than the absence.

### Portfolio risk flagger + the correlation graph

The template ships a React Flow graph component and it looks good. Building an HHI,
correlation matrix and factor-beta panel on top of it was the second stretch item.

**Why not:** it would have been the fourth surface competing for the same two minutes of a
judge's attention, and none of it needs the thing that makes this project different. The
graph tab was retired rather than filled with a correlation matrix nobody asked about. A
half-built panel scores worse than an absent one.

### Universe-wide news sentiment

FinBERT sentiment currently covers Reliance only, from 2024-12-10, so `news_available` is 1
on roughly 1% of rows.

**Why not:** scoring 18 tickers × 11 years of headlines needs a news source I do not have
and a serial FinBERT pass measured in hours. The honest version is the one shipped: the
feature exists, the decay and the look-ahead-avoiding shift are the ported mechanisms that
were worth keeping, and the README states exactly how thin the coverage is. A sentiment
feature fabricated for the other 17 names would have been the defect this project is a
reaction to.

### A live deployment

**Why not:** §4.1 of the build spec makes this build localhost-only and §9 scores
deploy-readiness rather than a live URL. The production build is verified and the complete
two-service runbook — Neon, Vercel, a container host for the ML service, and the CORS
variable that silently breaks everything if you forget it — is in `HUMAN_TASKS.md` task 6.

### The eighteenth ticker

`TATAMOTORS.NS` stopped resolving on Yahoo after the Tata Motors demerger. The successor
symbol `TMPV.NS` carries the full history and the alias is implemented and tested, but it
was rate-limited for the entire build window across ~90 minutes of retries.

**Why not:** the alternative was to substitute a different large-cap, which §6.1 forbids,
or to quietly report metrics over 17 names as though they were 18. `python ml/tasks.py data`
now fails loudly when any ticker is missing, the README states the panel has 17, and the
metric tables say so.
