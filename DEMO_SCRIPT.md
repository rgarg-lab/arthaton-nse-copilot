# Demo script — 3 minutes

> Rehearse twice with the response cache on (`LLM_CACHE=on`). The second run is near
> instant because answers replay from cache, which is what makes a recording tight.
> Record in mock or cached mode if a provider has been flaky: the code path is identical
> and the demo banner is honest about it.

**Before recording**

- [ ] `npm run demo-check` — all green
- [ ] `/preflight` — no failures
- [ ] **Load demo** pressed, so memory and the outbox are not empty
- [ ] The run rehearsed once, so the cache is warm
- [ ] Browser at 1440×900, zoom 100%, notifications off, one clean tab
- [ ] Cursor movements slow and deliberate — fast cursors are unreadable on video

---

## 0:00–0:20 · The problem

**On screen:** the landing hero.

**Say:** <Two sentences naming the person and what this costs them today. No product name
yet, no features — the problem has to land before anything else matters.>

> Open on the problem, not the stack. A judge who does not understand the problem by 0:20
> has stopped listening to the rest.

## 0:20–0:50 · The partner tool

**On screen:** <the partner tool in use — the actual tool, not a screenshot of it.>

**Say:** <What it is doing and why it is the right tool for this step. Thirty seconds is
enough to show it genuinely in the loop rather than name-dropped.>

## 0:50–2:10 · The live demo, including the wow moment

**On screen:** the workspace.

1. **<0:50>** Paste or dictate the input. If dictating, let the raw-vs-cleaned diff show —
   it proves the input was handled rather than assumed.
2. **<1:05>** Send. Narrate the trace as it fills: *"it is choosing tools — that is a real
   tool call, those are the arguments, that is what came back."*
3. **<1:25>** Point at a confidence badge. *"It checked its own claim and scored it. Below
   the threshold it refuses to state it as fact."*
4. **<1:40>** **The wow moment.** <What happens, and the one sentence that frames it.>
5. **<1:55>** The approval tray. *"It wants to <action>. It has not done it."* Hold to
   approve. Show the outbox entry.

> The approval beat is worth the fifteen seconds. "The agent cannot act alone" is a claim;
> watching it wait is proof.

## 2:10–2:40 · Architecture and the trace

**On screen:** the trace panel expanded, then the README diagram.

**Say:** <One sentence on the loop. One on what the model decides versus what code
computes. One on the rules layer overriding the model.>

## 2:40–3:00 · Impact and accuracy

**On screen:** the dashboard, or the eval output.

**Say:** <The measured number, with its mode stated. What it would change for the person
from 0:00. One honest limit.>

---

## If something breaks mid-recording

| Symptom | Do this |
|---|---|
| A model call hangs | Keep talking; the fallback chain moves on by itself |
| Every provider is down | Nothing to do — it answers from the mock and the banner says so |
| The database is unreachable | `/preflight` names it; the agent still runs without persistence |
| A page looks empty | Press **Load demo** again |
| The trace is empty | Check `/preflight`; the stream is SSE, so a proxy may be buffering |

Do not restart the recording for a visible fallback. The template was built so that
degrading gracefully *is* the demo — narrate it and move on.
