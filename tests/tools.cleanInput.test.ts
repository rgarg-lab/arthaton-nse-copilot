import { describe, expect, it } from "vitest";
import { cleanText } from "@/lib/tools/clean_input";

/**
 * Cleaning dictated text is the one place the template rewrites what the user said, so
 * the tests care as much about what it leaves alone as about what it removes.
 */

describe("fillers", () => {
  it("removes standalone fillers", () => {
    const { cleaned } = cleanText("So, um, I need the report by Friday, you know.");
    expect(cleaned).not.toMatch(/\bum\b/);
    expect(cleaned).toMatch(/report/);
    expect(cleaned).toMatch(/Friday/);
  });

  it("keeps a filler word when it is being used as a real word", () => {
    // "like" as a verb must survive, or the tool is corrupting meaning.
    const { cleaned } = cleanText("I like the second option.");
    expect(cleaned).toMatch(/I like the second option/);
  });

  it("collapses a repeated word", () => {
    const { cleaned, changes } = cleanText("Send the the invoice today.");
    expect(cleaned).toBe("Send the invoice today.");
    expect(changes.some((c) => c.kind === "duplicate")).toBe(true);
  });

  it("normalises spacing and punctuation gaps", () => {
    const { cleaned } = cleanText("Hello   world , this  is fine .");
    expect(cleaned).toBe("Hello world, this is fine.");
  });
});

describe("self-corrections", () => {
  it("resolves the canonical case", () => {
    const { cleaned, changes } = cleanText("Let's meet on Friday, no wait, Monday.");
    expect(cleaned).toMatch(/Monday/);
    expect(cleaned).not.toMatch(/Friday/);
    const correction = changes.find((c) => c.kind === "correction");
    expect(correction).toBeDefined();
    expect(correction!.removed).toMatch(/Friday/);
    expect(correction!.replacement).toMatch(/Monday/);
  });

  it('handles "I meant"', () => {
    const { cleaned } = cleanText("Budget is 5000, sorry I meant 6000.");
    expect(cleaned).toMatch(/6000/);
    expect(cleaned).not.toMatch(/5000/);
  });

  it("keeps the part of the sentence before the corrected fragment", () => {
    const { cleaned } = cleanText("Invite Priya and Sam, no wait, Alex.");
    expect(cleaned).toMatch(/Priya/);
    expect(cleaned).toMatch(/Alex/);
    expect(cleaned).not.toMatch(/Sam/);
  });

  it("reports every change so the UI can show raw vs cleaned", () => {
    const result = cleanText("Um, send it Friday, no wait, Monday.");
    expect(result.raw).toContain("Friday");
    expect(result.cleaned).not.toContain("Friday");
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
    for (const change of result.changes) {
      expect(change.note.length).toBeGreaterThan(0);
    }
  });

  it("lowers confidence when it made a correction", () => {
    const plain = cleanText("Send the report on Monday.");
    const corrected = cleanText("Send the report on Friday, no wait, Monday.");
    expect(corrected.confidence).toBeLessThan(plain.confidence);
  });
});

describe("leaving text alone", () => {
  it("returns clean text essentially unchanged", () => {
    const text = "Please review the Q3 forecast and confirm the headcount by 14 November.";
    const { cleaned, changes, confidence } = cleanText(text);
    expect(cleaned).toBe(text);
    expect(changes).toHaveLength(0);
    expect(confidence).toBe(1);
  });

  it("is deterministic", () => {
    const input = "Um, so, deadline is Friday, no wait, Monday, you know.";
    expect(cleanText(input).cleaned).toBe(cleanText(input).cleaned);
  });

  it("never returns empty for non-empty input", () => {
    for (const input of ["um", "like", "actually", "I mean"]) {
      expect(cleanText(input).cleaned.length).toBeGreaterThan(0);
    }
  });
});
