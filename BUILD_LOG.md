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
