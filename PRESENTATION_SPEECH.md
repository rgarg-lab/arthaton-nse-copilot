# Presentation speech — 3 min 45 s – 4 min, live walkthrough

One person's story, start to finish. Plain language. Every number on screen comes from
`ml/artifacts/`, so what you say and what the judge sees always agree.

**Meet Arjun** — salaried, about ₹3 lakh across seven large-caps, checks on weekends, and
has exactly one question: *should I do something today, or wait?* He is the user in
`MODEL_CARD.md` §1. Keep him on stage the whole time.

**Before you start:** both services up (`python ml/tasks.py serve` and `npm start`), tabs
open in this order — `/` · `/signals` · `/evidence` · `/dashboard` · `/workspace`.

**564 spoken words.** At 150 wpm that's 3:46; at a slower 140, 4:02. Rehearse once with a
timer — if you run long, the two lines to drop are the calibration sentence in §5 and the
last line of §4. Timings below are cumulative at 150 wpm.

---

## 1 · The problem — on `/` (landing)

**0:00 – 0:30**

> "This is Arjun. Three lakh rupees, seven large-cap stocks. Every weekend, the same
> question — *should I act today, or wait?*
>
> So he opens a stock app. And every one of them gives him an answer. A target price. A
> BUY badge. A confidence score. Every single day — whether or not anything about tomorrow
> is actually knowable.
>
> That's the problem. Not that they're sometimes wrong. That they're never *unsure*."

**Show:** the landing page. Scroll slowly to the measured strip so the figures sit behind
you. Don't stop to read them — you come back to them later.

---

## 2 · What he actually gets — on `/signals`

**0:30 – 1:15**

> "This is Arjun's board. Seventeen large-caps, scored by a model that is frozen — it
> can't be retrained to flatter itself.
>
> What Arjun needs isn't 'will Reliance go up'. Nobody reliably knows that. He needs to
> know *is today a big day or a quiet day* — that's what decides whether he acts now or
> waits.
>
> And that, this answers well. **Sixty point two percent**, on the sessions it chooses to
> call — median across four out-of-sample windows, above sixty in three of them. A coin
> flip is forty-nine point seven. And it speaks on nearly half of all sessions.
>
> Today it's calling nine of seventeen."

**Show:** `/signals`. Point at the **MOVE SIZE · 60.20%** tile, then **MOVE-SIZE CALLS ·
9 of 17**. Then scroll into the basket table.

> *(The caption under that tile reads "on the 42%–50% of sessions it calls · median of 4
> out-of-sample windows". Let the judge read it — it's your credibility.)*

---

## 3 · The moment that matters — the abstention card

**1:15 – 1:50**

> "Here's the part no other entry will show you.
>
> Arjun opens a name hoping for a direction. And the product says: *I don't know.*
>
> Look at why. Conviction fifty-one point eight. The gate is sixty. Below that it refuses
> — and that line was locked before the final test data was ever opened, so I couldn't move
> it to make this board look busier.
>
> This isn't a weak buy or an error. When it abstains, the API doesn't even send a
> direction field — there's nothing to render. For Arjun that's the most valuable answer
> there is. It stops him trading on noise."

**Show:** open one abstention card. Point at the conviction number, the `gate 60%` chip,
then the stated reason. Hold here — your longest pause.

---

## 4 · Why he should believe it — on `/evidence`

**1:50 – 2:20**

> "Fair question from Arjun: why trust a percentage?
>
> So it shows its work. These are the twenty-five past trading days whose conditions most
> resemble today — real dates, and the real return that followed each. He can look them up
> himself.
>
> Fifty-six percent went up next session. That sits *beside* the model's number, never
> instead of it. He isn't asked to trust a black box — he's handed the evidence."

**Show:** `/evidence`. Point at two real dates and the return beside each, then at the
**WENT UP NEXT SESSION · 56.0%** tile.

---

## 5 · The proof — on `/dashboard`

**2:20 – 3:05**

> "This is the model card. Every figure read from one committed file.
>
> When this model has real conviction, it's right **sixty-three percent** of the time.
> Raise the bar — **sixty-six**, then **seventy-one**. It just speaks less often. That's
> the honest trade, drawn right here.
>
> Two things make that mean something. This curve — when it says sixty-two percent, about
> sixty-two percent happen. And the baselines: always guessing 'up' gets forty-nine. So the
> edge is measured, not claimed.
>
> And this line — the same gate on fresh data gives fifty-five, not sixty-three. That gap
> is on screen too, because a tool that hides it is what Arjun should fear."

**Show:** `/dashboard`, in order — the **conviction-tier ladder** (63 → 66 → 71), the
**calibration curve**, the **baselines table**. Finish on validation vs holdout side by side.

---

## 6 · He just asks it — on `/workspace`

**3:05 – 3:30**

> "Last thing. Arjun doesn't want charts. He types what he'd actually ask — *should I buy
> Reliance before tomorrow's open?*
>
> Watch the trace underneath. It isn't guessing in prose — it's calling the model, pulling
> its own track record, fetching those historical days. Every sentence gets checked by a
> rules layer before he sees it."

**Show:** `/workspace`. Type the question live, then point at the trace panel filling with
tool calls as the answer streams.

---

## 7 · Close

**3:30 – 3:40**

> "Sixty percent on the question Arjun actually asks. Sixty-three when it has conviction.
> Evidence he can check himself. And the discipline to say nothing on the days it doesn't
> know.
>
> Paper trading and historical analysis only. Not investment advice. Thank you."

**Show:** back to `/`, disclaimer strip visible.

---

## The numbers you are allowed to say, and how

Say the qualifier. Two seconds, and it's what separates you from the other nine stock
predictors in the room.

| Say this | Always attach | Source |
|---|---|---|
| **60.20%** | "on the sessions it calls · four out-of-sample windows" | move-size head, `magnitude_metrics.json` |
| **63.06%** | "when conviction clears its gate" | direction at gate 0.60, validation |
| **66.02% / 71.43%** | "at a higher bar — it speaks less often" | gates 0.65 / 0.70, validation |
| **56.0%** | "among 25 similar past days — small sample" | `/evidence`, live |
| **3.07%** | "calibration error" | ECE, `metrics.json` |
| **49.7% / 48.9%** | "the coin-flip baseline" | base rate; always-up |
| **55.50%** | "same gate, fresh data — the honest gap" | holdout comparison |

### Two questions to handle, not dodge

**"Isn't 51% just a coin flip?"** — It is, and that's why it isn't my headline. Next-day
*direction* on large caps is close to random; above 60% there is usually a leak, and I
published twenty-nine configurations that failed to beat it. So the product answers the
question that *is* answerable — how big the move will be, at 60.20% — and refuses the one
that isn't.

**"Why does the board show zero direction calls today?"** — Because the gate is frozen and
nothing cleared it. That's the product working, not failing. Move size still calls nine.

### One thing to avoid

Never say "sixty percent accurate" on its own. Someone will ask "at what?", and your answer
decides whether they believe the rest. **"Sixty percent on the sessions it calls"** — five
extra words, airtight.
