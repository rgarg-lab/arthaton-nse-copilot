# Setup

Two services, no accounts, no keys required to get running.

---

## Prerequisites

| | Version | Check |
|---|---|---|
| Node | 22.16.0 or later | `node --version` |
| Python | 3.12.x exactly | `python --version` |
| npm | ships with Node | `npm --version` |

Python **3.12 specifically**: `ml/pyproject.toml` pins `requires-python = "==3.12.*"`
because the committed `model.pkl` was produced under it, and unpickling a LightGBM booster
across a Python minor version is not reliable.

`make` is **not** required. `ml/tasks.py` is the canonical task runner and `ml/Makefile` is
a thin wrapper that delegates to it, so every pipeline command works on a machine without
`make`.

---

## Three commands

```bash
npm ci                                      # 1
pip install -e ./ml && npm run db:migrate   # 2
npm run dev                                 # 3
```

Open <http://localhost:3000>.

Then, in a **second terminal**, start the model service:

```bash
python ml/tasks.py serve                    # 127.0.0.1:8000
```

That is the whole install. There is no database to provision (an embedded Postgres creates
itself in `./.pglite` on first connect), no model to train (the artifacts are committed),
and no API key needed to see every screen work.

### Recommended: a virtual environment

```bash
python -m venv ml/.venv
# Windows
ml\.venv\Scripts\activate
# macOS / Linux
source ml/.venv/bin/activate

pip install -e "./ml[dev]"    # [dev] adds pytest and ruff
```

---

## What works without the ML service

Deliberately a lot, and the parts that do not work say so explicitly rather than showing
placeholder figures.

| Works | Shows an explicit error |
|---|---|
| Landing page, the agent loop, the trace, memory, approvals, the outbox, preflight | `/signals`, `/dashboard`, `/evidence`, and the landing's numbers strip |

That split is the project's argument, not a limitation: a panel with no real data behind it
shows an `ErrorState` naming the missing service, because an invented probability is
indistinguishable from a real one by the time a user reads it.

## What works without a Gemini key

Everything, in `mock` mode. The agent makes real tool calls, the rules layer fires, actions
queue for approval and land in the outbox — only the assistant's prose is generated
locally, and it says so in its own answer. `npm test` and `npm run demo-check` are designed
to pass in exactly this configuration.

To add the key, see [`HUMAN_TASKS.md`](./HUMAN_TASKS.md) task 1.

---

## `.env.local`

Six lines, and nothing more (§4.1 of the build spec allows one LLM provider, one database,
one host). Never committed — `.gitignore` covers `.env*`.

```ini
GEMINI_API_KEY=            # the one key; blank is a supported configuration
LLM_MODE=mock              # mock | cached | live
LLM_PRIMARY=gemini-2.5-flash
LLM_FALLBACKS=             # deliberately empty: empty means NO fallbacks
LLM_CACHE=on
ML_ENDPOINT=http://127.0.0.1:8000
```

**`LLM_FALLBACKS=` being empty is load-bearing.** `fallbackModels()` in
`src/lib/llm/router.ts` is the one env reader in the codebase that distinguishes *absent*
from *present and empty*: absent keeps the template's default chain, empty means none. Left
to the ordinary `env()` helper, an empty value would restore a chain ending in Anthropic and
Groq models whose keys are deliberately unset, and every live turn would attempt two
unreachable providers before falling through to the mock.

Everything else in `.env.example` stays unset, and each unset value has a documented
fallback: no `DATABASE_URL` → embedded PGlite; no `EMBED_PROVIDER` → deterministic local
embeddings; no auth → the app runs signed out; no connectors → approvals land in the local
outbox.

---

## Verify

```bash
npm run build            # production build; types are checked here too
npm test                 # 197 tests, mock mode, no keys
npm run preflight        # readiness, with a fix for every warning
npm run demo-check       # preflight + eval suite + browser smoke test
python ml/tasks.py test  # 38 tests, including leakage and purge
```

`npm run preflight` is the one to read before recording anything. Warnings are expected
with nothing configured — mock mode and the embedded database are a valid state — and every
warning carries the command that resolves it.

---

## The ML pipeline

The artifacts are committed, so none of this is needed to run the app. It is here because
reproducibility is a claim this project makes.

```bash
python ml/tasks.py help         # every target
python ml/tasks.py data         # re-ingest, rebuild features + labels   ~10 min
python ml/tasks.py train        # walk-forward selection + calibration   ~25 min
python ml/tasks.py eval         # metrics.json                           ~1 min
python ml/tasks.py signals      # today's calls                          ~5 s
python ml/tasks.py refresh      # all four, in order
```

**Restart the ML service after any of these.** Artifacts are loaded once at startup and
never re-read on the request path (§4.3) — which is the property that keeps a request from
doing any fitting, and the cost of it is that a running service keeps serving the artifact
it booted with. If a page still shows the old numbers after a refresh, the service is the
reason, not a cache in the browser. `/health` reports `loaded_at`, so you can check.

### Before you run `train` or `eval`

The model, the calibrator and the abstention threshold are **frozen** (§6.5 of the build
spec), and the final holdout has been read **exactly once** —
`ml/artifacts/holdout_ledger.json` is the committed record. Re-running `eval` appends a
second authoritative read, at which point the headline accuracy is no longer out-of-sample
and `ml/tests/test_artifacts.py::test_holdout_was_read_once_authoritatively` fails.

If you need to run the evaluation code without consuming the holdout — to debug it, say —
set `COPILOT_HOLDOUT_SMOKE=1`. The run is tagged in the ledger and stamps
`headline_authoritative: false` into `metrics.json`, which the model card then displays as a
warning banner.

### If `make data` fails

Yahoo rate-limits hard once a run has made a few dozen calls, and reports the throttle as a
generic empty response. The ingest layer retries five times with a long-tailed backoff
(5s → 20s → 60s → 120s) and then **fails loudly** rather than building a panel with a
silent hole in one ticker.

Wait ten minutes and re-run. The per-symbol cache in `ml/data/raw/` means tickers that
already succeeded are not re-fetched, and the committed
`ml/data/processed/panel.parquet` is untouched, so the app keeps working throughout.

To build a deliberately partial panel anyway: `COPILOT_ALLOW_PARTIAL=1`.

### FinBERT

Only needed to extend the news corpus; the committed corpus is already scored.

```bash
pip install -e "./ml[sentiment]"   # transformers + torch, ~2.5 GB
python ml/tasks.py sentiment
```

---

## Speed, and how to measure it honestly

Warm page times on the production build, one server running, nothing else competing:

| | |
|---|---|
| `/watchlist` | ~190ms |
| `/evidence` | ~380ms |
| `/signals` · `/dashboard` | ~430–490ms |
| `/workspace` | ~520ms |

Three things to know before you conclude the app is slow:

1. **Use `npm run build && npm start` for anything you are judging, including a recording.**
   `next dev` recompiles a route on first hit and again after any edit, and the landing
   carries six heavy client components (a scroll-driven card deck, a liquid-canvas counting
   strip, an animated wall). A 20–30 second first paint in dev is compilation, not the page.
2. **Do not leave two servers running.** A dev server on `:3000` and a production server on
   `:3200` at the same time, plus uvicorn, put every one of these pages at 15–40 seconds on
   this machine — I measured it. One Next server at a time.
3. **Artifact reads are cached for five minutes** (`src/lib/ml/cached.ts`). Every page is
   still `force-dynamic` and rendered per request; what is cached is the HTTP read of a
   JSON file that changes once a day. After `python ml/tasks.py refresh`, restart the ML
   service — and if you do not want to wait out the window, `revalidateMlArtifacts()` in
   that module drops it.

## Things that will bite you

- **A stale `.next` makes `next dev` return 404 for every route handler.** If every API
  route starts 404ing after you have run `npm run build`, delete `.next` and restart. A
  killed build leaves a lock with the same fix.
- **The database handle must stay on `globalThis`** (`src/db/index.ts`, a `Symbol.for`
  key). Next instantiates that module more than once per process, and a module-level cache
  silently gives two embedded databases that never see each other's writes. There is a
  regression test — keep it.
- **PGlite is per-process.** Perfect locally, wrong for serverless. Set `DATABASE_URL` to
  Neon before deploying (see `HUMAN_TASKS.md` task 6).
- **Never write the demo user's id to a `user_id` column.** With auth unconfigured the app
  issues a fixed anonymous identity with no `users` row, the foreign key rejects it, and the
  error surfaces inside the assistant's own answer. Go through `persistableUserId()` in
  `src/auth.ts`.
- **The per-session tool budget is sized for a whole conversation.** Size it per turn and it
  exhausts on the second question, after which every turn silently takes the fallback path.
- **Playwright runs on port 3100, not 3000,** with its own `.pglite-test` directory, so a
  smoke run never adopts a dev server holding a real key.
- **`COPILOT_CORS_ORIGINS` defaults to `localhost:3000`.** If you ever deploy, set it on
  the ML service or the browser blocks every call with nothing in the server logs to
  explain it.

---

## Where to change things

| | |
|---|---|
| All user-facing copy | `idea.config.ts` — and nowhere else |
| A new agent capability | a tool in `src/lib/tools/`, registered in `index.ts`, named in `agent.enabledTools` |
| A finance invariant | `src/lib/rules/finance.ts` |
| Anything about the model | `ml/src/copilot/` — Python owns all modelling and maths |
| The universe, dates, cost assumptions | `ml/src/copilot/config.py`, the single source of truth |
| Demo scaffolding (watchlist, prompt order) | `src/data/demo-seed.ts` — no numbers permitted in it |

**Do not redesign the UI shell.** Layout, rails, design tokens, CSS modules and motion are
inherited from a project where they scored well. Additions go alongside, not through —
which is why the finance components live in their own `src/components/finance/` directory.

**No statistic may be written by hand in a component.** `tests/honesty.test.ts` fails the
build on a metric-shaped literal anywhere in the finance components or in
`idea.config.ts`. Every number on screen is read from `ml/artifacts/*.json` through the ML
service. The handful of genuine scale references — what a Brier score of 0.25 means — live
named in `src/components/finance/format.ts`.
