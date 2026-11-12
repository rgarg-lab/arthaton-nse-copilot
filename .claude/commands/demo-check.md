---
description: Run preflight, evals and the smoke test, then list anything broken
---

1. Run `npm run demo-check` (preflight, then evals, then the browser smoke test).

2. If anything fails, report it as: what failed, the one-line cause, and the fix. Do not fix
   anything yet - the user decides what is worth the time.

3. Then walk the demo path yourself and confirm each step:
   - landing loads and the copy is the idea's, not the template's
   - "Load demo" fills memory and the outbox
   - a sample question produces at least two tool calls in the trace
   - an external action appears in the approval tray with a sensible preview
   - approving it lands it in the outbox
   - `/preflight` shows no failures

4. Report the `LLM_MODE`, the database driver, and whether the response cache is warm -
   those three decide whether the demo will be fast and reproducible.
