---
description: Rewrite idea.config.ts, landing copy, sample questions and the seed for a new idea
---

The idea, in one line:

$ARGUMENTS

1. **Rewrite `idea.config.ts` completely.** Every field, not just the name:
   - `name`, `tagline`, `problem` (one real paragraph - who has this problem and what it
     costs them), `targetUser` (a specific person, not a segment)
   - `theme` - two hex colours that suit the domain
   - `landing` - hero title and subtitle, 3-4 features that describe *this* idea rather than
     the template's plumbing, 2-5 how-it-works steps, CTA text
   - `agent.systemPrompt` - the behaviour this idea needs, keeping the four standing rules
     (prefer tools, never invent facts, verify before asserting, approvals for anything
     outward-facing)
   - `agent.enabledTools` - only the tools this idea actually uses; a smaller set makes the
     trace more legible and the model more reliable
   - `inputs` - which modes are on, and the accepted file types if `file` is true
   - `sampleQuestions` - 3-4 chips, at least one of which exercises an external tool so the
     approval tray appears in the demo
   - `wow` - the title and description of the memorable moment
   - leave `partnerTool` and `mustBuilds` for `/kickoff` unless the user gave them

2. **Write `seed/<demoSeed>.json`** with realistic demo data: memory items the agent can
   find, one or two documents worth retrieving, an outbox entry so the page is not empty.
   Realistic means plausible names, amounts and dates - not "foo" and "123".

3. **Write `evals/cases/<name>.json`** with 5-10 cases for this idea. Replace the
   placeholder suite rather than adding to it.

4. **Verify**: `npm run build && npm test && npm run seed && npm run eval`.

5. Report what you changed and what still says "TBD".

Do not touch the agent loop, the tools, the rules or the DB schema. If the idea seems to
need a change there, say so and stop.
