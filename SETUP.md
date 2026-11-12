# Setup

Everything you need to configure, in the order it matters. Nothing here is required to
*run* the template — it works with an empty environment — so treat this as a list of
things you can switch on, not a checklist blocking you.

Check what is actually live at any point: open `/preflight`, or run `npm run preflight`.

---

## 1. Nothing at all

```bash
npm install
npm run dev
```

This genuinely works. With no `.env.local`:

- the database is **PGlite** — Postgres compiled to WASM, with pgvector — in `./.pglite`,
  and it migrates itself on first connect
- the model provider is the **mock**, which reads your prompts, picks tools, calls them
  and writes an answer deterministically
- embeddings are deterministic local vectors, so memory search works
- connectors fall back to the local outbox

Open <http://localhost:3000>, follow the CTA into the workspace, and ask the assistant
something. Verified on a clean clone: three commands, no configuration, a full agent run
with six tool calls, a rule firing and an approval queued.

---

## 2. One thing that needs you (GitHub CI)

The CI workflow is parked at **`ci/test.yml`**, not `.github/workflows/test.yml`.

GitHub rejects a push from an OAuth token without the `workflow` scope when the push
creates or updates anything under `.github/workflows/`, and the `gh` token used to create
this repo does not have it. To activate CI:

```bash
gh auth refresh -h github.com -s workflow     # run in a standalone terminal, not inside Claude Code
mkdir -p .github/workflows
git mv ci/test.yml .github/workflows/test.yml
git commit -m "ci: activate the test workflow"
git push
```

Run the refresh in a **normal terminal window**. Inside Claude Code it gets backgrounded at
the tool timeout and the device code expires before you can redeem it.

---

## 3. A real model (optional)

Add any one key to `.env.local` and `LLM_MODE` becomes `live` automatically:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The chain is `LLM_PRIMARY` then `LLM_FALLBACKS`, both comma-separated model ids, with the
mock as the floor. Defaults are `claude-sonnet-5` then
`claude-haiku-4-5-20251001,gemini-2.5-flash,llama-3.3-70b-versatile` — so adding a Gemini
or Groq key gives you a cross-vendor fallback for free.

`LLM_MODE` can be forced to `mock`, `cached` or `live`. Keep `LLM_CACHE=on`: rehearse the
demo once and the second run replays instantly from the database.

**Point the chain at the key you actually have.** The default primary is Anthropic, so with
only a Gemini key every turn burns two skipped links before it reaches a configured
provider. One line fixes it:

```
LLM_PRIMARY=gemini-2.5-flash
LLM_FALLBACKS=gemini-flash-latest
```

Model ids go stale faster than anything else here — `gemini-2.0-flash` is already retired
and answers `404 … no longer available`. `/preflight` prints the resolved chain; if a model
id in it 404s, that is why, and the fix is the two lines above.

---

## 4. A real database (needed to deploy)

```
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

Then: `npm run db:migrate`.

**You must do this before deploying.** PGlite lives inside one process, which is fine for
`npm run dev` and wrong for serverless, where each function invocation is its own world.
Neon is what the template is built for — the app detects a `*.neon.tech` host and routes
through the connection pooler automatically, while migrations use the direct URL.

pgvector is created by the migration (`create extension if not exists vector`), which Neon
permits.

---

## 5. Deploy to Vercel

```bash
vercel
```

Set in the Vercel project:

| Variable | Why |
|---|---|
| `DATABASE_URL` | required — see above |
| `CRON_SECRET` | without it `/api/cron` is unauthenticated and anyone can trigger deliveries |
| `NEXT_PUBLIC_SITE_URL` | absolute URLs in metadata and the OG image |
| `ANTHROPIC_API_KEY` etc. | optional; the app runs mocked without them |
| `AUTH_URL` + `AUTH_SECRET` | only if you enabled sign-in |

`vercel.json` already registers the hourly cron for `/api/cron`. After the first deploy,
open `/preflight` on the deployed URL — it will tell you what is missing.

> Not verified by me: the deployed URL. Deploying needs your Vercel account, so §5 is
> written from the configuration rather than from a completed deploy. Everything in §1–§4
> was run and checked.

---

## 6. Optional services

All off by default, each enabled purely by the presence of its keys. Full list with
comments in `.env.example`.

| What | Keys | Effect when unset |
|---|---|---|
| Web search | `TAVILY_API_KEY` | `web_search` returns results clearly labelled MOCK |
| Embeddings | `EMBED_PROVIDER` + `VOYAGE_API_KEY` / `OPENAI_API_KEY` | deterministic local vectors |
| GitHub Issues | `GITHUB_TOKEN`, `GITHUB_REPO` | approvals land in the outbox only |
| Notion | `NOTION_TOKEN`, `NOTION_DATABASE_ID` | as above |
| Email | `RESEND_API_KEY`, `RESEND_FROM` | as above |
| Slack | `SLACK_WEBHOOK_URL` | as above |
| ML endpoint | `ML_ENDPOINT` | `ml_predict` returns a labelled mock prediction |
| Google sign-in | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | app runs signed out |

Sign-in is deliberately optional: a demo should not open with a login wall. With a real
`DATABASE_URL` sessions are stored in Postgres; on the embedded database they are JWTs,
because the Auth.js adapter cannot be constructed asynchronously.

---

## 6b. What is UI and what is data

The split is the whole design, so it is worth stating plainly.

**The UI shell is complete and is meant to stay as it is.** The landing page (hero, skill
stream, arc deck, proof strip, motion wall, beam network, evidence plates, footer), the
workspace with its rail and five tabs, the chat panel and the assistant orb, the path view,
the skill graph with its edge cards and branch overlay, and the dashboard with its charts
and badges — all of it is kept from the project it was built for, down to the design tokens
and the motion. Do not redesign it on the day; you will not beat it in ten hours.

**Everything it renders is a demo seed.** `src/data/demo-seed.ts` is the single data file:
it generates skills, goals, a catalogue, graph edges with per-source support, branches, a
profile, a plan, a dashboard summary and the landing counts — all deterministic from a
seeded PRNG, so a rehearsal and a recording look identical. There is no real dataset behind
any of it, and every figure on screen carries a caveat saying so.

**The backend is the new one.** The chat panel runs the agent loop (tool calls, fallback
chain, response cache, rules, approvals) through `/api/chat`; the dashboard, memory and
outbox read the real database; the extras (trace, approvals tray, preflight, input adapters,
connectors, scheduler) are additions rather than replacements. The original ML-specific
parts are slots: the same UI, fed by a tool or an agent result instead of a pipeline.

So, per hackathon: **`idea.config.ts` + `src/data/demo-seed.ts` + new tools + the docs.**

---

## 7. On the day

```bash
/kickoff        # paste the problem statements and rubric
/new-idea "…"   # rewrite idea.config.ts, the seed and the eval cases
/add-tool …     # one per new capability
/wow …          # the showcase component
/demo-check     # preflight + evals + smoke test
/finalize       # README, diagram, must-builds, accuracy, LinkedIn post
```

Everything idea-specific lives in `idea.config.ts`, `src/data/demo-seed.ts`, `seed/*.json`,
`evals/cases/*.json` and `src/lib/tools/`. If you find yourself editing the agent loop, the
rules engine, the schema or the UI components, stop and check whether the config, the seed
or a new tool would do instead.

---

## Known gotchas

These cost me time during the build. They will cost you less.

**Route handlers suddenly 404 in `next dev`.** A stale `.next` written by `next build`
breaks dev routing. `rm -rf .next` and restart.

**"Another next build process is already running" with no such process.** A killed build
left a lock. `rm -rf .next`.

**The database handle must stay on `globalThis`.** Next instantiates `src/db/index.ts`
more than once per process (server components and route handlers are separate module
graphs). A module-level cache gives you two embedded databases that never see each other's
writes — a route handler inserts a row and the page reading that table renders without it,
permanently, with no error. There is a regression test (`tests/db.singleton.test.ts`);
do not "simplify" it away.

**A Link clicked before hydration does not navigate.** Only bites tests; wait for the page
to settle first.

**A hydration mismatch naming an attribute you never wrote** is a browser extension
editing `<html>` before React loads. `<html>` carries `suppressHydrationWarning` for
exactly that, scoped to the one element, so a genuine mismatch inside the app still
reports. Check in a private window before suspecting the code.

**After a `git pull`, run `npm install`.** The dependency list changes when the UI does,
and the symptom is a 500 on the landing page rather than anything that says "missing
module".

**Playwright runs against a production build**, not `next dev`, deliberately — dev's
first-hit compilation pushed the workspace route past 60s, and it avoids the stale-`.next`
trap entirely.

---

## What is not configured

Honest list of what this template does *not* do for you:

- **No deployment was performed.** §5 is instructions, not a verified deploy.
- **No Lighthouse score.** Accessibility is checked structurally (one `h1` per page, every
  field labelled, every button named, no duplicate ids, decorative layers `aria-hidden`)
  and the landing page is static by default, but no browser audit was run.
- **No video.** `DEMO_SCRIPT.md` has the timings and the narration; the recording is yours.
- **No real-model accuracy number.** Evals pass 6/6 in mock mode, which measures the
  plumbing. Re-run with a key and `LLM_MODE=live` before quoting a number.
- **No partner tool chosen.** `idea.config.ts` says `TBD at kickoff` on purpose.
- **No 3D hero scene.** The hero's scene slot ships no asset — the original's was another
  project's artwork. With `NEXT_PUBLIC_HERO_SCENE_URL` unset nothing is fetched and the
  hero uses its animated orb, the same path it already took for reduced-motion and
  data-saver visitors. To add one: export from Spline, drop it in `public/`, and set that
  variable.
- **Some landing prose is still generic.** The hero headline, subtitle, CTA and the chat
  suggestions read from `idea.config.ts`; the longer explanatory copy in the mid-page
  sections is template filler and should be rewritten for the idea.
