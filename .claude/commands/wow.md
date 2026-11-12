---
description: Build the WowSlot showcase component
---

The moment: $ARGUMENTS

1. Read `idea.config.ts` `wow` and update it to match what you are about to build.

2. Build the component into `src/components/landing/WowSlot.tsx` as the `children` it
   already accepts. The frame, spacing and caption are done; you are filling the stage.

3. Constraints that matter more than the effect:
   - it must render with no API keys and no network - it will be shown in mock mode
   - it must be deterministic: the same input gives the same visual, every rehearsal
   - respect `prefers-reduced-motion`
   - 60fps on a laptop running a screen recorder; no layout thrash
   - works at 390px width

4. One idea, executed cleanly, beats three half-finished effects. If the concept needs a
   library, say what and why before adding it.

5. Verify at desktop and mobile width, then `npm run build && npm run lint`.
