import { describe, expect, it } from "vitest";
import { evaluateDate, evaluateExpression } from "@/lib/tools/calculate";

/**
 * The arithmetic tool is where "code for correctness" is actually kept, so it is tested
 * harder than anything else here. If this is wrong, the template's central claim is wrong.
 */

describe("evaluateExpression", () => {
  it("does basic arithmetic with correct precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("100 / 4 / 5")).toBe(5);
    expect(evaluateExpression("10 - 2 - 3")).toBe(5);
  });

  it("handles percentages the way a model will write them", () => {
    expect(evaluateExpression("0.18 * 2450")).toBeCloseTo(441, 10);
    expect(evaluateExpression("0.18 * 2,450")).toBeCloseTo(441, 10);
    expect(evaluateExpression("2450 * 18 / 100")).toBeCloseTo(441, 10);
  });

  it("is right-associative for exponentiation", () => {
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512);
    expect(evaluateExpression("(2 ^ 3) ^ 2")).toBe(64);
  });

  it("handles unary minus, including after an operator and a paren", () => {
    expect(evaluateExpression("-5")).toBe(-5);
    expect(evaluateExpression("3 * -2")).toBe(-6);
    expect(evaluateExpression("(-4) + 10")).toBe(6);
    expect(evaluateExpression("-2 ^ 2")).toBe(-4);
  });

  it("supports the function set with multiple arguments", () => {
    expect(evaluateExpression("max(3, 7)")).toBe(7);
    expect(evaluateExpression("min(3, 7, 2)")).toBe(2);
    expect(evaluateExpression("round(2.567)")).toBe(3);
    expect(evaluateExpression("sqrt(16)")).toBe(4);
    expect(evaluateExpression("abs(0 - 9)")).toBe(9);
    expect(evaluateExpression("max(1, min(10, 5))")).toBe(5);
  });

  it("rejects anything that is not arithmetic, rather than evaluating it", () => {
    // The input is a string a language model wrote. These must not be executable.
    expect(() => evaluateExpression("process.exit(1)")).toThrow();
    expect(() => evaluateExpression("require('fs')")).toThrow();
    expect(() => evaluateExpression("1; console.log(2)")).toThrow();
    expect(() => evaluateExpression("globalThis")).toThrow();
    expect(() => evaluateExpression("__proto__")).toThrow();
  });

  it("fails loudly on malformed input", () => {
    expect(() => evaluateExpression("2 +")).toThrow(/malformed/);
    expect(() => evaluateExpression("(2 + 3")).toThrow(/unbalanced/);
    expect(() => evaluateExpression("2 + 3)")).toThrow(/unbalanced/);
    expect(() => evaluateExpression("1 / 0")).toThrow(/division by zero/);
    expect(() => evaluateExpression("nope(2)")).toThrow(/unknown function/);
  });
});

describe("evaluateDate", () => {
  it("adds days and weeks", () => {
    expect(evaluateDate({ op: "add", date: "2026-11-14", amount: 7, unit: "day" }).result).toBe("2026-11-21");
    expect(evaluateDate({ op: "add", date: "2026-11-14", amount: 2, unit: "week" }).result).toBe("2026-11-28");
    expect(evaluateDate({ op: "add", date: "2026-11-14", amount: -14, unit: "day" }).result).toBe("2026-10-31");
  });

  it("clamps a month addition instead of overflowing it", () => {
    // 31 Jan + 1 month is 28 Feb, not 3 March. This is the bug the tool exists to prevent.
    expect(evaluateDate({ op: "add", date: "2026-01-31", amount: 1, unit: "month" }).result).toBe("2026-02-28");
    expect(evaluateDate({ op: "add", date: "2028-01-31", amount: 1, unit: "month" }).result).toBe("2028-02-29");
    expect(evaluateDate({ op: "add", date: "2026-03-31", amount: -1, unit: "month" }).result).toBe("2026-02-28");
  });

  it("crosses a year boundary correctly", () => {
    expect(evaluateDate({ op: "add", date: "2026-12-20", amount: 20, unit: "day" }).result).toBe("2027-01-09");
    expect(evaluateDate({ op: "add", date: "2026-11-14", amount: 1, unit: "year" }).result).toBe("2027-11-14");
  });

  it("diffs two dates in whole days", () => {
    expect(evaluateDate({ op: "diff", date: "2026-11-01", other: "2026-11-14" }).result).toBe(13);
    expect(evaluateDate({ op: "diff", date: "2026-11-14", other: "2026-11-01" }).result).toBe(-13);
  });

  it("names the weekday and the end of the month", () => {
    expect(evaluateDate({ op: "weekday", date: "2026-11-14" }).result).toBe("Saturday");
    expect(evaluateDate({ op: "endOfMonth", date: "2026-02-10" }).result).toBe("2026-02-28");
    expect(evaluateDate({ op: "endOfMonth", date: "2026-11-01" }).result).toBe("2026-11-30");
  });

  it("rejects a non-ISO date rather than guessing the format", () => {
    expect(() => evaluateDate({ op: "weekday", date: "14/11/2026" })).toThrow(/ISO/);
    expect(() => evaluateDate({ op: "weekday", date: "2026-13-45" })).toThrow();
  });
});
