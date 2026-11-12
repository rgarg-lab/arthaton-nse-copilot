---
description: Implement a connector behind the Connector interface
---

Service: $ARGUMENTS

1. Read `src/lib/integrations/index.ts`. Follow the existing connectors exactly:
   `{ id, name, requires, isConfigured(), push(action) }`.

2. Implement `push` over `fetch` - no SDK dependency for a slot most ideas never fill.
   Return `{ ok, ref?, detail? }`. Never throw: a failed delivery must leave the outbox row
   intact and retryable, which is why `approve` writes it before calling you.

3. `isConfigured()` returns true only when every env var in `requires` is present. Add those
   vars to `.env.example`, commented, under "Connectors".

4. Add it to `CONNECTORS`. If this service should be the default for a kind of action,
   update `connectorFor()` in `src/lib/tools/actions.ts`.

5. Test with no keys set: `resolveConnector("<id>")` must fall back to the mock and report
   `fellBack: true`. Then `/preflight` must list it as a warning with the fix.

6. Screenshot the service's UI showing the delivered item into `docs/partner-proof/` - that
   screenshot is the partner-tool evidence.
