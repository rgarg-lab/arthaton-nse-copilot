import type { IdeaConfig } from "@/lib/config/schema";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE ONLY FILE THAT HOLDS USER-FACING COPY.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Landing copy, metadata, the agent's system prompt, which tools are exposed, the sample
 * chips and the must-builds table all read from here. If a string is about to be
 * hard-coded in a component, it belongs in this file instead.
 *
 * One thing is NOT in here and must never be: a number about the model. No accuracy, no
 * Brier score, no probability, no threshold. Those live in `ml/artifacts/metrics.json`,
 * are produced by `ml/src/copilot/evaluate.py`, and reach the UI through the ML service
 * (§4.2). A statistic in this file would be a statistic written by hand, which is the
 * exact pattern that sank the earlier version of this project.
 */
export const idea: IdeaConfig = {
  name: "NSE Copilot",
  tagline: "Calibrated next-session calls on Indian large-caps — and an honest 'no signal today'.",
  problem:
    "Retail equity tools in India are built to always have an answer. Open any of them and " +
    "there is a number: a target price, a BUY badge, a confidence score — generated whether " +
    "or not anything is actually knowable about tomorrow. Next-session direction on NSE " +
    "large-caps is genuinely close to a coin flip, so a tool that is always confident is " +
    "always confident about noise, and the user cannot tell the days it knows something from " +
    "the days it does not. That is the expensive part: not the wrong calls, but the inability " +
    "to distinguish them. NSE Copilot inverts the design. It predicts next-session direction " +
    "for a fixed basket of 18 NSE large-caps, but the product is the decision layer around " +
    "the prediction — a probability calibrated against out-of-sample outcomes, so a stated " +
    "probability is the rate at which those calls actually came in; an explicit refusal to " +
    "call the sessions where conviction does not clear a frozen threshold; the historical " +
    "sessions that most resemble today, with what " +
    "actually happened next, and an assistant that will quote its own measured failure rate " +
    "when you ask whether to trust it.",
  /**
   * One person, with an amount, a cadence and a decision. The earlier version of this field
   * said "a self-directed Indian equity investor who already reads charts" — a segment, not
   * a user, and it left the product with no decision to be judged against.
   */
  targetUser:
    "A salaried investor holding ₹2–5 lakh across 6–8 NSE large-caps, who checks the market " +
    "once or twice a week and wants one thing: is today a day to act, or a day to wait?",

  /**
   * The honest baseline. The model is measured against always-up, previous-day sign and a
   * three-feature logistic regression, and none of those is what the user actually does
   * instead — they act on confident-sounding noise. That is a harder thing to beat than a
   * coin flip and an easier thing to beat than it sounds, and naming it is the difference
   * between a benchmark and a straw man.
   */
  userToday:
    "Reads a news headline, a broker's BUY badge, or a Telegram tip, then decides on gut " +
    "feel — with no way to tell a day the signal is real from a day it is noise, because " +
    "none of those sources ever says 'nothing is knowable today'.",

  /**
   * Scope, stated as refusals. Each line is a thing the model genuinely cannot do or the
   * product deliberately will not do — not a feature that ran out of time.
   */
  nonGoals: [
    "Not intraday. One horizon only: the next session's close against today's.",
    "Not a tip service. No watchlist of the day, no 'top picks', no ranked conviction table.",
    "Not portfolio optimisation. It says nothing about position size, allocation or hedging.",
    "No execution. Nothing reaches a broker; paper trading and historical analysis only.",
    "Not advice. Not from a SEBI-registered adviser, and it will not tell you what to do.",
    "Not a price target. Direction, and whether tomorrow is bigger or quieter than this " +
      "name's recent normal — never a specific price or a return forecast.",
  ],

  theme: { primary: "#2f7d64", accent: "#d4a23c" },

  assistant: {
    name: "Copilot",
    role: "Copilot · calibrated market analysis",
    invitation: "Ask about today's signals",

    /**
     * The scripted turn in the landing hero. Canned on purpose — the hero renders with no
     * keys, no database and no network.
     *
     * It shows the abstention, because that is the thing a finance judge will not have seen
     * in the other nine stock predictors, and it shows it *without* putting a number in
     * this file: the answer names the behaviour and the live chat produces the figures.
     */
    preview: {
      question: "Should I buy HDFC Bank before tomorrow's open?",
      tools: ["get_signal", "get_model_metrics", "find_similar_days"],
      answer:
        "I'm not giving a direction on HDFCBANK today — conviction is under my threshold. Here's what I measured instead.",
      note: "An abstention, not a hedge",
    },
  },

  contact: {
    email: "rgarg161206@gmail.com",
    team: [],
    credit: "Built by rgarg-lab for Arthaton 2026 · AI for Finance · Trading and market insights",
  },

  landing: {
    heroTitle: "Most stock tools always have an answer. This one tells you when it doesn't.",
    heroSubtitle:
      "Calibrated next-session direction for 18 NSE large-caps, with an explicit abstention when conviction is low, the closest historical sessions as evidence, and a measured track record the assistant will quote against itself.",
    features: [
      {
        title: "A probability that means it",
        description:
          "Isotonic calibration on out-of-fold predictions, so a stated probability is the rate those calls came in at. The curve is on the model card.",
        icon: "target",
      },
      {
        title: "No signal today",
        description:
          "Below a threshold frozen before the holdout was read, the model declines and explains with numbers why.",
        icon: "hand",
      },
      {
        title: "Evidence, not vibes",
        description:
          "The most similar past sessions, with real dates and what actually happened the session after each one.",
        icon: "history",
      },
      {
        title: "Honest about itself",
        description:
          "Four baselines, per-year and per-volatility-regime accuracy, and an R-squared near zero reported as such.",
        icon: "scale",
      },
    ],
    howItWorks: [
      {
        title: "Ask about a name",
        description:
          "The agent calls the model service for a calibrated probability rather than reasoning about the price itself.",
      },
      {
        title: "It checks its own record",
        description:
          "Measured accuracy for this volatility regime, and the closest historical sessions, both pulled from artifacts.",
      },
      {
        title: "You get a call, or a refusal",
        description:
          "Either a direction with a real probability and a disclaimer, or an explicit abstention with the reason.",
      },
    ],
    ctaText: "Open the workspace",
  },

  agent: {
    systemPrompt: [
      "You are Copilot, a decision-support assistant for Indian equity markets. You cover a",
      "fixed basket of NSE large-caps and you have two separate predictions about the next",
      "trading session. You are not a financial adviser and you do not manage money.",
      "",
      "READING THE PAYLOAD — three fields that are easy to misreport",
      "- HOW MANY NAMES: take it from `universe_size` in the response, never from this",
      "  prompt. The basket is 18 names as configured, but the panel does not always carry",
      "  all of them — one is currently unavailable from the data source — and",
      "  `universe_size` is what was actually scored. Saying the model abstained on \"all 18\"",
      "  when it only ever saw 17 is a false statement about coverage. `universe_configured`",
      "  and `universe_missing` are there if the gap itself is worth mentioning.",
      "- WHICH SESSION: `as_of_session` is the last COMPLETED session, and it is the state",
      "  the prediction was made from — not the day being predicted. The prediction is for",
      "  the next trading session after it, which the payload spells out in `predicts`. Never",
      "  present `as_of_session` or `predicts_session_after` as \"tomorrow\": they are dates in",
      "  the past, and the exact next trading date is not computed because it depends on the",
      "  NSE holiday calendar.",
      "- HOW FRESH: `data.sessions_behind` says how far the panel is from today. If it is",
      "  more than zero, say so before giving any figure — a prediction made from stale",
      "  state is still a real prediction, but the user has to know what it was made from.",
      "",
      "YOUR TWO HEADS, AND WHICH ONE IS ACTUALLY GOOD",
      "- `get_signal` gives DIRECTION — up or down. It is close to a coin flip and abstains on",
      "  the large majority of sessions. Treat it as weak, because it is.",
      "- `get_move_size` gives MOVE SIZE — bigger or quieter than this name's recent normal.",
      "  It is the better-measured of the two by a clear margin, and it calls a far larger",
      "  share of sessions.",
      "- Every accuracy figure for either head comes from the tool payload, never from this",
      "  prompt and never from memory. Both tools return their own measured numbers; quote",
      "  those.",
      "- They are independent and must never be merged. 'Bigger than usual' says nothing about",
      "  up or down. Combining them into one directional call invents a claim neither head",
      "  made, and the rules layer will flag it.",
      "- When the user asks whether today is a day to act or wait, call BOTH. Move size often",
      "  has an answer on a name where direction declines, and saying only 'no signal' when",
      "  the magnitude head has a call is leaving the better measurement on the table.",
      "- Quote the move-size accuracy as the median with its range across windows, and say",
      "  what share of sessions it covers. Never quote the best single window on its own.",
      "",
      "ANSWERING \"SHOULD I BUY X\"",
      "- This is the most common question you will be asked and the one this product exists to",
      "  answer. Answer it. Do not refuse it, do not call it financial advice, and do not",
      "  reply by offering to answer it if the user asks differently.",
      "- It is a request for a measurement, not for advice. The answer is what the model says",
      "  about that name: call `get_signal` first, then report either a calibrated probability",
      "  with its direction, or an explicit abstention with `abstain_reason`.",
      "- Always call `get_signal` before answering any question that names one of the",
      "  basket's tickers. An answer about a name with no `get_signal` call behind it is a violation of",
      "  the rule above about where numbers come from, and the rules layer will flag it.",
      "- Declining to answer is not the same as the model abstaining. An abstention is a",
      "  measured result with a reason and a threshold; a refusal is you adding nothing. Only",
      "  the first is ever correct here.",
      "",
      "WHERE NUMBERS COME FROM",
      "- Every number you state about a prediction or about your own accuracy must come from a",
      "  tool call in this conversation. `get_signal` for a probability, `get_model_metrics`",
      "  for your track record, `find_similar_days` for historical evidence.",
      "- You may not estimate, round up, or recall a figure from training data. If a tool did",
      "  not return it, you do not know it. Say so.",
      "- Arithmetic goes through `calculate`, never through prose.",
      "",
      "ABSTENTION IS THE PRODUCT",
      "- When `get_signal` returns `abstain: true` there is no direction field. Do not supply",
      "  one, do not hint at one, and do not read a direction out of `probability_up`.",
      "- Report the abstention as a finding, not an apology or a failure. Give the reason from",
      "  `abstain_reason`, and strengthen it with the volatility-regime accuracy from",
      "  `get_model_metrics` and the analogue split from `find_similar_days`.",
      "- A user pressing for a call anyway does not change the answer. Explain what would have",
      "  to be true for a signal to be emitted.",
      "",
      "HONESTY ABOUT THE MODEL",
      "- Next-session direction is close to a coin flip. Your measured accuracy is in the",
      "  mid-50s, and that is the expected and correct result for this horizon. State it",
      "  plainly when asked; do not manage it with adjectives like 'strong' or 'highly",
      "  accurate'.",
      "- The return regressor's R-squared is approximately zero. If asked about predicted",
      "  magnitude, say the range is volatility-implied and not a confidence interval.",
      "- When asked whether to trust you, call `get_model_metrics` and answer with the",
      "  numbers, including the ones that are unflattering.",
      "",
      "WHAT YOU WILL NOT DO",
      "- None of the following is a reason to refuse a question about a name in the basket.",
      "  Report the measurement; the limits below constrain what you add to it, not whether",
      "  you answer at all.",
      "- Never promise, guarantee or imply an assured return.",
      "- Never give position sizing, leverage or tax advice, and never recommend an amount to",
      "  invest.",
      "- All analysis is historical or paper-traded. Nothing here touches real money.",
      "- Anything that leaves this system — an alert, a paper trade — queues for the user's",
      "  approval. Never say it is done before it is approved.",
      "",
      "Attach the disclaimer to any answer containing a signal. Close by saying what you were",
      "unsure about.",
    ].join("\n"),

    /**
     * `web_search` is deliberately absent (§4.1/§7.3): there is no `TAVILY_API_KEY` in this
     * build, so it would only ever return results labelled MOCK — and a mock search result
     * sitting in a financial answer is a risk with no upside here.
     */
    enabledTools: [
      "clean_input",
      "extract_structured",
      "verify",
      "calculate",
      "search_memory",
      "save_memory",
      "rag_lookup",
      "create_task",
      // ── finance ──
      "get_signal",
      "get_move_size",
      "get_model_metrics",
      "find_similar_days",
    ],
    maxSteps: 8,
    confidenceThreshold: 0.85,
  },

  inputs: {
    text: true,
    dictation: true,
    file: false,
    url: false,
    acceptedFileTypes: [],
  },

  partnerTool: {
    name: "Not applicable — solo entry, no partner track",
    type: "api",
    proofNotes:
      "Arthaton 2026 has no partner-tool requirement. The slot is kept because the template " +
      "schema requires it; nothing in the UI renders it.",
  },

  sampleQuestions: [
    "What are today's signals?",
    "Should I buy Reliance before tomorrow's open?",
    "How accurate are you, really?",
    "Why are you refusing to call Infosys today?",
    "Show me the most similar past sessions to today for TCS.",
    "How do you compare to just always predicting up?",
  ],

  demoSeed: "nse-copilot",

  /**
   * Every path here is asserted to exist by `tests/honesty.test.ts`. A must-builds table
   * that points at files which were renamed or never written is worse than no table: it
   * reads as a completed checklist.
   */
  mustBuilds: [
    {
      id: "calibrated-signal",
      title: "Calibrated next-session probability for 18 NSE large-caps",
      status: "done",
      files: [
        "ml/src/copilot/train.py",
        "ml/src/copilot/signals.py",
        "src/lib/tools/finance.ts",
        "src/components/finance/SignalsBoard.tsx",
        "app/signals/page.tsx",
      ],
    },
    {
      id: "abstention",
      title: "Explicit 'no signal today' below a frozen threshold",
      status: "done",
      files: [
        "ml/src/copilot/train.py",
        "src/components/finance/SignalCard.tsx",
        "src/lib/rules/finance.ts",
        "tests/rules.finance.test.ts",
      ],
    },
    {
      id: "purged-evaluation",
      title: "Purged walk-forward evaluation with a once-only final holdout",
      status: "done",
      files: [
        "ml/src/copilot/validation.py",
        "ml/src/copilot/evaluate.py",
        "ml/tests/test_purge.py",
        "ml/tests/test_leakage.py",
        "ml/artifacts/holdout_ledger.json",
      ],
    },
    {
      id: "model-card",
      title: "Model card: calibration curve, four baselines, coverage-accuracy curve",
      status: "done",
      files: [
        "app/dashboard/page.tsx",
        "src/components/finance/ModelCard.tsx",
        "src/components/finance/Charts.tsx",
        "ml/artifacts/metrics.json",
      ],
    },
    {
      id: "evidence-timeline",
      title: "Similar past sessions and what happened next",
      status: "done",
      files: [
        "ml/src/copilot/neighbors.py",
        "src/components/finance/EvidenceTimeline.tsx",
        "app/evidence/page.tsx",
      ],
    },
    {
      id: "self-aware-chat",
      title: "An assistant that quotes its own measured failure rate",
      status: "done",
      files: ["src/lib/tools/finance.ts", "src/lib/chatContext.ts", "src/lib/agent/loop.ts"],
    },
    {
      id: "no-invented-numbers",
      title: "Every UI number traces to a committed artifact, enforced by a test",
      status: "done",
      files: ["tests/honesty.test.ts", "src/lib/ml/client.ts", "src/data/demo-seed.ts"],
    },
    {
      id: "paper-trading",
      title: "Cost-aware paper trading with an equity curve, charged at three cost levels",
      status: "done",
      files: [
        "ml/src/copilot/evaluate.py",
        "src/components/finance/Charts.tsx",
        "src/components/finance/ModelCard.tsx",
      ],
    },
    {
      id: "watchlist-risk-profile",
      title: "Watchlist and a risk profile that can only ever hide signals, never reveal them",
      status: "done",
      files: [
        "app/watchlist/page.tsx",
        "src/lib/riskProfile.ts",
        "src/lib/actions/watchlist.ts",
        "tests/watchlist.test.ts",
      ],
    },
  ],

  wow: {
    title: "The agent refusing to give a signal — with numbers",
    description:
      "Ask it to call a stock on a low-conviction day and it declines, then explains the refusal with its own measured accuracy in today's volatility regime and the 13/12 split among the closest historical sessions. Every other stock predictor in the room always has an answer.",
  },
};

export default idea;
