import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { runRules, RULES } from "@/lib/rules";
import {
  DISCLAIMER_TEXT,
  FINANCE_RULES,
  alwaysAttachDisclaimer,
  blockGuaranteedReturnLanguage,
  neverCallDirectionWithoutModel,
  neverOverrideAnAbstention,
} from "@/lib/rules/finance";

/**
 * The finance rules are tested against the model misbehaving, not against the happy path.
 *
 * Each of these is a thing the system prompt already asks for, so a cooperative model
 * never trips them. The rules exist for the uncooperative case — a jailbreak, a bad
 * generation, a long conversation where the prompt has drifted out of the model's
 * attention — and that is the only case worth testing.
 */

const base = { config: config(), results: [], stepIndex: 0 };

const abstainedSignal = {
  name: "get_signal",
  output: {
    signal: {
      ticker: "RELIANCE.NS",
      abstain: true,
      probability_up: 0.52,
      conviction: 0.52,
      threshold: 0.6,
      abstain_reason: "conviction below threshold",
    },
  },
};

const calledSignal = {
  name: "get_signal",
  output: {
    signal: {
      ticker: "INFY.NS",
      abstain: false,
      direction: "up",
      probability_up: 0.64,
      conviction: 0.64,
      threshold: 0.6,
    },
  },
};

describe("no-guaranteed-returns", () => {
  const phrases = [
    "This is a guaranteed winner for tomorrow.",
    "A risk-free way to play the open.",
    "You can't lose on this one.",
    "It's a sure thing at these levels.",
    "Assured returns over the next session.",
    "It will definitely rise tomorrow.",
    "This approach is 100% accurate.",
    "A classic multibagger setup.",
  ];

  it("annotates a final answer that promises an outcome", () => {
    for (const text of phrases) {
      const { outcome, fired } = runRules(
        { ...base, stage: "before_final", finalText: text },
        [blockGuaranteedReturnLanguage],
      );
      expect(outcome.action, `should fire on: ${text}`).toBe("annotate");
      expect(fired[0].id).toBe("no-guaranteed-returns");
      expect(outcome.action === "annotate" && outcome.message).toMatch(
        /No outcome here is guaranteed/i,
      );
    }
  });

  it("blocks a tool call whose arguments contain the phrasing", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_tool",
        toolCall: {
          id: "1",
          name: "create_task",
          input: { title: "Tell the client about this risk-free trade" },
        },
      },
      [blockGuaranteedReturnLanguage],
    );
    expect(outcome.action).toBe("block");
  });

  it("leaves ordinary hedged language alone", () => {
    for (const text of [
      "The calibrated probability is 64%, which is a weak edge.",
      "I measured 51.4% accuracy on the holdout, close to a coin flip.",
      "I am not giving a direction on this today.",
      "Guarantees are not something this model can offer.", // the word, but not the claim
    ]) {
      const { outcome } = runRules({ ...base, stage: "before_final", finalText: text }, [
        blockGuaranteedReturnLanguage,
      ]);
      // The last one is a deliberate near-miss: it contains "Guarantee" and the rule is a
      // regex, so it does fire. That is the correct trade for this rule — a false positive
      // adds a redundant warning, a false negative ships a promise of returns.
      if (text.startsWith("Guarantees")) {
        expect(outcome.action).toBe("annotate");
      } else {
        expect(outcome.action, `should not fire on: ${text}`).toBe("allow");
      }
    }
  });
});

describe("never-override-abstention", () => {
  it("fires when the answer states a direction for an abstained name", () => {
    const { outcome, fired } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [abstainedSignal],
        finalText: "Reliance looks marginally up for tomorrow, so I'd lean bullish.",
      },
      [neverOverrideAnAbstention],
    );
    expect(outcome.action).toBe("annotate");
    expect(fired[0].id).toBe("never-override-abstention");
    expect(outcome.action === "annotate" && outcome.message).toContain("ABSTAINED");
  });

  it("stays quiet when the answer reports the abstention properly", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [abstainedSignal],
        finalText:
          "I'm not calling Reliance today — conviction is below my threshold, so there is no signal.",
      },
      [neverOverrideAnAbstention],
    );
    expect(outcome.action).toBe("allow");
  });

  it("does not interfere with a name the model actually called", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [calledSignal],
        finalText: "Infosys is up with a calibrated probability of 64%.",
      },
      [neverOverrideAnAbstention],
    );
    expect(outcome.action).toBe("allow");
  });

  it("only applies to the abstained ticker, not to every ticker in the answer", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [abstainedSignal],
        finalText: "Infosys is up today with 64% probability.",
      },
      [neverOverrideAnAbstention],
    );
    expect(outcome.action).toBe("allow");
  });
});

describe("no-direction-without-model", () => {
  it("fires on a directional claim with no get_signal call behind it", () => {
    const { outcome, fired } = runRules(
      {
        ...base,
        stage: "before_final",
        finalText: "Reliance will probably rise tomorrow given the momentum.",
      },
      [neverCallDirectionWithoutModel],
    );
    expect(outcome.action).toBe("annotate");
    expect(fired[0].id).toBe("no-direction-without-model");
  });

  it("fires on a recommendation with no model behind it", () => {
    const { outcome } = runRules(
      { ...base, stage: "before_final", finalText: "I would recommend you buy before the open." },
      [neverCallDirectionWithoutModel],
    );
    expect(outcome.action).toBe("annotate");
  });

  it("stays quiet once get_signal has run", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [calledSignal],
        finalText: "Infosys will likely rise next session; calibrated probability 64%.",
      },
      [neverCallDirectionWithoutModel],
    );
    expect(outcome.action).toBe("allow");
  });

  it("leaves a factual statement about the past alone", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        finalText: "RSI measures momentum over a 14-session window. The stock rose yesterday.",
      },
      [neverCallDirectionWithoutModel],
    );
    expect(outcome.action).toBe("allow");
  });
});

describe("always-attach-disclaimer", () => {
  it("attaches the disclaimer when a signal was reported without one", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [calledSignal],
        finalText: "Infosys: up, 64%.",
      },
      [alwaysAttachDisclaimer],
    );
    expect(outcome.action).toBe("annotate");
    expect(outcome.action === "annotate" && outcome.message).toBe(DISCLAIMER_TEXT);
  });

  it("does not duplicate a disclaimer the model already wrote", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [calledSignal],
        finalText: "Infosys: up, 64%. This is not investment advice.",
      },
      [alwaysAttachDisclaimer],
    );
    expect(outcome.action).toBe("allow");
  });

  it("stays out of the way of an answer with no signal in it", () => {
    const { outcome } = runRules(
      { ...base, stage: "before_final", finalText: "RSI is a momentum oscillator." },
      [alwaysAttachDisclaimer],
    );
    expect(outcome.action).toBe("allow");
  });
});

describe("the composed rule set", () => {
  it("registers every finance rule in the live RULES list", () => {
    for (const rule of FINANCE_RULES) {
      expect(RULES.map((r) => r.id), `${rule.id} must be live, not just exported`).toContain(
        rule.id,
      );
    }
  });

  it("keeps the template's approval invariant ahead of the finance rules", () => {
    const ids = RULES.map((r) => r.id);
    expect(ids[0]).toBe("never-act-without-approval");
  });

  it("blocks rather than annotates when a guarantee appears in a tool call", () => {
    // The whole set, in order — a blocking rule must win over the annotating ones.
    const { outcome } = runRules({
      ...base,
      stage: "before_tool",
      toolCall: { id: "1", name: "create_task", input: { title: "guaranteed profit alert" } },
    });
    expect(outcome.action).toBe("block");
  });

  it("accumulates several warnings on one bad answer", () => {
    const { outcome, fired } = runRules({
      ...base,
      stage: "before_final",
      results: [abstainedSignal],
      // Three problems at once: a guarantee, a direction on an abstained name, and no
      // disclaimer.
      finalText: "Reliance is guaranteed to go up tomorrow. Buy it.",
    });
    expect(outcome.action).toBe("annotate");
    expect(fired.length).toBeGreaterThanOrEqual(2);
  });
});
