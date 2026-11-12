# Working in this repo

This is a domain-agnostic starter for one-day agentic AI hackathons. On the day, the
problem statement arrives at 12:30 and there are roughly ten hours. These rules exist to
keep that from turning into debugging.

## The UI is finished — do not redesign it

The shell is inherited from a project where it scored well, and it is kept deliberately:
landing page, workspace rail and tabs, chat panel, path view, skill graph, dashboard,
design tokens, CSS modules, motion. **Changing its layout is almost never the right call on
hackathon day.** You will not beat it in ten hours, and a judge cannot tell a rebuilt
layout from the original anyway.

What you change instead:

- **copy and labels** → `idea.config.ts` (read on the client through `src/lib/config/client.ts`)
- **what the screens render** → `src/data/demo-seed.ts`, the single data file
- **new capability** → a tool in `src/lib/tools/`
- **the day's showcase** → `WowSlot`, which is an empty styled frame on purpose

Additions go alongside, not through. The trace panel and the approvals tray are a fifth
workspace tab for exactly this reason: the original four are untouched.

## The shape of a change

**Idea text lives in exactly one place: `idea.config.ts`.** Name, tagline, problem,
landing copy, system prompt, enabled tools, sample questions, must-builds, the wow
caption. If you are about to hard-code a user-facing string anywhere else, it belongs in
the config instead. The landing page, page metadata and the theme colours all read from it.

**New behaviour means a new tool, not a new branch in the loop.** Add a file to
`src/lib/tools/`, export it, register it in `src/lib/tools/index.ts`, and add its name to
`agent.enabledTools`. The agent loop itself should not need to change for an idea.
`/add-tool` does all four steps.

Every tool:

- has one zod `inputSchema` — it validates the model's input *and* generates the JSON
  Schema the model is shown, so the two cannot drift
- has a description written for the model: when to use it, not how it works
- returns JSON-serialisable data
- handles its own errors and returns them rather than throwing where a degraded answer is
  still useful
- gets a unit test in mock mode

## Non-negotiables

**Correctness is computed, never generated.** Dates, money, scores, comparisons and
rules go through `calculate` or plain TypeScript. A model that is right 95% of the time
about arithmetic is a liability, because the 5% looks identical. If you catch the model
doing maths in prose, that is a bug.

**External actions always go through approvals.** Tools cannot reach a connector; they
write a `pending_actions` row and return its id. `src/lib/approvals` is the only path to
`connector.push()`, and `src/lib/rules` enforces the same invariant independently. Do not
add a second path, however convenient.

**Never say an action is done before it is approved.** The queuing tools return a
`tellTheUser` field for exactly this reason.

**The demo must survive everything being down.** Mock providers, a fallback chain, a
response cache, a seed file and an embedded database are all there so that a dead API key
at 4pm is an inconvenience rather than a disaster. Keep it that way: anything new must
work, or degrade visibly, with no keys set.

**Every async path gets a loading and an error state.** `EmptyState`, `LoadingRows` and
`ErrorState` in `src/components/common/` exist so this is a one-liner. No dead buttons,
no blank panels.

## Before you say something works

```
npm run build        # types are checked here too
npm run lint
npm test             # 125+ tests, all in mock mode, no keys needed
npm run demo-check   # preflight + evals + the browser smoke test
```

The smoke test is the one that matters: it walks landing → session → ask → trace → approve
→ outbox through the restored UI. If that passes with no keys, the demo path is intact.

Two things about it worth knowing before you edit it: it selects by href, role and testid
rather than by copy, because every string is config-driven and matching on wording breaks
the moment the idea changes; and it creates its own session, because sessions carry a tool
budget and reusing one eventually exhausts it, after which every turn silently takes the
fallback path.

## Keep the log

Append to `BUILD_LOG.md` after each meaningful change: timestamp, what changed, and
whether the decision was yours or the code was generated. The README has a "what I built
vs what AI generated" section that has to be honest, and reconstructing it at 10pm from
memory does not work.

## Things that will bite you

- **A stale `.next` breaks `next dev`:** if every route handler starts returning 404 after
  you have run `npm run build`, delete `.next` and restart.
- **A killed build leaves a lock:** "Another next build process is already running" with
  no process behind it means `rm -rf .next`.
- **The database handle must stay on `globalThis`** (`src/db/index.ts`). Next instantiates
  that module more than once per process, and a module-level cache silently gives you two
  embedded databases that never see each other's writes. There is a regression test.
- **PGlite is per-process.** Perfect locally, wrong for serverless. Set `DATABASE_URL` to
  Neon before deploying.
- **Never write the demo user's id to a `user_id` column.** With auth unconfigured the app
  hands out a fixed anonymous identity that has no row in `users`, so a foreign key rejects
  it — and the failure surfaces inside the assistant's own answer, which is a confusing
  place to debug. Go through `persistableUserId()` in `src/auth.ts`.
- **The rotating suggestion sits over the chat composer** and is itself a button. That is
  the original design; it means a programmatic click on the textarea is intercepted.

## Layout

The build prompt (`HACKATHON_TEMPLATE_PROMPT.md` §4) puts `lib/` and `components/` at the
repo root. This codebase keeps the inherited convention instead: `src/lib/`,
`src/components/`, with the `@/` alias, and `app/` at the root. Same structure, one level
down.
