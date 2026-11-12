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
