# Build Prompt — NSE Copilot (Arthaton 2026)

> Paste this whole file into a fresh Claude Code session started in
> `C:\Users\Riyan Garg\Projects\`. Windows, PowerShell primary, Bash available.
>
> ## Run autonomously — do not ask me anything
>
> Every decision is already made in this document. Work straight through §8 step by step:
> build → run that step's acceptance check → append to `BUILD_LOG.md` → next step. **Do
> not stop to ask for approval, confirmation, or a preference between options.** Do not
> present plans for sign-off. Do not pause between steps.
>
> - Each step's output is the next step's input, so do not skip ahead or reorder.
> - If an acceptance check fails, debug and fix it yourself, then re-run it. Only move on
>   when it passes.
> - If something is genuinely ambiguous, pick the option most consistent with §4's hard
>   constraints, write the choice and the reason in `BUILD_LOG.md`, and keep going.
> - This build is **localhost-only and Gemini-only** (§4.1). There is no database to
>   provision, no host to deploy to, and one API key.
> - If a step still needs a credential or an interactive login I cannot give you unattended
>   (the `GEMINI_API_KEY`, the `gh` workflow scope), **do not block**: build everything
>   around it, verify it in mock mode, append an entry to `HUMAN_TASKS.md` with the exact
>   commands I need to run, and continue to the next step.
> - Only come back to me at the end, with the §9 evidence table.
>
> **Stop condition: §9. Keep working until the self-assessed score is ≥ 85/100 with
> evidence for every line.** Do not stop at "it works".

---

## 1. Mission

**NSE Copilot** — an AI agent for Indian equity decisions. It predicts next-session
direction for a basket of NSE large-caps, but the *product* is the decision layer around
the prediction: a calibrated probability, an explicit "no signal today" when the model
isn't confident, evidence from similar historical sessions, and a chatbot that can state
the model's own measured failure rate.

Submission for **Arthaton 2026** (arthaton.com) — theme *AI for Finance*, track *Trading
and market insights*. Solo entry.

Event rules that bind this build:
- Trading projects must use **historical data or paper trading, never real money**.
- Open-source libraries and AI APIs are permitted but **must be credited in the README**.
- The project must be my own work.

**Total effort budget: roughly two days, interrupted.** Scope is managed by §8's cut
order, never by lowering the quality bar on the spine.

---

## 2. Definition of done — ≥ 85/100

Judged by AI researchers, engineers and finance experts against this published rubric:

| Criterion | Weight | Target | What earns the target |
|---|---|---|---|
| Problem Understanding & Solution Design | 20% | **17** | Decision-support framing, abstention, paper-trading-only compliance, disclaimers, named limitations |
| Functionality & Feature Completeness | 25% | **21** | Every visible surface backed by a real endpoint, deployed, clone-and-run |
| AI/ML Implementation | 20% | **18** | Purged walk-forward, probability calibration, four baselines, honest R² |
| Innovation & Creativity | 15% | **12** | Abstention + evidence retrieval + self-aware chat |
| User Experience & Interface | 10% | **9** | Existing polish kept, now truthful; loading/error states everywhere |
| Performance & Code Quality | 10% | **8** | Pinned deps, tests, one-command rebuild, no dead code |
| | | **85** | |

**85 = the spine (§8 steps 1–8) + the three cheap adds.** The two stretch items are worth
the last ~5 points and are explicitly optional. A half-built panel scores worse than an
absent one.

---

## 3. Two source repos

### 3.1 UI shell — `C:\Users\Riyan Garg\Projects\hackathon-template`

My own agentic-AI template: Next.js 16.3.1, React 19.2.8, TypeScript strict, Tailwind 4,
shadcn/ui, Drizzle ORM, PGlite locally / Neon in production, next-auth, Anthropic SDK,
Recharts 3.10, `motion` 13, `@xyflow/react` 12, Spline, `thinking-orbs`.

**Take the UI and the agent plumbing. Take no domain logic.**

Read these two files first and obey them — they are the template's own rules:
- `hackathon-template/CLAUDE.md`
- `hackathon-template/HACKATHON_TEMPLATE_PROMPT.md`

The rules that matter most:
- **Do not redesign the UI shell.** Layout, rails, tabs, design tokens, CSS modules and
  motion stay. Additions go *alongside*, not *through*.
- All user-facing copy lives in **`idea.config.ts`** only. Never hard-code a string elsewhere.
- What the screens render comes from **`src/data/demo-seed.ts`**, the single data file.
- New capability = **a new tool** in `src/lib/tools/` (export it, register it in
  `index.ts`, add its name to `agent.enabledTools`). Never add a branch to the agent loop.
- Every tool: one zod `inputSchema`, a description written for the model, JSON-serialisable
  output, its own error handling, a unit test in mock mode.
- **Correctness is computed, never generated.** All maths, money and comparisons in code.
- **External actions always go through approvals** (`src/lib/approvals` → `pending_actions`).
- **The demo must survive every API being down**: mock providers, fallback chain, response
  cache, seed file, embedded DB. Anything new must work, or degrade visibly, with no keys.
- Every async path gets a loading and an error state (`src/components/common/`).
- Existing tools to reuse: `actions`, `calculate`, `clean_input`, `extract_structured`,
  `memory`, `retrieval`, `verify`. There is **no** `ml_predict` tool — we add the ML tools.

### 3.2 ML backend — `C:\Users\Riyan Garg\OneDrive\Desktop\Reliance-Stock-AI`

My earlier Reliance predictor. **Port the good ideas, rewrite the pipeline.**

**Port:**
- FinBERT news sentiment with the decay mechanism for no-news days, and the shift that
  avoids same-day look-ahead (`Stock_Predictor/finbert_news.py`, `add_new_rows_decay2.py`)
- The technical / macro / sentiment / fusion decomposition as a *concept*
- The 20-document RAG knowledge base as **content only** (`Stock_Predictor/rag/knowledge_base/`),
  rewritten for this domain and loaded through the template's own retrieval layer. None of
  `Stock_Predictor/rag/*.py` is ported — see §4.1.
- The day-ahead backtest loop shape in `Stock_Predictor/history.py` — this part is correct:
  it predicts from row *t* and compares against *t+1*

**Do not port — these are known-defective:**
- `stock_predictor_prototype/improved_model_v4.py` — future-target leakage, in-sample
  stacking, test-based model selection
- `all_py/train_ensemble_direction_model.py` — preprocessing fit on the full dataset
- `Stock_Predictor/models.py` feature selection — it takes *every* column including raw
  rupee prices and 30 raw close lags. Biggest modelling defect in the old project; §5.2
  replaces it.
- The `×100` / `÷100` target scaling across `models.py` and `fusion.py`. It is
  self-consistent but unreadable. Use fractions internally, percent only at the display edge.
- Anything that yields a metric by hand. The old code computed **no metric at all** — the
  "60%" in its UI was a Python function default argument.

---

## 4. Hard constraints — non-negotiable

1. **No fabricated data anywhere.** The old project shipped a polished Metrics page of
   invented numbers (accuracy 58.15, a confusion matrix, an AUC, and 50 "epochs" of
   training curves for a tree model that has no epochs) plus a hardcoded LLM summary citing
   "47 recent news articles" it never read. None of that pattern survives.
2. **Every number rendered in the UI traces to a generated artifact file.** No literal
   statistics in TSX. A panel with no real data yet shows an `EmptyState`.
3. **No training, fitting or market-data fetching on the request path.** Artifacts are
   committed; the API loads them.
4. **No real money.** Paper trading / historical only, stated in the UI.
5. **A disclaimer is visible on every surface that shows a signal.** The old app had zero
   occurrences of "not investment advice" in its entire `src/` tree.
6. **Never present an uncalibrated number as a confidence.**
7. **If validation accuracy exceeds ~60%, assume leakage and go find it** before believing
   it. Pooled next-day NSE direction lives at 53–57%. A suspicious 70% loses the AI/ML
   category outright; an honest 55% with rigorous evaluation wins it.
8. **Isolation:** never push to or modify `iAnmolAgarwal/pathwise`,
   `rgarg-lab/hackathon-template`, or `rgarg-lab/ps-agentic-hackathon-14nov`. No remote may
   point at them. Brand-new credentials only — reuse nothing from the template's `.env.local`.
9. **One LLM provider, one database, one host: Gemini, PGlite, localhost.** Adding any
   other external service is forbidden (§4.1).

### 4.1 APIs and services — Gemini only, localhost only

**Exactly three external dependencies exist in this build:**

| Dependency | Key needed | Used by | Offline behaviour |
|---|---|---|---|
| **Gemini** | `GEMINI_API_KEY` | the Next.js LLM router — agent loop, chat, explanations | `LLM_MODE=mock` → deterministic mock responses; whole app and test suite still work |
| **yfinance** | none | `ml/` ingestion only | disk cache + committed `panel.parquet`; never called on the request path |
| **FinBERT** (HuggingFace `transformers`) | none | `ml/sentiment.py` | local model weights, downloaded once, CPU inference |

**Everything else in the template's `.env.example` stays unset**, which is a supported
configuration — read the comments in that file, they document each fallback:

- `DATABASE_URL` **unset** → PGlite (embedded Postgres + pgvector) at `./.pglite`,
  self-migrating on first connect. **No Neon.**
- `EMBED_PROVIDER` **unset** → deterministic local embeddings. Memory and retrieval work
  with no key. **Do not add Voyage or OpenAI.**
- `ANTHROPIC_API_KEY`, `GROQ_API_KEY` **unset** — Gemini is the whole chain.
- `TAVILY_API_KEY` unset → `web_search` returns labelled mock results. We don't need it;
  leave it out of `agent.enabledTools`.
- All connectors (`GITHUB_*`, `NOTION_*`, `RESEND_*`, `SLACK_*`) unset → approvals fall
  back to the local outbox, which is what we want.
- Auth unset → the app runs signed out. **No login wall.**
- `NEXT_PUBLIC_HERO_SCENE_URL` unset → the hero's animated orb fallback renders.

**Target `.env.local`, and nothing more:**

```ini
GEMINI_API_KEY=            # the one key — goes in HUMAN_TASKS.md if I haven't supplied it
LLM_MODE=live              # use `mock` while building; the test suite must pass on mock
LLM_PRIMARY=gemini-2.5-flash
LLM_FALLBACKS=             # deliberately empty — Gemini only
LLM_CACHE=on
ML_ENDPOINT=http://127.0.0.1:8000
```

`ML_ENDPOINT` is the template's existing slot for posting to a model service — reuse it for
the FastAPI service rather than inventing a new variable. Mocked when unset, so the UI
builds and tests before the Python side exists.

**One LLM path, not two.** The old project called Gemini directly from Python
(`gemini_summary.py`, `rag/chat.py`). Do **not** port that. All model calls go through the
template's `src/lib/llm/router.ts`, which already has Gemini, the response cache, the mock
provider and the per-session budget. Consequences:

- There is **no `explain.py`** in the Python service. Explanations are generated in
  Next.js, grounded by the `get_model_metrics` and `get_signal` tools.
- The old 20-document RAG knowledge base is ported as **content only**, rewritten for this
  domain, into the template's existing documents/chunks tables and `retrieval` tool. None of
  `Stock_Predictor/rag/*.py` is ported.
- Python has **no LLM dependency at all** — it does data, modelling and maths.

**Localhost only.** Next on `:3000` (`npm run dev`), FastAPI on `127.0.0.1:8000`
(`uvicorn`). No Vercel, no Render, no Neon. Write the deploy runbook into `HUMAN_TASKS.md`
for later, but do not attempt a deploy and do not let its absence block or lower the score
(§9).

---

## 5. Target repo

Monorepo, so the submission is one link. New repo `rgarg-lab/arthaton-nse-copilot`,
private during the build, public at submission. MIT licence. Commit identity
`rgarg-lab <199736135+rgarg-lab@users.noreply.github.com>`.

```
arthaton-nse-copilot/
├── app/                      # Next.js App Router — from template
├── src/                      # from template: lib/, components/, db/, data/, schemas/
│   ├── lib/tools/            # + new finance tools (§7.3)
│   └── data/demo-seed.ts     # rewritten: finance seed
├── idea.config.ts            # rewritten: NSE Copilot
├── ml/                       # NEW — Python 3.12 service
│   ├── pyproject.toml        # pinned deps
│   ├── Makefile              # data | train | eval | refresh | serve | test
│   ├── src/copilot/
│   │   ├── config.py         # universe, date range, cost assumptions, env
│   │   ├── ingest.py         # yfinance multi-ticker + macro, disk-cached
│   │   ├── features.py       # leakage-safe, scale-free (§6.2)
│   │   ├── sentiment.py      # FinBERT + decay, ported
│   │   ├── labels.py         # target construction
│   │   ├── validation.py     # purged walk-forward + embargo splitter
│   │   ├── train.py          # pooled model + isotonic calibration + OOF preds
│   │   ├── evaluate.py       # metrics vs 4 baselines → metrics.json
│   │   ├── neighbors.py      # similar-past-days KNN
│   │   └── api.py            # FastAPI, env-driven CORS
│   │                         # NOTE: no LLM dependency in Python at all (§4.1)
│   ├── artifacts/            # COMMITTED: model.pkl, calibrator.pkl, metrics.json,
│   │                         # latest_signals.json, feature_importance.json
│   ├── data/
│   │   ├── raw/              # gitignored — yfinance cache
│   │   └── processed/        # COMMITTED: panel.parquet (see §6.1)
│   └── tests/
├── ci/test.yml               # parked — see §8 gh scope
├── README.md  MUST_BUILDS.md  BUILD_LOG.md  SETUP.md  DEMO_SCRIPT.md
├── HUMAN_TASKS.md            # anything needing my credentials or my voice
```

**Split of responsibility:** Python owns all modelling, evaluation and finance maths.
Next.js owns the UI, the agent loop and the conversation. The agent reaches the ML service
only through tools (§7.3). No model code in TypeScript; no UI logic in Python.

---

## 6. The ML work (`ml/`, Python 3.12.10)

### 6.1 Universe and data
- **Universe is fixed at these 18 tickers** — use exactly this list, do not substitute:

  ```
  RELIANCE.NS  HDFCBANK.NS  ICICIBANK.NS  INFY.NS      TCS.NS       LT.NS
  ITC.NS       SBIN.NS      AXISBANK.NS   BHARTIARTL.NS KOTAKBANK.NS HINDUNILVR.NS
  MARUTI.NS    SUNPHARMA.NS TATAMOTORS.NS ASIANPAINT.NS BAJFINANCE.NS NTPC.NS
  ```

  Not all of Nifty-50: ingest and FinBERT are the slow serial steps, and 18 tickers still
  gives ~40k rows and full cross-sectional ranking at a fraction of the runtime.
- Macro series: Nifty 50, Nifty Energy, India VIX, Brent, USD/INR, Gold, S&P 500, Nasdaq.
- `yfinance`, 2015-01-01 → today. Disk cache keyed by ticker + range so re-runs are
  offline. Sequential fetch with backoff — parallel hammering gets rate-limited.
- **Commit the processed panel** (`ml/data/processed/panel.parquet`). A fresh clone must
  run without yfinance cooperating — an upstream outage on judging day cannot be allowed to
  make the project unrunnable. `make data` still regenerates it from scratch; the raw cache
  stays gitignored. A few MB in the repo is worth far more to Functionality than it costs.
- **Survivorship bias is real** (current constituents only). Name it in the README.
- News/FinBERT: start with Reliance only, where the existing sentiment data already lives.
  Universe-wide sentiment is a stretch goal; `news_available=0` elsewhere is honest and the
  model handles it.

### 6.2 Features — scale-free, so pooling across tickers is valid
**No raw prices. No raw close lags.** The old model partitioned on absolute rupee levels
from 2017–2024 and then had to answer questions about 2026 prices; trees cannot extrapolate.

- Returns at 1/3/5/10/20/60d
- Moving-average *deviations*: `close/SMA_n − 1` for n ∈ {10, 20, 50, 200}
- RSI, MACD normalised by price, Bollinger %B
- Realised volatility 5/10/20/60d, vol-of-vol, return skew
- Volume z-score vs 20d, volume change
- High-low and open-close spreads as fractions of close
- **Cross-sectional ranks** within the universe for 1/5/20d return and volatility — a new
  signal class that only exists because we went multi-ticker
- Relative strength vs Nifty 50 and vs sector index
- Macro returns 1/3/7d + 7d realised vol per series
- VIX regime bucket (terciles fit on **training data only**)
- Calendar: day-of-week, month, F&O expiry-week flag
- Sentiment: FinBERT daily score, decay value, `news_available` flag, shift preserved

**Keep feature count ≤ 60.** Fewer features per row, far more rows — deliberately the
opposite of the old pipeline's "use every column". Ticker identity is **not** a feature.

### 6.3 Labels
- `y_ret` = next-session return as a **fraction** (one canonical unit throughout)
- `y_dir` = sign(`y_ret`)
- Horizon configurable, default 1 session

### 6.4 Validation — purged walk-forward. The highest-value work in the build.
- Expanding-window walk-forward with a **5-session embargo** between train and validation.
- Folds: train ≤2021 → val 2022 · ≤2022 → val 2023 · ≤2023 → val 2024 · ≤2024 → val 2025H1.
- **Final holdout 2025-07-01 → today. Touched exactly once, at the very end.**
- Every hyperparameter is chosen inside the walk-forward folds. All preprocessing (scalers,
  regime terciles, imputation) fit on training rows only.
- Write a test asserting train and validation indices never overlap after purging.

### 6.5 Model
- **Use LightGBM** (faster on ~40k rows, native categorical handling). Pooled, two heads:
  return regressor and direction classifier.
- **Isotonic calibration on out-of-fold predictions**, so the displayed probability is a
  real probability. This replaces the old hardcoded 60.
- **Abstention** — emit a signal only when the calibrated probability clears a threshold
  chosen on validation; publish the coverage-vs-accuracy curve. Not optional: it is the
  product identity, and it falls out of calibration for free.
- **The model, the calibrator and the abstention threshold are frozen once step 3's
  acceptance check passes.** Write them to `artifacts/` and treat them as read-only for the
  rest of the build. The threshold especially: it is chosen on validation, and if it stays
  adjustable it becomes a dial for making the coverage-vs-accuracy curve look better.

### 6.6 Evaluation → `artifacts/metrics.json`
- Direction: accuracy, balanced accuracy, AUC, **Brier score**, log loss, calibration curve
- Regression: MAE, RMSE, R² — expect R² near zero and **report it honestly**
- **Four baselines**: always-up, previous-day-sign momentum, 3-feature logistic regression,
  buy-and-hold. A model is only interesting relative to these.
- Per-year and per-VIX-regime breakdown, confusion matrix, real feature importance
- Coverage-vs-accuracy curve from the abstention threshold

### 6.7 Similar past days (`neighbors.py`)
KNN over the standardised feature vector, restricted to dates strictly **before** the query
date. Returns k analogous sessions, what actually happened next, and the empirical up-rate
among them. Turns a prediction into evidence.

### 6.8 FastAPI (`api.py`)
`GET /signals` · `GET /metrics` · `POST /neighbors` · `GET /health`

- Loads committed artifacts at startup. **Never trains on request.**
- Env-driven CORS and base URLs — the old project hardcoded `localhost:5173`.
- Cache keyed on actual request parameters. The old `/api/history` cached once and then
  ignored its own `days` argument forever.
- No per-request `yfinance` `.info` call; snapshot that data.

---

## 7. The UI work (Next.js template)

### 7.1 Screen remap — reuse the strong components, retire only dead routes

| Template surface | Becomes |
|---|---|
| `app/page.tsx` landing | NSE Copilot landing, all copy from `idea.config.ts` |
| workspace **chat** tab | Copilot chat — RAG + live signal + measured track record |
| workspace **path** tab (`src/components/path`) | **Evidence timeline**: similar past days → what happened next |
| workspace **dashboard** tab | Today's signals: calibrated probability, abstain state, predicted range |
| workspace **trace/approvals** tab | Agent trace + approval tray |
| `app/dashboard/page.tsx` | **Model Card**: metrics, calibration curve, baseline table, coverage-accuracy curve |
| `app/memory/page.tsx` | Saved watchlist |
| `src/components/profile` | **Risk profile**: horizon, risk tolerance, abstention threshold |
| `app/outbox/page.tsx` | Queued alerts (and paper trades, if the stretch item is built) |
| `app/preflight/page.tsx` | Keep as-is — demo readiness |
| workspace **graph** tab (`src/components/graph`) | Hide for now; becomes the portfolio correlation graph only if the stretch item is built |
| `app/learn/**`, `api/path/generate`, `api/learners`, `api/dashboard/[learnerId]` | **Retire** — delete routes, nav entries and their components |

Also rewrite, because their columns are Pathwise-shaped and irrelevant:
- **Drizzle schema** in `src/db/` — replace learner/skill/course tables with `watchlist`,
  `signals_snapshot`, `risk_profile` (+ `holdings`, `paper_trades` if stretch). Keep the
  template's `sessions`, `messages`, `memory_items`, `pending_actions`, `outbox`,
  `trace_events`, `llm_cache`, `eval_runs` tables unchanged.
- **`src/data/demo-seed.ts`** — a deterministic finance seed from a seeded PRNG.
- **`src/schemas/`** — finance zod schemas.

### 7.2 `idea.config.ts`
Rewrite `name`, `tagline`, `problem`, `targetUser`, `theme`, `assistant`, `landing`,
`agent.systemPrompt`, `agent.enabledTools`, `inputs`, `sampleQuestions`, `demoSeed`,
`mustBuilds`, `wow`.

**The wow moment: the agent declining to give a signal, and explaining with numbers why
today is a low-confidence regime.** That is the thing a finance judge will not have seen in
the other nine stock predictors.

### 7.3 New agent tools (`src/lib/tools/`)
Thin typed clients over the FastAPI service. Register each and list it in
`agent.enabledTools`.

| Tool | Purpose |
|---|---|
| `get_signal` | calibrated probability + direction + abstain state for a ticker |
| `get_model_metrics` | the measured track record from `metrics.json` — lets the agent state its own failure rate |
| `find_similar_days` | KNN evidence for the current market state |
| `analyse_portfolio` | *(stretch)* concentration, correlation, factor exposure |
| `run_paper_trade` | *(stretch)* simulate with costs → `pending_actions` for approval |

Keep existing `calculate`, `verify`, `retrieval`, `memory`, `clean_input`,
`extract_structured`, `actions`. Leave `web_search` out of `enabledTools`.

All finance arithmetic goes through `calculate` or Python — never the model's prose. There
is no `explain_signal` tool: explanation is the agent's own answer, grounded by
`get_signal` + `get_model_metrics` + `retrieval` through the Gemini router (§4.1).

### 7.4 Rules layer (`src/lib/rules`)
Finance rules the model cannot override:
- never show a signal when the calibrated probability is below the abstention threshold
- never queue an action without approval
- always attach the disclaimer to any signal output
- block any phrasing implying guaranteed returns

---

## 8. Build flow — steps, features, acceptance checks

Dependency-ordered. Each step's output is the next step's input.

| # | Step | Features delivered | Effort | Acceptance check |
|---|---|---|---|---|
| 1 | **Skeleton** | New repo, template copied in, `ml/` scaffolded, deps pinned, `BUILD_LOG.md` | ~1h | `npm run build` passes; `make -C ml help` works; no remote points at an upstream repo |
| 2 | **Data & features** | Multi-ticker + macro ingestion, disk cache, scale-free features, labels, FinBERT port | ~3h | `make data` rebuilds from scratch; ≥35k rows; ≤60 features; data within 2 sessions of today; `panel.parquet` committed; **leakage test passes** |
| 3 | **Model & evaluation** ← the gate | Purged walk-forward splitter, pooled model, isotonic calibration, abstention threshold, 4 baselines, `metrics.json` | ~4h | `make eval` writes `metrics.json`; calibration near-diagonal; purge/overlap test passes; artifacts committed and **frozen** (§6.5); **no metric ever typed by hand again** |
| 4 | **ML API** | FastAPI × 5 endpoints, artifact loading, env CORS, parameter-keyed cache | ~1h | all endpoints return real data <500ms warm; zero training at boot; `/health` green |
| 5 | **Template rewire** | `idea.config.ts`, finance Drizzle schema + migration, finance seed, dead routes retired, 4 tools registered | ~4h | a sample question produces ≥2 tool calls in the trace; `npm test` green in mock mode |
| 6 | **UI surfaces** | Signals dashboard + Model Card on real endpoints | ~3h | every panel reads a real endpoint; **no literal statistic anywhere in TSX**; loading + error states on every fetch |
| 7 | **Honesty & safety pass** | Disclaimers on every signal surface, finance rules layer, abstention UI, unit tests, Playwright smoke | ~2h | `npm run demo-check` green **with no API keys set**; rules block an unapproved action; disclaimer present on every signal surface |
| 8 | **Ship-ready (local)** | Production build verified, README with real numbers + **credits section**, `MUST_BUILDS.md`, `SETUP.md`, `HUMAN_TASKS.md`, `DEMO_SCRIPT.md`, deferred deploy runbook | ~3h | **fresh clone into a temp dir → 3 commands → running on localhost**; `npm run build` passes; `npm run demo-check` green on `LLM_MODE=mock`; demo script written |

Only three things need me, and **none of them may block or lower the score**: the
`GEMINI_API_KEY`, the `gh` workflow scope, and recording the video. Write each into
`HUMAN_TASKS.md` as a numbered task with exact commands, plus the deploy runbook for later,
then carry on. Do not attempt a deploy — this build is localhost-only (§4.1).

**Cheap adds — slot in before step 8. These are the difference between ~80 and ~85.**

| Add | Why it's cheap | Effort |
|---|---|---|
| Abstention UI | threshold already exists from step 3; this is rendering "no signal today" | ~30m |
| Evidence timeline | KNN over the step-2 feature matrix; one endpoint, one panel on the `path` component | ~1h |
| Self-aware chat | inject `metrics.json` into the existing RAG context so the agent states its own failure rate | ~45m |

**Stretch — only if the spine is green and deployed. Worth the last ~5 points.**
1. Paper-trading engine (cost-aware: 5/10/20 bps + slippage, equity curve vs buy-and-hold,
   Sharpe, max drawdown, trade log) + its outbox UI
2. Portfolio risk flagger (HHI, correlation matrix, factor betas) + the xyflow graph panel

**Cut order if time runs short** — drop from the bottom: stretch 2, stretch 1, evidence
timeline panel (keep the endpoint), mobile polish.
**Never cut:** step 3's rigour, the deployment, the disclaimers, the README credits, or the
"every number traces to an artifact" rule.

### Environment and gotchas

- Python **3.12.10**, Node **22.16.0** (both confirmed installed).
- **Localhost only** (§4.1): Next on `:3000`, FastAPI on `127.0.0.1:8000`, PGlite at
  `./.pglite`. No deploy, no Neon.
- **The app must boot and the full test suite must pass with an empty `.env.local`** — mock
  LLM, local embeddings, embedded database, mocked `ML_ENDPOINT`. Verify this explicitly;
  it is also the acceptance check for step 7.
- `.env.local` holds only the six lines in §4.1. Never commit it.
- **`gh` token lacks the `workflow` scope** (has `gist`, `read:org`, `repo`). Park CI at
  `ci/test.yml`. To activate, run **in a standalone terminal** — inside Claude Code it is
  backgrounded at the tool timeout and the device code expires:
  `gh auth refresh -h github.com -s workflow`, then
  `git mv ci/test.yml .github/workflows/test.yml`.

Template gotchas that will cost hours if forgotten:
- **A stale `.next` makes `next dev` return 404 for every route handler** → `rm -rf .next`.
  A killed build leaves a lock with the same fix.
- **The database handle must stay on `globalThis`** (`src/db/index.ts`, `Symbol.for` key).
  Next instantiates that module twice per process; a module-level cache silently gives two
  embedded databases that never see each other's writes. There is a regression test — keep it.
- **Never write the demo user's id to a `user_id` column.** With auth unconfigured the app
  issues a fixed anonymous identity with no `users` row, the FK rejects it, and the error
  surfaces inside the assistant's own answer. Use `persistableUserId()` in `src/auth.ts`.
- **Per-session tool budget is sized for a whole conversation.** Size it per turn and it
  exhausts on the second question, after which every turn silently takes the fallback path.
- **The rotating chat suggestion overlays the composer and is itself a button**, so a
  programmatic click on the textarea is intercepted. Tests must use `fill`, not `click`.

---

## 9. Scoring gate — the stop condition

After step 8, score the build against §2. Then **loop without asking me**:

- **< 85** → identify the lowest-scoring criterion, decide what specifically would raise it,
  build that, re-score. Repeat. Highest-yield fixes first. Pull in the cheap adds, then the
  stretch items, in the order given in §8.
- **≥ 85** → stop building and report, with a table carrying one line of evidence per
  criterion: a file path, a command output, or a URL.
- **If two consecutive scoring rounds produce no improvement**, stop looping, report the
  score you have, and list precisely what is blocking the remaining points. Do not churn.

Scoring discipline, because self-assessment drifts upward:

- **Score what is committed**, not what is only in the working tree. The old project had an
  untracked `rag/` that `main.py` imported, so a clone died at import — that class of
  failure must score as broken.
- A criterion cannot be scored above 60% of its weight if any part of it relies on a
  number, panel or claim that does not trace to a committed artifact.
- Functionality is scored by **cloning the repo fresh into a temp directory and following
  the README**. If that fails, Functionality is capped at 10/25 regardless of what works in
  the build directory.
- AI/ML cannot exceed 12/20 without `metrics.json` containing all four baselines and a
  calibration curve.
- If the headline accuracy is above 60%, treat the whole AI/ML score as unverified and go
  hunt the leak before reporting anything.
- **Score deploy-readiness, not a live URL** — deploying needs my credentials. A verified
  production build plus a complete runbook in `HUMAN_TASKS.md` counts as satisfied. The live
  URL and the video are required for the actual submission, and belong in `HUMAN_TASKS.md`,
  not in your score.
- Report the honest number. An accurate 82 that tells me what is missing is worth more than
  a claimed 91.

### 9.1 Loop rules — what the improvement loop may and may not do

A loop told only to "score higher" will reach for the three things that lose points. So it
runs off a whitelist, not off imagination.

**Each round: pick the lowest-scoring criterion, apply exactly ONE change from the table
below, re-score, state the delta.** Nothing creative. No bundling several changes into a
round.

| Criterion | Allowed moves, in priority order |
|---|---|
| Functionality | Build the next stretch item (paper trading, then portfolio risk); wire a stubbed panel to a real endpoint; fix a fresh-clone failure |
| Innovation | Build a cheap add not yet done; deepen the self-aware chat with a real failure-mode breakdown from `metrics.json` |
| Problem & Design | Add named limitations to the README; sharpen the abstention copy; add the risk-profile input |
| UX | Add a missing loading / error / empty state; fix mobile width; add keyboard focus states |
| Code Quality | Add a test for existing behaviour; pin a dependency; delete dead code |
| AI/ML | **Nothing. Frozen.** |

**Forbidden, no matter how much it looks like progress:**

1. **Any change to the model, features, universe, hyperparameters or abstention threshold
   after step 3.** The holdout has been consumed by then; retuning and re-measuring against
   it silently converts the headline number from out-of-sample to meaningless, and the
   AI/ML score with it. The only exception is fixing a discovered leak — that is a
   correctness fix, and it requires re-running step 3 end to end and saying so in the report.
2. **Chasing accuracy.** Not an allowed move in any round. 53–57% is the expected answer.
3. **Refactoring working modules.** Under time pressure this trades a real Functionality
   point for a notional Code Quality point and risks a regression. Deleting dead code is
   allowed; restructuring live code is not.
4. **Touching the UI shell** — layout, design tokens, CSS modules, motion. A loop staring at
   "UX 9/10" will rationalise its way around this ban. Don't. The shell is the part that is
   already good.
5. **Adding features to the model.** ≤60 is a ceiling, not a target.
6. **Adding a dependency or a framework** to enable an improvement.

**Guards that make it terminate:**

- After every round, re-run `npm test`, `npm run build`, and the fresh-clone check. A round
  that breaks any of them is **reverted, not patched forward**.
- Maximum **3 improvement rounds**, then report whatever the score is.
- Two consecutive rounds with no measurable gain → stop.
- The final holdout is evaluated **exactly once, ever**. If anything causes it to be
  touched again, say so explicitly in the report and mark the headline as invalidated.
- Every round gets a `BUILD_LOG.md` entry: criterion, change, before/after score, and the
  check results.

### Submission checklist — all must be true

- [ ] Fresh `git clone` into a temp dir runs in three commands — no missing module, no
      untracked import
- [ ] Production build passes; deploy runbook complete in `HUMAN_TASKS.md`
- [ ] Every UI number traces to `ml/artifacts/*.json`
- [ ] `metrics.json` reports an honest headline against four baselines
- [ ] Final holdout evaluated exactly once
- [ ] Disclaimer on every signal surface; historical/paper-only stated
- [ ] README credits every library and AI API — an explicit Arthaton rule
- [ ] `npm run demo-check` green with no API keys
- [ ] Data refreshed to within two sessions of submission
- [ ] No fabricated metric, no hardcoded confidence, no dead button anywhere

---

## 10. Working agreement

- **Run autonomously. Do not ask for approval, confirmation or preferences.** Every
  decision is in this document; where it genuinely isn't, choose, log the choice in
  `BUILD_LOG.md`, and continue.
- Run each step's acceptance check before moving on. If it fails, fix it and re-run — don't
  report a step as done on the strength of the code looking right.
- Append to `BUILD_LOG.md` after each meaningful change.
- Credentials, logins and anything needing my voice go to `HUMAN_TASKS.md`. Never block on them.
- If a number looks too good, go find the leak before putting it in front of me.
- Don't redesign the UI shell.
- Prefer deleting a surface over faking one.
- Report honestly at the end: what works, what is stubbed, what is cut, and the real score.
