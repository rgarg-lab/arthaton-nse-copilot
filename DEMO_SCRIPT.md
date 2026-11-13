# Demo script — 3 minutes

The single idea to land: **every other stock tool in this competition always has an answer.
This one tells you when it doesn't, and backs the refusal with numbers.**

Do not try to show everything. Three beats, in this order, and the second one is the demo.

---

## Before you record

```bash
# terminal 1 — the model service
python ml/tasks.py serve

# terminal 2 — data fresh to within two sessions, then restart terminal 1
python ml/tasks.py data && python ml/tasks.py signals

# terminal 3 — the app. BUILD, don't `npm run dev`.
npm run build && npm start

# terminal 4 — everything green
npm run preflight
```

**`npm start`, not `npm run dev`, and only one Next server at a time.** On the production
build every page is under 550ms. In dev the landing's card deck and canvas strip recompile
on first hit and the first paint is 20–30 seconds; with a second Next server also running,
every page goes to 15–40 seconds. Both of those look like a broken app on camera and
neither is one.

- `npm run preflight` must say **ready**, with "ML service  ok" and
  "no training on request  ok".
- Rehearse once with `LLM_CACHE=on` so the second run replays from the response cache and
  nothing stalls on camera.
- Tabs open, in order: `/` · `/signals` · `/workspace` · `/dashboard` · `/evidence`.
- Close the terminal windows in the recording. Nobody needs to watch uvicorn log.

---

## 0:00–0:25 — the problem, on the landing page

**Screen:** `/`

> "Every retail equity tool in India is built to always have an answer. Open any of them
> and there's a number — a target price, a BUY badge, a confidence score — whether or not
> anything is actually knowable about tomorrow."

Scroll to the measured strip.

> "Next-session direction on NSE large-caps is close to a coin flip. My model gets 51.4% on
> a holdout it never saw. That's the honest number, and these four figures are read from a
> committed evaluation artifact — there is not one statistic hardcoded in this page."

**Don't linger.** The landing is context, not the demo.

---

## 0:25–1:40 — the wow moment: it refuses

**Screen:** `/signals`

> "Here's today's board. Eighteen NSE large-caps."

Point at the two tiles: calls today, abstentions.

> "The model is declining most of these. It only emits a signal when its calibrated
> conviction clears 60%, and that threshold was chosen on validation data and then frozen
> before the final holdout was ever read — so I can't tune it to make this board look
> busier."

Open one abstention card.

> "This isn't a weak buy. There is no direction here at all — the API doesn't even send the
> field when it abstains, so the UI has nothing to render. 'I don't know' is a first-class
> answer."

**Screen:** `/workspace`. Type:

```
Should I buy Reliance before tomorrow's open?
```

Let the trace fill. Point at it while it runs.

> "Watch the trace. It's not reasoning about the price — it's calling the model service for
> a calibrated probability, then pulling its own measured track record, then fetching the
> closest historical sessions."

When the answer lands:

> "It declined. And look at *why* it declined: it's quoting its own accuracy in today's
> volatility regime and the split among the most similar past sessions. Those are measured
> numbers from a committed artifact, not an LLM being cautious at me."

**If the model gets confident anyway**, say so — the rules layer annotates it and the
annotation is visible. That is a better moment than a clean run:

> "And there's the guardrail firing. The rules layer runs independently of the prompt; it
> caught a directional claim that wasn't backed by a model call and said so."

---

## 1:40–2:30 — why you should believe any of it

**Screen:** `/dashboard`

> "This is the model card, and every figure on it is read from one JSON artifact."

**The baselines table.** This is the slide that matters to a finance judge.

> "51.4% means nothing on its own. So: always predicting up gets 48.9%. Naive momentum gets
> 48.5%. A three-feature logistic regression on the identical split gets 48.6%. The edge is
> two and a half points, it's real, and it's small."

**The calibration curve.**

> "This is why I'm allowed to call it a probability at all. Isotonic regression fit on
> out-of-fold predictions — of the sessions where it said 62%, about 62% went up. Expected
> calibration error is 3%."

**The coverage curve.**

> "And this is what abstention buys. Declining 90% of sessions takes accuracy from 51.4% to
> 55.5%. The marked line is the frozen threshold — not the point that maximises accuracy,
> which would be the far right at near-zero coverage."

**Scroll to R².** Say this out loud; do not skip it.

> "R-squared on return magnitude is minus 0.001. Approximately zero. The model cannot
> predict how *big* a move is, and that's the correct result for this horizon — it's exactly
> why the product acts on calibrated direction with abstention instead of a price target."

If there is time, the per-regime table:

> "I expected the model to be worst in high-volatility sessions. It's the best there, and
> the middle tercile is the weakest. I had written the opposite into a comment before I read
> the table, and corrected it. That's in the README."

---

## 2:30–3:00 — the evidence layer, and close

**Screen:** `/evidence`

> "Last thing. A probability is a claim you either accept or you don't. These are the actual
> past sessions whose market state most resembles today's — real dates, and the real return
> that followed each one."

Point at two dates.

> "11 March 2019. 4 August 2021. You can go and look them up. The up-rate among them is
> evidence shown *beside* the model's probability, never instead of it — twenty-five
> analogues is a small sample from a non-stationary process and the payload says so."

**Close:**

> "Purged walk-forward validation with a five-session embargo. A final holdout read exactly
> once, with a committed ledger so you can check that claim. Four baselines. A calibrated
> probability. An explicit refusal when it doesn't know. And a test that fails the build if
> anyone hardcodes a statistic into the UI.
>
> It's right 51% of the time. I'd rather tell you that than show you a 58% I invented."

---

## Questions you will get

**"Only 51%? That's barely better than a coin flip."**
> Correct, and that's the point. Pooled next-session direction on large caps lives in the
> low-to-mid fifties — anything above 60 is a leak. The usable product isn't the headline,
> it's the 55.5% on the 10% of sessions where it has conviction, plus knowing which 10%
> those are.

**"Why not just use a bigger model / more features / deep learning?"**
> The selected model is the *most* regularised of three candidates, chosen by fold log loss.
> Capacity isn't the constraint — signal-to-noise is. 58 features is a ceiling I set
> deliberately, against the 300-column version of this that I built last time and that
> partitioned on absolute rupee prices.

**"Could you have overfit the threshold?"**
> It's chosen on the walk-forward folds and frozen into `model.pkl` before the holdout is
> read. `ml/artifacts/holdout_ledger.json` records every read of the holdout, and the test
> suite fails if there is more than one authoritative read.

**"Is this backtest tradeable?"**
> The paper-trading table charges 7, 13 and 25 bps and reports all three, and the realistic
> case beats buy-and-hold. But the universe is today's large-caps, so survivorship bias
> inflates it, and the short leg assumes borrow a retail account may not get. The measured
> claim is the directional edge; that table is an illustration under stated assumptions.

**"How much of this did the AI write?"**
> Most of the code. The judgement was mine: pooling across tickers, abstention as the
> product, calibrating out-of-fold, freezing before the holdout, reporting the near-zero
> R², and deleting three good-looking landing sections because their numbers came from a
> random seed. The README has a section on exactly this, and `BUILD_LOG.md` marks each
> decision as mine, specified, or generated.

**"What breaks if the ML service goes down mid-demo?"**
> Every model-backed panel shows an error naming the missing service, and the assistant says
> it cannot give a signal. Nothing falls back to an estimate. I can show you — kill terminal
> one and reload.

*(That last one is a genuinely good demo if you have the time. The honest failure mode is
part of the pitch.)*
