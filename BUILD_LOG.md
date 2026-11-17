# Build log — NSE Copilot (Arthaton 2026)

Append-only. One entry per meaningful change: what changed, whether the decision
was mine or generated, and the acceptance check result. The spec this build
follows is committed next to this file as [`BUILD_SPEC.md`](./BUILD_SPEC.md);
section references below (§n) point into it.

Legend for the *decision* column:
- **spec** — the choice was already made in `BUILD_SPEC.md`; I implemented it.
- **mine** — genuinely ambiguous, chosen per §4's hard constraints, reason recorded.
- **generated** — Claude Code wrote the code; I reviewed it against the spec.

---

## Step 1 — Skeleton

**2026-11-12 — repo created.** `C:\Users\Riyan Garg\Projects\arthaton-nse-copilot`,
`git init -b main`, identity set to
`rgarg-lab <199736135+rgarg-lab@users.noreply.github.com>` (§5). `git remote -v`
is empty — no remote points at `iAnmolAgarwal/pathwise`,
`rgarg-lab/hackathon-template` or `rgarg-lab/ps-agentic-hackathon-14nov` (§4.8).
Decision: spec.

**2026-11-12 — template copied in, not cloned.** Copied the working tree of
`hackathon-template` excluding `.git`, `node_modules`, `.next`, `.pglite`,
`tsconfig.tsbuildinfo`. Copying rather than cloning is deliberate: a clone would
carry the template's remote and its history, and §4.8 forbids any remote that
points at it. Decision: mine (§4.8 is the reason).

**2026-11-12 — template credentials discarded.** The copy brought
`hackathon-template/.env.local` with it. Deleted unread and replaced with a fresh
six-line file per §4.1. §4.8 requires brand-new credentials and says to reuse
nothing from the template's env. `LLM_MODE=mock` for the build (§4.1 says to use
`mock` while building); no `GEMINI_API_KEY` has been supplied, so it stays blank
and goes to `HUMAN_TASKS.md`. Decision: spec.

**2026-11-12 — removed template-only docs.** Deleted `LINKEDIN.md` and
`HACKATHON_TEMPLATE_PROMPT.md`: both are about the template as a product, not
about this project, and leaving them is the "dead code" the Code Quality
criterion penalises. `CLAUDE.md` is kept — its rules about the UI shell still
bind this build. Decision: mine.

**2026-11-12 — build spec committed.** Copied the build prompt to `BUILD_SPEC.md`
so the document this log references is version-controlled next to it.
Decision: mine.

**2026-11-12 — dependencies pinned.** `npm ci` from the inherited lockfile, then
every `^`-ranged version in `package.json` rewritten to the exact version npm
actually installed (43 packages), and the lockfile regenerated. `package.json`
`name` → `arthaton-nse-copilot`. Code Quality (§2) asks for pinned deps; a
floating range means a judge's `npm install` can resolve a different tree than
the one verified here. Decision: spec.

**2026-11-12 — `ml/` scaffolded.** `pyproject.toml` with every Python version
pinned exactly, `src/copilot/config.py` as the single source of truth for
universe / dates / split boundaries / cost assumptions, and a task runner.
FinBERT (`transformers`, `torch`) is an optional extra rather than a core
dependency: torch is ~2.5GB, nothing on the request path needs it, and §6.1 says
`news_available=0` is honest where sentiment is absent. Decision: mine.

**2026-11-12 — `make` is not installed on this machine, so `tasks.py` is the
canonical runner.** `make`, `mingw32-make` and a Git-Bash `make` are all absent
(`command -v make` → nothing), and installing GNU make onto the user's machine is
not something this build should do unasked. §8's step-1 check wants
`make -C ml help` to work. Resolution: the real target logic lives in
`ml/tasks.py` and the `ml/Makefile` is a thin wrapper that delegates to it, so
the two cannot drift. `make -C ml <target>` works wherever make exists (a judge
on Linux/mac/WSL); `python ml/tasks.py <target>` works everywhere including this
box. **Honest status of the acceptance check: the `python ml/tasks.py help` form
is verified here; the literal `make -C ml help` form is not verifiable on this
machine for lack of a `make` binary.** `HUMAN_TASKS.md` records the one-line
install if a real `make` is wanted. Decision: mine (§4 adds no dependency and
forbids none here; the deciding constraint was not modifying the user's machine).

**Acceptance check — step 1**

| Check | Command | Result |
|---|---|---|
| Production build passes | `npm run build` | ✅ pass — 28 routes compiled, static generation 4/4 |
| ML task runner works | `python ml/tasks.py help` | ✅ pass — 12 targets listed |
| ML task runner works (make form) | `make -C ml help` | ⚠️ not verifiable — no `make` binary on this machine; Makefile delegates to the verified runner |
| No remote points at an upstream repo | `git remote -v` | ✅ pass — no remotes configured |

---

## Step 2 — Data & features

**2026-11-12 — ingestion built with a long-tailed backoff, and a loud failure.** Sequential
per-symbol fetch, disk-cached by symbol + range, retried five times at 5s / 20s / 60s /
120s. The first version retried three times over 19 seconds and that was not enough: Yahoo
throttles once a run has made a few dozen calls and reports the throttle as a *generic
empty response*, which is indistinguishable from "this symbol has no data". The second
change matters more — `fetch_universe` now **raises** when any ticker is missing instead of
dropping it. Silently proceeding with 17 of 18 names is the failure mode that is hardest to
notice later: the panel looks fine, the metrics compute, and the universe quietly stopped
being the specified one. Decision: mine.

**2026-11-12 — `TATAMOTORS.NS` aliased to `TMPV.NS`.** The symbol stopped resolving
(`YFTzMissingError: possibly delisted`) after the Tata Motors demerger. Probing found
`TMPV.NS` serving 2,929 rows from 2015-01-01 — the full pre-demerger history, which is what
identifies it as the *renamed* series rather than a new listing, since TMPV itself only
began trading in late 2025. §6.1 says "use exactly this list, do not substitute", so this is
implemented as a `SYMBOL_ALIASES` lookup at the download boundary: the row is still labelled
`TATAMOTORS.NS` in the panel, the artifacts and the UI. A substitution would have been a
different ticker; this is the same company under the name Yahoo now serves it as.
Decision: mine (§6.1 is the reason).

**2026-11-12 — ⚠ and then the alias was rate-limited for the rest of the build.** Probing
the candidate symbols cost the IP its quota. 10 retries over ~90 minutes, with the yfinance
cookie cache cleared between rounds and both the `download` and `Ticker.history` code
paths tried, all returned `YFRateLimitError`. **The committed panel therefore has 17
tickers, not 18.** Resolution: do not substitute, do not hide it. The alias is implemented
and tested, `make data` fails loudly, and the README, `MUST_BUILDS.md` and the metric tables
all state that the panel is 17 names. Honest status recorded rather than worked around.
Decision: mine.

**2026-11-12 — 57 features, and the spec's own feature list was over-subscribed.** §6.2
caps the count at 60 and §9.1 restates it as "a ceiling, not a target". Taken literally its
own list exceeds that: eight macro series × (returns at 1/3/7d + 7d realised vol) is 32
macro features alone, and the per-ticker, cross-sectional, calendar and sentiment blocks
come to 38 — 70 in total. The ceiling is the harder constraint (restated twice, and it is
what protects a 40k-row pooled model from being fit to noise), so the macro block gave way:
four primary series (Nifty 50, India VIX, USD/INR, S&P 500) get all four features, four
secondary (Nifty Energy, Brent, Gold, Nasdaq) get the 1-day return only. 20 macro features
instead of 32, 57 in the panel and 58 once `vix_regime` is substituted in. Every feature
*class* §6.2 asks for is present. Reasoned in full in the `features.py` docstring.
Decision: mine (§6.2's ceiling over §6.2's list).

**2026-11-12 — the VIX regime bucket is not computed in `features.py`.** §6.2 wants
terciles "fit on training data only", which means it cannot be a column built once over the
whole panel. The panel carries the raw `vix_level` as an identity column and a
`Preprocessor` class fits the cut-points and the imputation medians per fold. This is the
quiet kind of leakage — it does not show up as a suspicious accuracy, it just inflates every
fold a little. `test_preprocessor_is_fit_on_training_rows_only` asserts that a fit on one
fold's training slice differs from a fit on the whole panel. Decision: spec.

**2026-11-12 — the leakage test is parsed, not grepped.** The first version searched the
`features.py` source for `shift(-` and failed on the docstring that *describes* the rule.
Rewritten to walk the AST for `shift`/`pct_change`/`diff` calls with a negative argument,
which is both correct and the check that was actually intended. A second test asserts
`labels.py` has exactly one forward shift — the target — because a second one appearing
there is far more likely to be a bug than a second legitimate label. Decision: generated,
then corrected by me when the test failed on its own prose.

**Acceptance check — step 2**

| Check | Command | Result |
|---|---|---|
| `make data` rebuilds from scratch | `python ml/tasks.py data` | ✅ pass |
| ≥ 35k rows | — | ✅ 49,776 rows (49,759 labelled) |
| ≤ 60 features | — | ✅ 57 in the panel, 58 model columns |
| Data within 2 sessions of today | — | ✅ last session 2026-11-11, 1 behind |
| `panel.parquet` committed | `git ls-files ml/data/processed` | ✅ pass |
| Leakage test passes | `python ml/tasks.py test` | ✅ pass — includes the future-price-shock test |
| Full specified universe | — | ❌ **17 of 18** — see the rate-limit entry above |

---

## Step 3 — Model & evaluation (the gate)

**2026-11-12 — the most regularised candidate won.** Three parameter sets, selected by mean
per-fold log loss rather than accuracy, because the product displays a *probability* and the
thing worth optimising is how well-calibrated and sharp it is, not how often its argmax
happens to be right. `num_leaves=7, lr=0.03, min_child_samples=200, n_estimators=300` won
at 0.68727 mean fold log loss (OOF accuracy 54.44%); the 31-leaf candidate was worst. That
ordering is itself informative: capacity is not the constraint on this problem.
Decision: spec.

**2026-11-12 — threshold 0.600, chosen on validation, frozen.** Scanned 0.50–0.60 on
out-of-fold predictions with a 10% coverage floor, because maximising accuracy alone selects
"abstain almost always", which scores well and is a useless product. The chosen point had
63.06% validation accuracy at 16.2% coverage. Written *into* `model.pkl` rather than left in
a config file, specifically so it cannot quietly become a dial for making the
coverage-accuracy curve look better later. Decision: spec.

**2026-11-12 — two artifact bugs, both found by running the pipeline rather than by
review.** Neither is visible to a test that only exercises objects already in memory, and
both are the same shape of defect — the artifact was not self-sufficient:

1. `TrainedModel` pickled as `__main__.TrainedModel`, because `python -m copilot.train` runs
   the module as `__main__` and pickle stores a class by module path. Every consumer failed
   with a bare `AttributeError: Can't get attribute 'TrainedModel'`. A judge cloning the
   repo would have hit it on first run. Fixed by re-importing the module under its real name
   in the `__main__` guard.
2. Categorical levels were not carried in the bundle. LightGBM encodes a pandas `category`
   column by its *categories list*, so a predict-time frame built without the training
   levels is rejected outright. Training looked completely fine; the failure appeared at the
   first prediction.

`ml/tests/test_artifacts.py` now loads from disk and predicts — which is what the service
does, and what neither bug survived. Decision: generated, diagnosed and fixed by me.

**2026-11-12 — model.pkl re-serialised rather than retrained for bug 1.** The fitted
boosters, the preprocessor and the frozen threshold were carried across untouched; nothing
was refit and nothing reselected. For bug 2 a full retrain was unavoidable (the bundle
needed a new field) and reproduced identical numbers, which is the expected result of a
fixed `random_state` and is itself a reproducibility check. Decision: mine.

**2026-11-12 — `COPILOT_HOLDOUT_SMOKE` added, because the evaluation code had to be
debugged.** "The final holdout is evaluated exactly once" is the strongest claim this build
makes, and silently reading the holdout a few times while fixing a `KeyError` would make it
false. A run with the flag set is recorded in the committed ledger as a `smoke` read and
stamps `headline_authoritative: false` into `metrics.json`, which the model card then
renders as a warning banner. Nothing about a smoke run can inform a hyperparameter or the
threshold — those are frozen in `model.pkl` before this module runs, which is what makes the
distinction meaningful rather than a loophole. Decision: mine.

**2026-11-12 — the headline is 51.37%, and it is below the band the spec expected.** §4.7
anticipated 53–57%. Checked rather than accepted: the three directional baselines all land
at 48.5–48.9% on the same window, so the model's edge over them is 2.5–2.8 points and the
AUC is 0.5254 — a real but small edge, measured on a forward window where even
always-predict-up loses money. The leakage tests pass, including the future-price-shock
test. 51.37% is the honest number for this holdout and it is reported as the headline.
Decision: mine.

**2026-11-12 — a docstring claim was contradicted by the artifact, and corrected.** I had
written into `per_vix_regime` that "the model is measurably worse in the stressed tercile",
before reading the table. The measurement says close to the opposite: stressed 58.13%, calm
50.51%, normal 48.18%. Corrected in the docstring, in the README, and checked across the UI
copy (`grep` found no instance of the false claim in `src/`). The note is kept rather than
quietly replaced, because the original sentence is exactly the kind of confident framing this
project's own artifact would have contradicted. Decision: mine.

**Acceptance check — step 3**

| Check | Command | Result |
|---|---|---|
| `make eval` writes `metrics.json` | `python ml/tasks.py eval` | ✅ pass |
| Calibration near-diagonal | — | ✅ expected calibration error 3.07%; max 12.98% on one sparse decile |
| Purge / overlap test passes | `python ml/tasks.py test` | ✅ pass — 9 purge tests |
| Four baselines present | — | ✅ always-up, prev-day sign, 3-feature logistic, buy-and-hold |
| Artifacts committed and frozen | `git ls-files ml/artifacts` | ✅ 8 artifacts committed |
| Headline ≤ 60% (§4.7) | — | ✅ 51.37% |
| Holdout read once | `ml/artifacts/holdout_ledger.json` | ✅ **1 authoritative**, 1 smoke — see below |

**2026-11-12 — the authoritative holdout read, after the panel was final.** Deferred until
the TATAMOTORS retry loop was abandoned, so that the one authoritative read would be against
the panel that actually ships. The ledger now records two entries with an **identical
holdout content hash** (`3d37877d64dfbb4b`), which is the evidence that matters: the smoke
run and the authoritative run saw exactly the same rows, and nothing between them could have
tuned anything. The numbers are byte-identical, which is the expected consequence of a fixed
`random_state` and a frozen artifact. Decision: mine.

---

## Step 4 — ML API

**2026-11-12 — five endpoints, artifacts loaded once at startup.** `GET /health`,
`GET /signals`, `GET /signals/{ticker}`, `GET /metrics`, `POST /neighbors`. Env-driven CORS
(the old project hardcoded `localhost:5173`, so it could only ever talk to one frontend on
one machine) and a cache keyed on every parameter that changes the answer — the old
`/api/history` cached its first response and then ignored its own `days` argument forever.
Decision: spec.

**2026-11-12 — the neighbour index is built at startup, not committed.** It is derived
entirely from `panel.parquet`, which is already committed, and a second copy of the same
numbers on disk is a way for the two to disagree. ~50k × 12 float32 is about 2.5 MB in
memory. Decision: mine.

**Acceptance check — step 4**

| Check | Measurement | Result |
|---|---|---|
| All endpoints return real data < 500ms warm | `/health` 34ms · `/signals` 11ms · `/signals/{t}` 6ms · `/metrics` 23ms · `/metrics?section` 6ms · `POST /neighbors` 143ms | ✅ pass |
| Zero training at boot | `/health` → `trains_on_request: false` | ✅ pass |
| `/health` green | — | ✅ `status: ok`, all 5 artifacts present |
| Cache keyed on parameters | `k=25` → 25 neighbours, `k=50` → 50 | ✅ pass — the old project's bug would have returned 25 twice |
| 404 on an unknown ticker | `/signals/FAKE.NS` | ✅ 404 |

---

## Steps 5 & 6 — Template rewire and UI surfaces

**2026-11-12 — the Drizzle schema needed no replacement, only additions.** §7.1 asked for
learner/skill/course tables to be replaced. The template's schema carries none — it is
already generic (`agent_sessions`, `messages`, `memory_items`, `pending_actions`, `outbox`,
`trace_events`, `llm_cache`, `eval_runs`). So the change is purely additive: `watchlist`,
`signals_snapshot`, `risk_profile`. Decision: mine (the spec's premise did not hold).

**2026-11-12 — `signals_snapshot` is an audit log, not a cache.** Nothing the model predicts
is otherwise stored in Postgres: a copy of a probability in a second place can go stale, and
a stale probability presented as today's is the class of failure this build exists to avoid.
The one exception is accountability — if a signal is acted on there has to be a record of
what the model said *at that moment*, because the model is retrained and the artifact
regenerated. Its `probability_up` is the value as displayed on `shown_at`, and the comment
in the schema says so. Decision: mine.

**2026-11-12 — ⚠ the biggest deviation in the build: `app/learn/**` and the tabbed
workspace were retired, and the finance surfaces became their own routes.** §7.1 maps the
workspace's chat/path/dashboard/trace tabs onto new content *and* says to retire
`app/learn/**`. Those conflict: the tabbed workspace *is* `app/learn/[learnerId]`, and
`LearnWorkspace.tsx` is 513 lines coupled to `learnerId`, a profile, a generated path, a
per-learner dashboard endpoint and three API routes the same section retires.

Resolution: `/signals`, `/dashboard` (model card) and `/evidence` are their own routes in
the existing shell; `/workspace` keeps the template's agent surface (input → results →
trace → approvals), which already *is* the trace-and-approvals tab §7.1 asks for. Every
§7.1 surface has a real home, every panel reads a real endpoint, and the shell's layout,
tokens, CSS modules and motion are untouched. What is lost is the five-tab chrome. Judged
against "a half-built panel scores worse than an absent one" and §9.1's ban on touching the
shell, four complete routes beat a partially-rewired tab container. Decision: mine, and the
most debatable one in the build.

**2026-11-12 — three landing sections deleted rather than re-dressed.** `SkillStream`,
`ProofStrip` and `EvidencePlates` are well-built components whose only content was counts
from the demo seed's PRNG: a corpus size, a confirmed-edge ratio, a 1,284,000-user
population. Honest placeholders in a domain-agnostic template, and exactly the
fabricated-statistics pattern §4.1 forbids in a finance submission. `MeasuredStrip` replaces
them with four figures read from `metrics.json`, and renders **no numbers at all** when the
service is down. Also deleted: the skill graph, `src/lib/trust.ts`, `engineData`,
`graphEvidence`, `evidencePlates`, `demoStory` and nine other now-orphaned libs.
Decision: mine (§4.1 over §9.1's "don't touch the shell" — these panels are content, not
layout).

**2026-11-12 — `demo-seed.ts` went from 556 lines to 100, with no numeric content.** It now
supplies a watchlist drawn from the real universe and a deterministic prompt order, and
nothing else. `tests/honesty.test.ts` asserts it contains no decimal literal at all, because
a number appearing in it is the first step back toward generated statistics. Decision: spec.

**2026-11-12 — the generic `ml_predict` tool was deleted, not left unregistered.** With no
endpoint set it returned a label and a score derived from the length of its own JSON input —
a deterministic fake, clearly labelled, and a perfectly reasonable placeholder in a
template. Keeping it alongside the three typed finance tools would have left a second path
to "the model" that fabricates a plausible number when the service is unreachable.
Decision: mine.

**2026-11-12 — `src/lib/ml/client.ts` has no mock-numbers mode, deliberately.** Every
response is either `source: "service"` with real data or `source: "unavailable"` with a
reason and **no numbers**. The template's rule is that anything new must work or degrade
*visibly*; here the visible degradation is an `ErrorState` naming the missing service.
Decision: mine (§4.1).

**2026-11-12 — chart palette validated, not eyeballed.** The two-series coverage chart
reuses the shell's existing `--color-viz` violet and adds one second hue. The shell's
`--color-coral` was rejected: at L 0.712 it sits outside the dark-mode lightness band, so a
chart using it reads louder than the data. `#d9534c` is the same hue stepped to L 0.56 and
the pair passes all six checks (CVD ΔE 26.4 protan, 27.1 tritan; normal-vision ΔE 27.7;
contrast ≥ 3:1). Both charts also carry direct labels and a table view, so identity never
rests on colour alone. Decision: mine.

**2026-11-12 — all 17 names abstain today, and the board says so.** The honest output of a
frozen threshold with ~10% coverage. Not a bug to be smoothed over by lowering the
threshold — §9.1 forbids that outright, and §6.5 freezes the number precisely so it cannot
become a dial for making a dashboard look busier. An explanatory panel renders when
`signals_emitted === 0`, because a board of nothing but refusals is otherwise
indistinguishable from a broken board. Decision: mine.

**Acceptance check — steps 5 & 6**

| Check | Command | Result |
|---|---|---|
| A sample question produces ≥ 2 tool calls | `npm run eval` | ✅ 6 tool calls on every one of 7 cases |
| `npm test` green in mock mode | `npm test` | ✅ 197/197 |
| Every panel reads a real endpoint | — | ✅ `/signals`, `/dashboard`, `/evidence`, landing strip — all through `src/lib/ml/client.ts` |
| No literal statistic in TSX | `npm test` | ✅ enforced by `tests/honesty.test.ts` |
| Loading + error states on every fetch | — | ✅ `ErrorState` on every `unavailable`; `EmptyState` on an empty-but-valid payload |
| `npm run build` passes | — | ✅ 22 routes |

---

## Step 7 — Honesty & safety pass

**2026-11-12 — four finance rules, blocking ones first.** No directional claim without a
`get_signal` call behind it; an abstention is final; no phrasing implying a guaranteed
return; the disclaimer is attached to any answer containing a signal. Each is also in the
system prompt, and that is the point: a prompt is a request, and under a jailbreak or eight
steps into a long conversation it is the first thing to go. Composed *after* the template's
two rules so `never-act-without-approval` can never be overtaken. Decision: spec.

**2026-11-12 — the guarantee rule annotates rather than silently rewriting.** A rewrite
would hide that the model produced the phrase, and in a build whose argument is that the
guardrails are visible, hiding a guardrail firing is the wrong trade. Decision: mine.

**2026-11-12 — `tests/honesty.test.ts` enforces §4 mechanically.** Universe parity between
`src/lib/universe.ts` and `config.py` by parsing the Python; no metric-shaped decimal
literal in any finance component; no model statistic in `idea.config.ts`; no numeric content
in the demo seed; the disclaimer imported by all five signal components and byte-identical
between the TypeScript and the Python; and every `mustBuilds` path existing on disk. The
last of those immediately failed and caught four stale paths I had written from memory.
Decision: mine.

**2026-11-12 — `SCALE_REFERENCE` added so the no-literals rule can stay absolute.** The
test correctly flagged "0.25 is a coin flip" on the model card. That figure is a property of
the Brier scoring rule, not a measurement of this model, but it is still a literal. Resolved
by naming the three genuine scale references in one audited constant in `format.ts` and
interpolating them, rather than by widening the test's allowlist. Decision: mine.

**2026-11-12 — §4.1 violation found and fixed: an empty `LLM_FALLBACKS` restored the
default chain.** `env()` collapses absent and blank into `undefined` — correct almost
everywhere, since a blank line in a scaffolded env file means "not configured" — but it made
`LLM_FALLBACKS=` fall through to a chain ending in Anthropic and Groq models whose keys are
deliberately unset. Every live turn would have attempted two unreachable providers before
the mock. `fallbackModels()` is now the one reader that distinguishes absent from
present-and-empty. `npm run preflight` now reports the chain as `gemini-2.5-flash` alone.
Decision: mine (§4.1 is the reason).

**2026-11-12 — ⚠ a template test was inverted, deliberately.**
`tests/env.test.ts` asserted that a blank fallback list does *not* empty the model chain,
which follows from `env()`'s doctrine and is right for a generic starter. It is the opposite
of what §4.1 requires. Rewritten to assert both branches, with the reasoning in the test
itself so the inversion is not mistaken for a regression. This is the only template
assertion this build reverses. Decision: mine.

**2026-11-12 — the eval suite was rewritten for this project.** The template's six
placeholder cases scored 5/6 because the mock's tool ranking did not reach `verify` within
the six-step budget — a failure of the *case*, not the code. Seven cases now assert what
this project claims: a directional question reaches `get_signal`, "how accurate are you"
reaches `get_model_metrics`, evidence reaches `find_similar_days`, money goes through
`calculate`, an action queues through `create_task`, and the answer declares mock mode.
7/7, 6 tool calls each. Decision: mine.

**2026-11-12 — `ml_predict` removed from the mock provider's `BUILTIN_TOOLS` list too.**
That list is what tells the mock which tools are the template's rather than the idea's, so a
stale entry would have made it de-prioritise a real tool of the same name. Decision: mine.

**2026-11-12 — an ML-service check added to preflight.** A `warn` rather than a `fail` when
the service is down, because the app is genuinely usable without it — but the demo is not
worth recording in that state, so the check reports exactly what is missing and the command
that fixes it. A second check asserts `trains_on_request: false`, which is §4.3 enforced at
the boundary rather than trusted. Decision: mine.

**2026-11-12 — the Playwright suite was rewritten, and its web server was pointed at a
route that still exists.** The old suite walked `/learn`, and `playwright.config.ts` waited
on `/api/learners` before starting — both retired. The symptom was a silent ten-minute
`Timed out waiting from config.webServer` with no other clue. Now waits on `/api/outbox`,
which also queries the database and so still closes the migration window. The new suite
asserts the disclaimer on all three signal surfaces, that an abstention card carries no
direction element, that the retired routes 404 rather than half-render, and no horizontal
overflow at 390px on four pages. Written to pass whether or not the ML service is running:
"either real data or an honest error, never a fabricated figure" is the invariant worth
asserting, and a test that required the service would be skipped in the configuration most
likely to expose the bug. Decision: mine.

**Acceptance check — step 7**

| Check | Command | Result |
|---|---|---|
| `npm run demo-check` green with no API keys | `npm run demo-check` | ✅ preflight ready · eval 7/7 · Playwright 7/7 |
| Rules block an unapproved action | `npx vitest run tests/rules.finance.test.ts` | ✅ 18 rule tests |
| Disclaimer on every signal surface | `tests/honesty.test.ts` + Playwright | ✅ asserted on 5 components and 3 rendered pages |

---

## Step 8 — Ship-ready (local)

**2026-11-12 — the fresh-clone check, which is what §9 caps Functionality on.** Cloned the
committed tree into a temp directory and followed the README literally. Nothing untracked
came along, and the clone had no `.env.local` — which is the configuration being claimed,
so the migration printing "`.env.local` not found. Continuing without it." is the check
passing, not a warning. Decision: spec.

**2026-11-12 — `ml/tests/test_readme_numbers.py`.** The README is the other surface a judge
reads and the one most likely to drift: written once by hand, from a model that then gets
retrained. All 22 figures it quotes are now checked against `metrics.json`, along with the
library credits (an explicit Arthaton rule), the limitations, an oversell check, and a test
that *requires* the README to disclose the universe gap whenever the panel is short of 18.
Decision: mine.

**2026-11-12 — the visual pass found a documentation gap, via a banner doing its job.**
After the authoritative eval the model card still showed "Not an authoritative
measurement". The cause is correct behaviour — artifacts load once at startup and are never
re-read on the request path (§4.3) — but neither `SETUP.md` nor `HUMAN_TASKS.md` said to
restart the service after a refresh. Both now do, and point at `/health`'s `loaded_at`.
Decision: mine.

**Acceptance check — step 8**

| Check | Command | Result |
|---|---|---|
| Fresh clone → 3 commands → running | `git clone` + `npm ci` + `pip install -e ./ml` + `npm run db:migrate` | ✅ pass |
| …and the ML service serves real artifacts | `/health` in the clone | ✅ `status: ok`, 49,776 panel rows, `trains_on_request: false` |
| …and its tests pass | `npm test` · `pytest ml` in the clone | ✅ 197/197 · 32 passed, 1 xfailed |
| `npm run build` passes | — | ✅ 22 routes |
| `npm run demo-check` green on mock | — | ✅ |
| Demo script written | `DEMO_SCRIPT.md` | ✅ 3-minute script + 6 anticipated questions |

---

## Step 9 — Scoring rounds

Scored against §2, then looped per §9.1: one change per round, from the whitelist, with
`npm test`, `npm run build` and the fresh-clone check re-run after each.

**Round 0 — initial score: 84/100.**

| Criterion | Target | Scored | Why not full marks |
|---|---|---|---|
| Problem & Design | 17 | 17 | the risk-profile input (§7.1) has a schema and a table but no UI |
| Functionality | 21 | 20 | three nav entries lead to generic template pages; three DB tables unused; 17 of 18 tickers |
| AI/ML | 18 | 18 | — |
| Innovation | 12 | 13 | all three cheap adds, plus the holdout ledger |
| UX | 9 | 8 | crowded chart axis; no visible keyboard focus ring on the controls I added |
| Code Quality | 8 | 8 | an orphaned component cluster left by the retirement |

**Round 1 — Code Quality, "delete dead code".** An import audit found a cluster orphaned by
the §7.1 retirement: `DashboardTab`, `BadgeMedal`, `Dashboard`, `AppShell`, `Rail`,
`EmptyPath`, `WowSlot`, `NovaStage` and `nova/machine.ts` — nothing imported any of them.
Deleted.

I also deleted `profileCard.ts` and `ProfileCardView.tsx` and then **put them back**. They
are unreachable (nothing emits a `ui_card` event), but removing them means editing
`ChatPanel.tsx` in fifteen places — a live, demo-critical component — for a notional gain.
§9.1 rule 3 is exactly about that trade, so the self-contained feature stays. Code Quality
8 → 8 (the cluster was already discounted); no score change, a cleaner tree.

**Round 2 — UX, "add keyboard focus states" and readability.** Two items from the same
§9.1 line, done together and logged as such:
- the coverage chart labelled all 21 of its half-point thresholds, producing a solid band
  of text along the bottom. Now every third tick — the exact value of any point is in the
  tooltip and the table view.
- visible focus rings on the nav and on the evidence page's eighteen ticker links. A
  `focus-visible:text-ink-1` alone moves text from 60% to 100% white, which is easy to lose
  among eighteen near-identical pills.

Also checked and **not** a defect: a circular element overlapping text at the bottom-left of
every page. `document.elementFromPoint` identified it as `NEXTJS-PORTAL`, the dev-mode
indicator. It does not exist in a production build, which is what Playwright runs against.
UX 8 → 9.

**Round 2 guards:** `npm run build` ✅ · `npm test` 197/197 ✅ · `npm run lint` 0 errors ✅

**Final: 85/100.** Stopping per §9 — the score cleared the bar and the remaining gaps are
named rather than fixable inside the whitelist (the 18th ticker is a Yahoo rate limit, and
the risk-profile UI is new scope rather than an allowed move).

**Round 3 — a §4.1 inconsistency, not a score-chasing change.** The final audit found
`.env.example` still advertising the template's multi-provider setup: `ANTHROPIC_API_KEY`,
`GROQ_API_KEY`, `LLM_PRIMARY=claude-sonnet-5`, a four-model fallback chain, Voyage/OpenAI
embeddings, a Tavily key, and `ML_ENDPOINT` documented as the generic `ml_predict` slot. A
judge copying it to `.env.local` — the first instruction in the file — would have built a
configuration this project forbids, and one directly contradicted by `SETUP.md` and
`HUMAN_TASKS.md`.

Rewritten: the six variables this build actually uses are listed up front, the forbidden
ones are marked as forbidden with the reason, `ML_ENDPOINT` documents the real service and
its unreachable-is-supported behaviour, and the `LLM_FALLBACKS` present-versus-absent trap
is spelled out where someone editing the file will see it. Same class as the
`fallbackModels()` fix in step 7: a correctness fix for a hard constraint, found by
auditing rather than by a failing test. Guards: `npm test` 197/197 ✅ · `npm run build` ✅.

**Round 4 — a §4.1 violation the honesty test was not looking at.** The final audit grepped
the *whole* tree for metric-shaped literals rather than just the directory
`tests/honesty.test.ts` scans, and found one: `ArcDeck.tsx`, the landing page's
"how it works" explainer, hard-coded a six-row scoring breakdown — `Coverage 0.04`,
`Similarity 0.31`, `Learners' next 0.24`, `Total 0.43` — along with a "Cloud Engineer"
goal and a skill DAG of Python/Linux/Git/SQL. Invented numbers under a heading a visitor
reads as "how this works", on the first surface a judge sees.

It survived three scoring rounds because the test only scanned
`src/components/finance`. Fixed in three parts:

1. `ArcDeck` deleted. `HowItWorks` replaces it — a component the template already shipped,
   rendering `idea.config.landing.howItWorks`, which already held this project's three
   steps and was being rendered nowhere.
2. The partner-tool row dropped from `HowItWorks`: Arthaton has no partner track and a
   labelled "Partner tool: Not applicable" is a dead row.
3. **The test now scans `components/landing` as well**, which is the actual fix — the
   first version depended on my remembering to grep by hand. Its presentation allowlist
   (SVG geometry, easing curves, spring constants, colour functions) is written as five
   structurally-identifiable patterns rather than a general escape hatch, because a loose
   allowlist here readmits exactly what the test exists to catch.

Guards: `npm run build` ✅ · `npm test` 197/197 ✅ · `npm run lint` 0 errors ✅ · landing
page verified in the browser.

**Round 5 — the words, not just the routes.** Having widened the honesty test once, I
widened it again to assert on *rendered text*, and it immediately found that the §7.1
retirement had removed the learner **routes** long before it removed the learner **copy**:

| Where | What it said |
|---|---|
| `app/opengraph-image.tsx` | the social card — what renders when the submission link is pasted anywhere — described "your AI learning mentor" and "a learning path you can verify", over "a hand-built skill map checked against millions of real learners" |
| `app/error.tsx` | a button to `/learn`: **a dead link on the error page**, reached by someone already stuck |
| `app/sign-in/page.tsx` | promised to keep "your learners, paths and conversations" |
| `src/components/landing/BeamNetwork.tsx` | an architecture diagram of Profile → Skill graph → Catalog → Engine → Path/Feedback/Dashboard |
| `src/components/chat/ChatPanel.tsx` | tool chips reading "Generating your path", a greeting offering to "build a path from real courses", a composer placeholder of "I want to become a…", and resting states naming "your path, feedback, graph and dashboard" |

None of it broke a build or failed a test. All of it would have been read by a judge.

`BeamNetwork` was relabelled rather than deleted — its structure (three committed inputs,
one service, three outputs) is exactly this project's, so the nodes became Price panel /
Calibrator / Metrics → Model service → Signal / Abstention / Evidence. Layout, beams and
timings untouched.

This also settled the profile-card question from round 1 the other way. I had kept it as a
"coherent working feature"; the retired-route scan showed its save path POSTs to
`/api/learners/:id/profile`, a route that no longer exists. It was not dormant, it was
broken — unreachable code pointing at a 404 — so it is gone, and `ChatPanel` ignores the
`ui_card` event rather than rendering it.

Two tests added and both fail the build on recurrence: one scans every rendered file for
the inherited vocabulary, one forbids any reference to a retired route in `app/` or `src/`.
The second is the more valuable: it is how the dead error-page link would have been caught
on the day it was created.

One self-inflicted break along the way: the rewritten social card put two child nodes in a
`<div>` without an explicit `display`, which Satori rejects at prerender — a red production
build from a copy edit. Fixed, and worth recording as the reason the OG route is worth
building rather than eyeballing.

Guards: `npm run build` ✅ · `npm test` **200**/200 ✅ · `npm run lint` 0 errors ✅

### Submission checklist

| | Status |
|---|---|
| Fresh `git clone` into a temp dir runs in three commands | ✅ verified end to end at the final commit `6db1bb4` — see below |
| Production build passes; deploy runbook complete | ✅ 22 routes · `HUMAN_TASKS.md` task 6 (two services, Neon, CORS) |
| Every UI number traces to `ml/artifacts/*.json` | ✅ enforced by `tests/honesty.test.ts` |
| `metrics.json` reports an honest headline against four baselines | ✅ 51.37% vs 48.91 / 48.54 / 48.58 / buy-and-hold |
| Final holdout evaluated exactly once | ✅ 1 authoritative read; ledger committed; identical content hash to the smoke read |
| Disclaimer on every signal surface; historical/paper-only stated | ✅ 5 components, 3 pages, every API payload |
| README credits every library and AI API | ✅ asserted by `test_readme_credits_the_libraries` |
| `npm run demo-check` green with no API keys | ✅ preflight ready · eval 7/7 · Playwright 7/7 |
| Data refreshed to within two sessions | ✅ last session 2026-11-11, 1 behind — re-run on submission day (`HUMAN_TASKS.md` task 4) |
| No fabricated metric, no hardcoded confidence, no dead button | ✅ — the footer's `#` "Source" placeholder was removed rather than left linking nowhere |
| Full 18-ticker universe | ❌ **17 of 18** — Yahoo rate limit, documented in four places and carried as an xfail |

---

## Rounds 6–10 — raising the target to 90

**The target was raised from 85 to 90 after the first report, at the user's direction.**
That takes this past §9.1's "maximum 3 improvement rounds", which is recorded here rather
than glossed: the cap exists to stop a loop churning, and the decision to keep going was
made by a person with the score in front of them, not by the loop deciding it was close.

The forbidden list still applied in full, and nothing in these rounds touched it. **AI/ML
is frozen**: no change to the model, the features, the universe, the hyperparameters or
the abstention threshold, and the final holdout was not re-read. Every point came from
surfaces and tests built over artifacts that already existed.

**Round 6 — Functionality: the paper-trading panel.** The `paper_trading` block has been
in `metrics.json` since the authoritative eval, fetched with the rest of the document and
never rendered — a stubbed panel with a real endpoint already behind it, which is §9.1's
named Functionality move and also stretch item 1. Now a cost table with buy-and-hold on
the same axis and an equity curve with the buy-and-hold total marked.

Two presentation decisions worth recording. The curve is flat for long stretches, and the
caption says why (65 positions across 337 sessions) rather than letting it read as missing
data. And "positive sessions" is labelled a share of *all* sessions, not of traded ones —
9.5% otherwise reads as a dismal win rate rather than as mostly-flat.

**Round 7 — Functionality: a real watchlist.** The nav entry said "Watchlist" and led to
the agent's memory page: real data, but not what the label promised. `/watchlist` is the
real thing, on the `watchlist` table that had been schema with no writer. Adds are
validated against the universe — a tracked name the model has never seen would render a
permanent "no data" that reads as a bug — and idempotent via `onConflictDoNothing`.

**Round 8 — Problem & Design: the risk-profile input,** which §9.1 names explicitly. Its
one real constraint: `minProbability` is clamped **up** to the model's frozen threshold on
save, server-side, because a form's `min` attribute is a suggestion to the browser. A user
can only ever see fewer calls. Calls between the user's gate and the model's are greyed
rather than hidden, because hiding them would be indistinguishable from an abstention —
and that is the one distinction this whole product exists to draw.

**Round 9 — Code Quality: 19 tests.** Most assert the clamp as a property across the
schema's whole range rather than at three points. `effectiveThreshold` moved into
`src/lib/riskProfile.ts`, an I/O-free module, so it can be tested without standing up
next-auth and the database: a rule nobody can unit-test is a rule that gets quietly broken.

**Round 10 — a dead control I had just created.** Re-scoring caught it: the risk-profile
form tells the user their horizon is "recorded so the assistant can tell you it is outside
what has been measured", and nothing wired it into the agent. A stored setting that is
never acted on is a dead control, and one whose label claims a behaviour it does not have
is the same defect as a fabricated number, just in prose. Fixed by passing the profile
into the agent loop from both routes and emitting an instruction block that forbids
extrapolating the one-session probability across a longer horizon. Pinned by a test that
asserts both routes actually pass it, not merely that the function exists.

**Schema change.** `watchlist` and `risk_profile` are now scoped by owner rather than by
agent session. A page reached from the nav has no session, so the old keying meant a list
that silently emptied whenever a new conversation started — and the unique index could not
stay on `(session_id, ticker)` because Postgres treats NULLs as distinct, so every add
would have inserted another row. Migration `0002` is hand-written (`drizzle-kit generate`
prompts interactively for renames and has no TTY here) and applies cleanly from scratch.

**One test caught one of my own literals again.** `max={0.95}` on the slider. It was right:
those are schema bounds, so `RISK_PROFILE_BOUNDS` now defines them once and both the zod
schema and the control read it — a slider that offers a value the schema rejects is a form
that fails on submit for no visible reason.

**Guards after these rounds:** `npm run build` ✅ · `npm test` **219**/219 ✅ ·
`npm run lint` 0 errors ✅ · `npm run demo-check` ✅ (preflight ready · eval 7/7 ·
Playwright 7/7) · all three new surfaces verified in the browser, including a real
add-to-watchlist round trip.

### Re-score: 90/100

| Criterion | Was | Now | What moved |
|---|---|---|---|
| Problem & Design | 17 | **18** | the risk-profile input exists and the horizon it records actually changes what the assistant says |
| Functionality | 20 | **23** | stretch item 1 built; a fifth real surface; two of the three unused tables now have writers |
| AI/ML | 18 | **18** | frozen, deliberately untouched |
| Innovation | 13 | **13** | unchanged — paper trading is completeness, not novelty |
| UX | 9 | **9** | unchanged |
| Code Quality | 8 | **9** | 19 tests, the I/O-free split, bounds unified in one place |

**Remaining gaps, unchanged:** the 18th ticker (a Yahoo rate limit, not a code problem);
`signals_snapshot` still has no writer; the "Alerts" nav entry is the template's outbox,
which is defensible — a queued action awaiting approval *is* the alert — but is not
finance-specific.

### The fresh-clone check, at the final commit

§9 caps Functionality at 10/25 if this fails, so it is the one check worth running last
rather than early. Three runs happened; the first two were at earlier commits and the
third was killed mid-install by session cleanup. **This is the complete run at `6db1bb4`,
the tip** — recorded leg by leg because "verified twice, at commits five changes back"
was what I had initially written up, and that is not the same claim.

| Leg | Result |
|---|---|
| `git clone` | ✅ 251 tracked files; all 7 required artifacts present; nothing untracked came along |
| `npm ci` | ✅ exit 0 |
| `pip install -e "./ml[dev]"` | ✅ exit 0 |
| `npm run db:migrate` | ✅ `driver=pglite`, no `.env.local` present — which is the configuration being claimed |
| `npm run build` | ✅ exit 0 |
| `npm test` | ✅ 200/200 |
| `pytest ml` | ✅ 37 passed, 1 xfailed |
| ML service boots | ✅ `status: ok`, 49,776 panel rows, `trains_on_request: false` |
| `/signals` | ✅ 17 signals, 17 abstained |
| `/metrics?section=direction` | ✅ accuracy `0.513702` — matches the committed artifact exactly |
| `POST /neighbors` | ✅ 25 analogues, up-rate 0.4 |

Re-run in full at `9211387`, the tip after the 90-point rounds — including migration
`0002`, which is the leg a hand-written migration most needs checked:

| Leg | Result |
|---|---|
| `git clone` | ✅ 259 tracked files; all three migrations present |
| `npm ci` | ✅ exit 0 |
| `pip install -e "./ml[dev]"` | ✅ exit 0 |
| `npm run db:migrate` | ✅ all three migrations apply from scratch, `driver=pglite` |
| `npm run build` | ✅ exit 0, `/watchlist` among the routes |
| `npm test` | ✅ 219/219 |
| `pytest ml` | ✅ 37 passed, 1 xfailed |
| ML service | ✅ `status: ok`, 49,776 rows, `trains_on_request: false` |
| `/metrics` | ✅ accuracy `0.513702`, `headline_authoritative: true`, **1 authoritative holdout read** |
| paper trading | ✅ realistic scenario `0.100756` over 337 sessions |

---

## 2026-11-17 · `public/walkthrough.html` — the animated walkthrough deck

**Mine (specified), generated code.** Asked for "a 3D animated video going through the
whole project". I cannot render a video file — no engine, no renderer, no MP4 out — so
what this is instead is the thing you *record*: a self-advancing 13-scene deck in a
`perspective` space, locked to 16:9, paced for a screen capture. The "3D" is real CSS
transforms on composited planes, not a rendered animation.

Decisions worth keeping:

- **The stage is a `container-type: size` box** and every dimension is `cqw`/`cqh`, so the
  deck is identical at 720p and 4K and the recording needs no chosen zoom level.
- **Start is gated on `document.fonts.ready`** (with a 3s fallback for an offline
  machine). A font swap caught between scene 1 and 2 is the one defect a re-record
  cannot fix.
- **Figures are transcribed from the artifacts, then verified against them.** Every number
  was re-read from `metrics.json`, `confidence_tiers.json`, `magnitude_metrics.json`,
  `holdout_ledger.json` and `latest_signals.json` before commit.

Three defects I introduced and fixed, all found by screenshotting rather than by reading
the source:

1. **`--h` was declared on `.col` but read by its sibling `.v`** — the `calc()` is invalid
   at computed-value time, `bottom` silently resolved to `auto`, and every bar's value
   label collapsed onto its key label. Moved the custom properties up to `.bar`.
2. **The magnitude range beam put 60.20% and the 60% reference at the wrong x.** On the
   axis the band establishes (20.126% per point) they belong at 47% and 43%, not 51% and
   40%. A mispositioned median on a linear axis is the exact failure this project exists
   to avoid.
3. **The abstention chart drew the "calls" band at 40% of the width for 10.2% of
   sessions** — probability on one scale, coverage on the other, in one figure. Re-cut the
   axis as session share, so 89.8/10.2 are the widths they are labelled with.

Verified: 238 vitest · 104 pytest + 1 xfail · lint 0 errors · all 13 scenes render with no
content crossing the stage edge, no console errors, and autoplay working under both
`prefers-reduced-motion` settings.
