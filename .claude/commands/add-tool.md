---
description: Create, register and unit-test a new agent tool
---

$ARGUMENTS - expected as `<name> <what it is for>`.

1. **Check it does not already exist.** Read `src/lib/tools/index.ts`. Fourteen generic
   tools ship with the template; if one already covers this, say so and stop rather than
   adding a near-duplicate.

2. **Create `src/lib/tools/<name>.ts`** following the shape of an existing tool:
   - one zod `inputSchema`, with `.describe()` on every field - the model reads those
   - a `description` written for the model: when to reach for it, not how it works
   - `external: true` if it touches the outside world, in which case it must queue a
     `pending_actions` row via the pattern in `actions.ts` and must not call a connector
   - correctness computed in code, never asked of the model
   - errors returned rather than thrown where a degraded answer is still useful

3. **Register it**: add to `ALL_TOOLS` in `src/lib/tools/index.ts`, and add its name to
   `agent.enabledTools` in `idea.config.ts`.

4. **Test it**: `tests/tools.<name>.test.ts`, running in mock mode with no keys. Cover the
   happy path, a malformed input, and the failure mode. If it does arithmetic or dates, test
   the edge cases (month ends, negatives, zero).

5. **Verify**: `npm test && npm run build && npm run lint`, then one agent run that actually
   calls it.

6. Append to `BUILD_LOG.md`.
