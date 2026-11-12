import { z } from "zod";
import type { Tool } from "@/lib/agent/types";

/**
 * Arithmetic and date maths, computed in code.
 *
 * This is the tool that enforces the template's first principle: the model decides and
 * phrases, code computes. A language model asked for "18% of 2,450 per month over a
 * year" will usually be right and occasionally be confidently wrong, and a judge cannot
 * tell which. So the model is told to route every number through here.
 *
 * No `eval`, no `new Function`: a shunting-yard parser over an explicit token set. The
 * input is untrusted — it is a string a model wrote — and `eval` on model output is a
 * remote code execution hole, not a shortcut.
 */

const Input = z.object({
  expression: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "An arithmetic expression, e.g. '0.18 * 2450' or '(1200 + 350) / 12'. " +
        "Supports + - * / % ^, parentheses, and the functions min, max, abs, round, floor, ceil, sqrt.",
    )
    .optional(),
  /** The date branch, kept separate so the model cannot mix the two by accident. */
  dateOp: z
    .object({
      op: z.enum(["add", "diff", "weekday", "endOfMonth"]),
      /** ISO date, e.g. "2026-11-14". */
      date: z.string(),
      /** For `add`: how many units. Negative subtracts. */
      amount: z.number().int().optional(),
      unit: z.enum(["day", "week", "month", "year"]).optional(),
      /** For `diff`: the other ISO date. */
      other: z.string().optional(),
    })
    .optional(),
});

type Token = { kind: "num"; value: number } | { kind: "op" | "fn" | "paren"; value: string };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: (x) => Math.round(x),
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
};

/**
 * `u-` is unary negation, kept as its own operator rather than desugared to `0 - x`.
 * That desugaring is subtly wrong: it gives subtraction's precedence to the negation, so
 * `3 * -2` parses as `3 * 0 - 2` and yields -2 instead of -6. Negation binds tighter than
 * `*` and looser than `^` (so `-2 ^ 2` is -(2^2) = -4, matching normal maths notation).
 */
const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "u-": 3, "^": 4 };
const RIGHT_ASSOCIATIVE = new Set(["^", "u-"]);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  // Thousands separators are stripped first: a model writing "2,450" means one number,
  // but a comma is also an argument separator, so this must happen before parsing.
  const text = input.replace(/(\d),(?=\d{3}\b)/g, "$1");

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!match) throw new Error(`malformed number at position ${i}`);
      tokens.push({ kind: "num", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const match = /^[a-zA-Z]+/.exec(text.slice(i))!;
      const name = match[0].toLowerCase();
      if (!(name in FUNCTIONS)) throw new Error(`unknown function "${name}"`);
      tokens.push({ kind: "fn", value: name });
      i += match[0].length;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      tokens.push({ kind: "paren", value: ch });
      i += 1;
      continue;
    }
    if (ch in PRECEDENCE) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    throw new Error(`unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

/** Shunting-yard to RPN, then evaluate. Unary minus is handled by tracking position. */
export function evaluateExpression(input: string): number {
  const tokens = tokenize(input);
  const output: Token[] = [];
  const stack: Token[] = [];
  const argCounts: number[] = [];
  let previous: Token | null = null;

  for (const token of tokens) {
    if (token.kind === "num") {
      output.push(token);
    } else if (token.kind === "fn") {
      stack.push(token);
      argCounts.push(1);
    } else if (token.value === ",") {
      while (stack.length > 0 && stack[stack.length - 1].value !== "(") output.push(stack.pop()!);
      if (argCounts.length > 0) argCounts[argCounts.length - 1] += 1;
    } else if (token.value === "(") {
      stack.push(token);
    } else if (token.value === ")") {
      while (stack.length > 0 && stack[stack.length - 1].value !== "(") output.push(stack.pop()!);
      if (stack.length === 0) throw new Error("unbalanced parentheses");
      stack.pop();
      if (stack.length > 0 && stack[stack.length - 1].kind === "fn") {
        const fn = stack.pop()!;
        output.push({ kind: "fn", value: `${fn.value}:${argCounts.pop() ?? 1}` });
      }
    } else {
      // A "-" in operand position is a negation, not a subtraction.
      const unary =
        token.value === "-" &&
        (previous === null || previous.kind === "op" || previous.value === "(" || previous.value === ",");
      const operator: Token = unary ? { kind: "op", value: "u-" } : token;
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.kind !== "op") break;
        const higher = PRECEDENCE[top.value] > PRECEDENCE[operator.value];
        const equal = PRECEDENCE[top.value] === PRECEDENCE[operator.value];
        if (higher || (equal && !RIGHT_ASSOCIATIVE.has(operator.value))) output.push(stack.pop()!);
        else break;
      }
      stack.push(operator);
    }
    previous = token;
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.value === "(") throw new Error("unbalanced parentheses");
    output.push(top);
  }

  const values: number[] = [];
  for (const token of output) {
    if (token.kind === "num") {
      values.push(token.value);
      continue;
    }
    if (token.kind === "fn") {
      const [name, countRaw] = token.value.split(":");
      const count = Number(countRaw ?? 1);
      const args = values.splice(values.length - count, count);
      if (args.length !== count) throw new Error(`${name} got ${args.length} arguments, expected ${count}`);
      values.push(FUNCTIONS[name](...args));
      continue;
    }
    if (token.value === "u-") {
      const operand = values.pop();
      if (operand === undefined) throw new Error("malformed expression");
      values.push(-operand);
      continue;
    }
    const b = values.pop();
    const a = values.pop();
    if (a === undefined || b === undefined) throw new Error("malformed expression");
    switch (token.value) {
      case "+":
        values.push(a + b);
        break;
      case "-":
        values.push(a - b);
        break;
      case "*":
        values.push(a * b);
        break;
      case "/":
        if (b === 0) throw new Error("division by zero");
        values.push(a / b);
        break;
      case "%":
        if (b === 0) throw new Error("modulo by zero");
        values.push(a % b);
        break;
      case "^":
        values.push(a ** b);
        break;
      default:
        throw new Error(`unknown operator "${token.value}"`);
    }
  }

  if (values.length !== 1) throw new Error("malformed expression");
  const result = values[0];
  if (!Number.isFinite(result)) throw new Error("result is not a finite number");
  return result;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(value: string): Date {
  if (!ISO.test(value)) throw new Error(`date must be ISO yyyy-mm-dd, got "${value}"`);
  // UTC on purpose: local-time parsing silently shifts the day across time zones, which
  // is exactly the class of bug this tool exists to prevent.
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date "${value}"`);
  return date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function evaluateDate(op: NonNullable<z.infer<typeof Input>["dateOp"]>): {
  result: string | number;
  explanation: string;
} {
  const date = parseIso(op.date);
  switch (op.op) {
    case "add": {
      if (op.amount === undefined || !op.unit) throw new Error("add needs both amount and unit");
      const next = new Date(date);
      if (op.unit === "day") next.setUTCDate(next.getUTCDate() + op.amount);
      if (op.unit === "week") next.setUTCDate(next.getUTCDate() + op.amount * 7);
      if (op.unit === "year") next.setUTCFullYear(next.getUTCFullYear() + op.amount);
      if (op.unit === "month") {
        // Clamp rather than overflow: 31 Jan + 1 month is 28/29 Feb, not 2/3 March.
        const targetMonth = next.getUTCMonth() + op.amount;
        const day = next.getUTCDate();
        next.setUTCDate(1);
        next.setUTCMonth(targetMonth);
        const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(day, lastDay));
      }
      return {
        result: toIso(next),
        explanation: `${op.date} ${op.amount >= 0 ? "+" : "−"} ${Math.abs(op.amount)} ${op.unit}(s) = ${toIso(next)}`,
      };
    }
    case "diff": {
      if (!op.other) throw new Error("diff needs `other`");
      const other = parseIso(op.other);
      const days = Math.round((other.getTime() - date.getTime()) / 86_400_000);
      return { result: days, explanation: `${op.other} − ${op.date} = ${days} day(s)` };
    }
    case "weekday":
      return {
        result: WEEKDAYS[date.getUTCDay()],
        explanation: `${op.date} is a ${WEEKDAYS[date.getUTCDay()]}`,
      };
    case "endOfMonth": {
      const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
      return { result: toIso(end), explanation: `the month containing ${op.date} ends on ${toIso(end)}` };
    }
  }
}

export const calculateTool: Tool<typeof Input> = {
  name: "calculate",
  description:
    "Compute arithmetic or date maths exactly, in code. Use this for every number you intend to " +
    "state — percentages, totals, per-month figures, differences between dates, deadlines. " +
    "Never do arithmetic in your head.",
  inputSchema: Input,

  async run(input) {
    if (!input.expression && !input.dateOp) {
      throw new Error("give either `expression` or `dateOp`");
    }
    const out: Record<string, unknown> = {};
    if (input.expression) {
      const value = evaluateExpression(input.expression);
      out.expression = input.expression;
      out.value = value;
      // A rounded form alongside the exact one: the model should quote the rounded figure
      // but the exact value stays visible in the trace.
      out.rounded = Math.round(value * 100) / 100;
    }
    if (input.dateOp) {
      const { result, explanation } = evaluateDate(input.dateOp);
      out.dateResult = result;
      out.dateExplanation = explanation;
    }
    return out;
  },
};
