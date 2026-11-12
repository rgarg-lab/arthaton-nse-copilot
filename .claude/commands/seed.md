---
description: Generate realistic demo data and eval cases for the current idea
---

$ARGUMENTS

1. Read `idea.config.ts` - the seed has to serve *this* idea's demo.

2. Rewrite `seed/<demoSeed>.json`:
   - memory items the agent will actually retrieve during the scripted demo
   - one or two documents whose chunks answer a sample question
   - an outbox entry, so that page is not empty on first load
   - realistic names, amounts and dates; nothing that reads as placeholder on camera

3. Rewrite `evals/cases/<suite>.json` with 5-10 cases. Prefer `contains` and `regex`
   scorers - they are deterministic and free. Use `judge` only where the check is genuinely
   semantic, and remember it is not a real judgement in mock mode.

4. Verify: `npm run seed && npm run eval`, then open `/memory` and `/outbox` and confirm they
   look lived-in rather than seeded.
