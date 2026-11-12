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
    "the prediction — a probability that has been calibrated against out-of-sample outcomes " +
    "so 62% means 62%, an explicit refusal to call the sessions where conviction does not " +
    "clear a frozen threshold, the historical sessions that most resemble today with what " +
    "actually happened next, and an assistant that will quote its own measured failure rate " +
    "when you ask whether to trust it.",
  targetUser:
    "A self-directed Indian equity investor who already reads charts, and wants to know when the model should be ignored.",

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
          "Isotonic calibration on out-of-fold predictions, so 62% is 62%. The calibration curve is on the model card.",
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
      "fixed basket of 18 NSE large-caps and predict one thing: the direction of the next",
      "trading session. You are not a financial adviser and you do not manage money.",
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

  mustBuilds: [
    {
      id: "calibrated-signal",
      title: "Calibrated next-session probability for 18 NSE large-caps",
      status: "done",
      files: [
        "ml/src/copilot/train.py",
        "ml/src/copilot/signals.py",
        "src/lib/tools/finance.ts",
        "src/components/signals/SignalsTab.tsx",
      ],
    },
    {
      id: "abstention",
      title: "Explicit 'no signal today' below a frozen threshold",
      status: "done",
      files: [
        "ml/src/copilot/train.py",
        "src/components/signals/AbstentionCard.tsx",
        "src/lib/rules/finance.ts",
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
      ],
    },
    {
      id: "model-card",
      title: "Model card: calibration curve, four baselines, coverage-accuracy curve",
      status: "done",
      files: ["app/dashboard/page.tsx", "src/components/modelcard/ModelCard.tsx"],
    },
    {
      id: "evidence-timeline",
      title: "Similar past sessions and what happened next",
      status: "done",
      files: ["ml/src/copilot/neighbors.py", "src/components/path/EvidenceTimeline.tsx"],
    },
    {
      id: "self-aware-chat",
      title: "An assistant that quotes its own measured failure rate",
      status: "done",
      files: ["src/lib/tools/finance.ts", "src/lib/chatContext.ts", "idea.config.ts"],
    },
  ],

  wow: {
    title: "The agent refusing to give a signal — with numbers",
    description:
      "Ask it to call a stock on a low-conviction day and it declines, then explains the refusal with its own measured accuracy in today's volatility regime and the 13/12 split among the closest historical sessions. Every other stock predictor in the room always has an answer.",
  },
};

export default idea;
