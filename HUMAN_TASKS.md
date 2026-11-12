# Human tasks

Everything in this build that needs **your credentials, your machine's interactive
session, or your voice**. Nothing here blocked the build: the app, the test suite and the
ML service all run without any of it. Each task says exactly what to run.

Ordered by what the Arthaton submission actually requires.

---

## 1. Supply the Gemini API key — 2 minutes

**Status:** not done. The app currently runs in `LLM_MODE=mock`, where the agent loop,
the tool calls, the rules layer, the approvals queue and every panel work, but the
assistant's prose is generated locally and says so.

1. Go to <https://aistudio.google.com/apikey> and create a key (free tier is enough).
2. Put it in `.env.local` and switch the mode to live:

```ini
GEMINI_API_KEY=your-key-here
LLM_MODE=live
```

3. Restart the dev server — Next reads `.env.local` at startup only.

```bash
npm run dev
```

4. Confirm it took:

```bash
npm run preflight    # "provider: gemini  GEMINI_API_KEY is set" and "LLM mode  live"
```

**Do not create any other key.** §4.1 of the build spec allows exactly one LLM provider.
`LLM_FALLBACKS` is deliberately empty and `tests/honesty.test.ts` asserts that an empty
value means *no* fallbacks, so adding an Anthropic or Groq key would be a spec violation
rather than a nice-to-have.

**Re-run the eval with the key before quoting its number anywhere:**

```bash
npm run eval         # the 7/7 in the README is mock mode, which measures plumbing
```

---

## 2. Record the demo video — you only

**Status:** not done. Needs your voice and your screen.

The script is in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md), timed to the usual three minutes,
with the exact questions to type.

Before you hit record:

```bash
# 1. the ML service, in its own terminal
python ml/tasks.py serve

# 2. data fresh to within two sessions of today (see task 4)
python ml/tasks.py refresh

# 3. the app, in a third terminal
npm run dev

# 4. everything green
npm run preflight
```

Then rehearse once with `LLM_CACHE=on` so the second run replays from the response cache
and nothing stalls on camera.

**One thing to check on the day:** the signals board may show all 18 names abstaining.
That is the honest output of a frozen threshold with ~10% coverage and it is the *best*
version of this demo — lean into it, it is the whole thesis. If you would rather show a
day with live calls, pick an earlier date on the evidence page and talk through what the
model said then and what happened next.

---

## 3. Activate CI — 2 minutes, in a standalone terminal

**Status:** parked at [`ci/test.yml`](./ci/test.yml). The `gh` token on this machine has
`gist`, `read:org` and `repo` but **not** `workflow`, so it cannot create a file under
`.github/workflows/`.

Run this **in a normal terminal, not inside Claude Code** — the device-code flow gets
backgrounded at the tool timeout and the code expires before you can use it:

```bash
gh auth refresh -h github.com -s workflow
git mv ci/test.yml .github/workflows/test.yml
git commit -m "Activate CI"
git push
```

---

## 4. Refresh the data before submitting — 15 minutes, unattended

**Status:** data currently runs to **2026-11-11**, one session behind. The submission
checklist wants it within two sessions, so re-run this on the day:

```bash
python ml/tasks.py data      # re-ingest and rebuild the panel
python ml/tasks.py signals   # rescore today's calls from the frozen model
```

**Do not run `train` or `eval` again.** The model, the calibrator and the abstention
threshold are frozen (§6.5) and the final holdout has been read exactly once
(`ml/artifacts/holdout_ledger.json` records it). Re-running `eval` would read the holdout
a second time and the headline would stop being out-of-sample. `data` and `signals` are
safe: they refresh the inputs and rescore with the existing model.

If `make data` fails with empty responses, Yahoo is rate-limiting you. Wait ten minutes
and re-run — the per-symbol cache in `ml/data/raw/` means the tickers that already
succeeded are not re-fetched. The committed `ml/data/processed/panel.parquet` is
unaffected and the app keeps working from it.

---

## 5. Make the repo public at submission — 1 minute

**Status:** the repo is local-only. No remote is configured, deliberately: §4.8 forbids
any remote pointing at `iAnmolAgarwal/pathwise`,
`rgarg-lab/hackathon-template` or `rgarg-lab/ps-agentic-hackathon-14nov`, and creating a
new remote is an outward-facing action that is yours to take.

```bash
gh repo create rgarg-lab/arthaton-nse-copilot --private --source=. --remote=origin --push
git remote -v    # confirm it points only at arthaton-nse-copilot
```

Then at submission time:

```bash
gh repo edit rgarg-lab/arthaton-nse-copilot --visibility public --accept-visibility-change-consequences
```

---

## 6. Deploy — optional, and *not* required for the score

**Status:** deliberately not attempted. §4.1 makes this build localhost-only and §9 says
to score deploy-readiness rather than a live URL. The production build is verified
(`npm run build` passes) and this is the complete runbook.

Read this before deciding: **the ML service does not deploy to Vercel.** It is a
long-running Python process that loads a LightGBM model and a 50k-row parquet file at
startup, which is the opposite of what a serverless function is for. A real deployment is
two services.

### 6a. The database — PGlite will not work in production

PGlite is per-process. On serverless that means every invocation gets its own empty
database.

1. <https://neon.tech> → create a **new** project (do not reuse any other project's
   database).
2. Copy the pooled connection string into the Vercel project as `DATABASE_URL`.
3. Migrate:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

### 6b. The Next.js app → Vercel

```bash
npm i -g vercel
vercel link
vercel env add GEMINI_API_KEY production
vercel env add DATABASE_URL production
vercel env add CRON_SECRET production          # openssl rand -base64 32
vercel env add NEXT_PUBLIC_SITE_URL production # https://your-app.vercel.app
vercel env add ML_ENDPOINT production          # see 6c
vercel --prod
```

`CRON_SECRET` is not optional on a public deployment: without it anyone can trigger
`/api/cron` and push queued deliveries.

### 6c. The ML service → a container host

Fly.io, Railway and Render all work. The service needs ~1 GB of memory for LightGBM plus
the panel, and the artifacts are committed so there is nothing to fetch at boot.

```bash
# Dockerfile is not committed — this build is localhost-only. Minimal version:
#   FROM python:3.12-slim
#   WORKDIR /app
#   COPY ml/ ./ml/
#   RUN pip install --no-cache-dir -e ./ml
#   ENV COPILOT_CORS_ORIGINS=https://your-app.vercel.app
#   CMD ["python", "-m", "uvicorn", "copilot.api:app", \
#        "--app-dir", "ml/src", "--host", "0.0.0.0", "--port", "8000"]
```

Then set `ML_ENDPOINT` in Vercel to that host's URL, and
`COPILOT_CORS_ORIGINS` on the ML service to the Vercel domain. **Do not skip the CORS
variable** — it defaults to `localhost:3000`, and the browser will block every call from
the deployed app with no error in the server logs to explain it.

Verify:

```bash
curl https://your-ml-host/health     # status ok, trains_on_request false
```

### 6d. If you deploy, re-check these

- `/signals`, `/dashboard` and `/evidence` show figures rather than the error state.
- `npm run preflight` against the deployed env reports the ML service reachable.
- The disclaimer is visible on all three.

---

## 7. Optional: install GNU make

**Status:** not needed. `make` is absent on this Windows machine, so `ml/tasks.py` is the
canonical task runner and `ml/Makefile` is a thin wrapper that delegates to it. Every
command in this repo's docs is given in the `python ml/tasks.py <target>` form, which works
everywhere.

If you want `make -C ml <target>` to work locally:

```powershell
winget install GnuWin32.Make
# then restart the terminal
make -C ml help
```

---

## What is NOT on this list, and why

- **No other API keys.** One LLM provider (§4.1). yfinance and FinBERT need none.
- **No embedding key.** Deterministic local embeddings; memory and retrieval work without
  one. Adding Voyage or OpenAI is forbidden by §4.1.
- **No Tavily key.** `web_search` is deliberately not in `agent.enabledTools`: with no key
  it returns results labelled MOCK, and a mock search result inside a financial answer is
  a risk with no upside.
- **No connector tokens.** With none set, approvals land in the local outbox, which is the
  full queue → approve → delivered journey the demo shows.
- **No auth setup.** The app runs signed out on purpose; a demo should not open with a
  login wall.
