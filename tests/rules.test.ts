import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { flagLowConfidence, neverActWithoutApproval, runRules, type Rule } from "@/lib/rules";

/**
 * The rules layer is what still holds when the model does not cooperate, so it is tested
 * against the model misbehaving rather than against the happy path.
 */

const base = { config: config(), results: [], stepIndex: 0 };

describe("never-act-without-approval", () => {
  it("allows a normal external tool call, because queuing is the approved path", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_tool",
        toolCall: { id: "1", name: "send_message", input: { to: "a@b.c", body: "hi" } },
      },
      [neverActWithoutApproval],
    );
    expect(outcome.action).toBe("allow");
  });

  it("blocks an attempt to bypass approval", () => {
    for (const flag of ["send_now", "skipApproval", "skip_approval", "immediate", "force"]) {
      const { outcome, fired } = runRules(
        {
          ...base,
          stage: "before_tool",
          toolCall: { id: "1", name: "send_message", input: { to: "a@b.c", body: "hi", [flag]: true } },
        },
        [neverActWithoutApproval],
      );
      expect(outcome.action, `flag ${flag} should be blocked`).toBe("block");
      expect(fired[0].id).toBe("never-act-without-approval");
    }
  });

  it("ignores non-external tools", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_tool",
        toolCall: { id: "1", name: "calculate", input: { expression: "1+1", force: true } },
      },
      [neverActWithoutApproval],
    );
    expect(outcome.action).toBe("allow");
  });
});

describe("flag-low-confidence", () => {
  it("annotates when the best verification is below the threshold", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        finalText: "The total is 441.",
        results: [{ name: "verify", output: { verdict: "partially_supported", confidence: 0.4 } }],
      },
      [flagLowConfidence],
    );
    expect(outcome.action).toBe("annotate");
    if (outcome.action === "annotate") {
      expect(outcome.message).toContain("0.40");
      expect(outcome.message).toContain("unconfirmed");
    }
  });

  /**
   * The subtle case, found by running the agent for real: a high confidence attached to a
   * non-supported verdict means the model is *sure* the claim is only partly supported.
   * Checking the number alone waved this through unflagged.
   */
  it("annotates a confident but non-supported verdict", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [{ name: "verify", output: { verdict: "partially_supported", confidence: 0.95 } }],
      },
      [flagLowConfidence],
    );
    expect(outcome.action).toBe("annotate");
    if (outcome.action === "annotate") {
      expect(outcome.message).toContain("partially_supported");
    }
  });

  it("warns harder when the source contradicts the claim", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [{ name: "verify", output: { verdict: "contradicted", confidence: 0.9 } }],
      },
      [flagLowConfidence],
    );
    expect(outcome.action).toBe("annotate");
    if (outcome.action === "annotate") {
      expect(outcome.message).toContain("contradicts");
      expect(outcome.message).toContain("do not rely");
    }
  });

  it("stays quiet when confidence clears the threshold", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [{ name: "verify", output: { verdict: "supported", confidence: 0.96 } }],
      },
      [flagLowConfidence],
    );
    expect(outcome.action).toBe("allow");
  });

  it("allows when any one verification is supported above the threshold", () => {
    const { outcome } = runRules(
      {
        ...base,
        stage: "before_final",
        results: [
          { name: "verify", output: { verdict: "unsupported", confidence: 0.2 } },
          { name: "verify", output: { verdict: "supported", confidence: 0.99 } },
        ],
      },
      [flagLowConfidence],
    );
    expect(outcome.action).toBe("allow");
  });

  it("stays quiet when nothing was verified at all", () => {
    const { outcome } = runRules({ ...base, stage: "before_final" }, [flagLowConfidence]);
    expect(outcome.action).toBe("allow");
  });
});

describe("rule engine", () => {
  const blocker: Rule = {
    id: "blocker",
    description: "blocks everything",
    when: () => true,
    then: () => ({ action: "block", message: "no" }),
  };
  const annotator = (id: string, message: string): Rule => ({
    id,
    description: "annotates",
    when: () => true,
    then: () => ({ action: "annotate", message }),
  });

  it("stops at the first block and does not run later rules", () => {
    const { outcome, fired } = runRules({ ...base, stage: "before_final" }, [
      blocker,
      annotator("second", "should not appear"),
    ]);
    expect(outcome.action).toBe("block");
    expect(fired.map((f) => f.id)).toEqual(["blocker"]);
  });

  it("accumulates several annotations", () => {
    const { outcome, fired } = runRules({ ...base, stage: "before_final" }, [
      annotator("first", "one"),
      annotator("second", "two"),
    ]);
    expect(outcome.action).toBe("annotate");
    if (outcome.action === "annotate") {
      expect(outcome.message).toContain("one");
      expect(outcome.message).toContain("two");
    }
    expect(fired).toHaveLength(2);
  });

  it("survives a rule that throws rather than failing the run", () => {
    const broken: Rule = {
      id: "broken",
      description: "throws",
      when: () => {
        throw new Error("bad rule");
      },
      then: () => ({ action: "allow" }),
    };
    const { outcome } = runRules({ ...base, stage: "before_final" }, [broken, annotator("ok", "still ran")]);
    expect(outcome.action).toBe("annotate");
  });
});
