# Arthaton 2026 — submission guide

**NSE Copilot** · theme *AI for Finance* · track *Trading and market insights* · solo entry.

Ten minutes, in order. Everything below is a link to the thing that proves it — no figure
on this page was typed by hand; each is read from a committed artifact and pinned by a test
that fails the build if the prose and the artifact disagree.

---

## The one-sentence version

**Every other stock tool always has an answer. This one tells you when it doesn't — and
backs the refusal with numbers it measured on itself.**

Next-session direction on NSE large-caps is close to a coin flip. This project reports that
honestly (**51.37%** on a holdout read exactly once), abstains on the sessions where it has
no edge, and ships a **second model** that answers a question it *can* answer well:
**60.20%** on whether tomorrow's move will be bigger or quieter than usual.

---

## Five minutes, if that is all there is

| # | Do this | Why it is the thing to look at |
|---|---|---|
| 1 | Open **`/signals`** | 17 names on one axis against a frozen gate. Today it calls **none** of them on direction and **9** on move size. A board of refusals is the product working |
| 2 | Open one card | Conviction, the per-name uncalibrated output, that name's own holdout accuracy — **four of seventeen are below a coin flip** and say so in red |
| 3 | Open **`/dashboard`** | Four baselines as bars, the calibration curve, R² of −0.0011 reported as near-zero, and per-regime accuracy including the tercile where the model is **worse than a coin flip** |
| 4 | Ask the chat *"is today a day to act or wait on Reliance?"* | It calls both models, quotes its own measured failure rate, and declines rather than guessing |
| 5 | Read **[`ml/experiments/RESULTS.md`](./ml/experiments/RESULTS.md)** | 29 configurations that failed to beat 51.37%, and the one that worked |

---

## Against the stated judging criteria

### Real-world impact

The product names one user and one decision: *a salaried investor holding ₹2–5 lakh across
6–8 NSE large-caps, checking weekly, deciding whether today is a day to act or wait*
(`idea.config.ts`).

The honest claim is narrow and that is deliberate. [`MODEL_CARD.md` §1](./MODEL_CARD.md)
lists what it will not do: not intraday, not a tip service, not portfolio optimisation, no
execution, not advice, not a price target. **Naming the limits is what makes the remaining
claim usable.**

### Relevance to the theme

"Analysing the markets" is a named direction in the brief. Historical and paper-trading
only — there is no broker path anywhere in the codebase, and `PAPER_ONLY` is rendered on
every signal surface.

### Does it work end to end

```bash
npm ci && pip install -e ./ml && npm run db:migrate
npm run demo          # boots both services, waits for health, catches the data up
```

- **238** TypeScript tests · **104** Python tests · **7** browser tests
- `npm run preflight` → **ready**, with a fix line on every warning
- Runs with **no API keys at all** — the agent, approvals and outbox work in mock mode
- With the model service stopped, every model-backed surface shows an explicit error and
  **nothing falls back to an estimate**

### Use of AI

| | |
|---|---|
| **Direction head** | Pooled LightGBM + isotonic calibration, purged walk-forward with a 5-session embargo, 58 scale-free features over 49,759 rows |
| **Magnitude head** | A second frozen model: will tomorrow's move exceed this name's recent normal? |
| **Agent** | Gemini 2.5 Flash, 12 tools, every number it says comes from a tool call |
| **Rules layer** | Independently blocks a directional claim with no model call behind it |
| **FinBERT** | News sentiment, ported from the earlier project |

### Creativity and originality

Three things here are not in the other entries:

1. **Abstention is the product.** When it declines, the API omits the `direction` field
   entirely — a client cannot render a call it was never given.
2. **The leak post-mortem.** The earlier version of this project reported 58.15%. I
   reproduced that number *deliberately* to find out why
   ([`README` §what I got wrong](./README.md)): a row-wise random split was worth **+9.2
   points** on its own, and the raw price features everyone blames were worth **nothing**.
3. **A negative result, kept.** 29 configurations searched; the winner on validation came
   **last** on the confirmation fold. That table is in the repository rather than deleted.

### Quality of the demo

[`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — three beats, 3 minutes, with the questions a finance
judge will ask and the honest answers to them.

---

## The numbers, and exactly what each one means

| figure | what it measures | where it came from |
|---|---|---|
| **51.37%** | direction, every session, final holdout | read **once**, ledger committed |
| **55.50%** | direction on the 10.2% it calls | same holdout, frozen gate |
| **63.06%** | direction above the gate | walk-forward **validation** — **7.57 points above** the holdout at the same gate, and the app says so beside it |
| **60.20%** | move size, median of 4 windows | range 58.46–61.64%, covers 42–50% of sessions, ≥60% in 3 of 4 |
| **−0.0011** | R² on return magnitude | approximately zero, reported as such |

**The holdout was read exactly once.**
[`holdout_ledger.json`](./ml/artifacts/holdout_ledger.json) records every read with content
hashes; `test_artifacts.py` fails if a second authoritative read appears; and
`npm run preflight` checks it at runtime.

---

## What is wrong with it

Stated here rather than discovered by a judge.

- **The data is a few sessions stale.** Yahoo has been rate-limiting throughout. The board
  says how stale it is on every page rather than implying freshness.
- **17 names, not 18.** Tata Motors is fetched as TMPV after the demerger and the source
  has refused it. `universe_missing` names it in the payload.
- **The direction model is barely better than a coin flip**, and on four individual names
  it is worse. Both facts are on screen.
- **The magnitude head has never touched the final holdout** — its evidence is stability
  across four walk-forward windows, which is weaker, and the artifact says so.
- **Localhost, not serverless.** PGlite is per-process and the model service is a
  long-running Python process; [`HUMAN_TASKS.md`](./HUMAN_TASKS.md) §6 is the deployment
  runbook.

---

## Where things are

| | |
|---|---|
| How to run it | [`SETUP.md`](./SETUP.md) |
| What the model does and does not do | [`MODEL_CARD.md`](./MODEL_CARD.md) |
| The accuracy search, including failures | [`ml/experiments/RESULTS.md`](./ml/experiments/RESULTS.md) |
| Demo narration | [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) |
| Libraries and AI APIs credited | [`README` §Credits](./README.md) |
| What I built vs what AI generated | [`README`](./README.md), and `BUILD_LOG.md` decision by decision |

**Rules compliance:** historical/paper data only, never real money · open-source libraries
and AI APIs credited in the README · no credentials, bank details or broker keys in the
repository (`.env*` is gitignored and only `.env.example` is tracked) · original work, with
every decision logged as mine, specified, or generated.
