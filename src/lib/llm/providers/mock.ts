import type { Message, Provider, ProviderRequest, ProviderResponse, ToolCall } from "../types";

/**
 * The provider that makes the demo unbreakable.
 *
 * It is not a stub that returns "Lorem ipsum". It reads the prompt it was given, decides
 * which of the offered tools are worth calling, calls them one per turn like a real model
 * would, and then writes a closing answer that quotes what the tools returned. When a
 * schema is requested it synthesises an object that actually validates against it.
 *
 * Every decision is a pure function of the conversation, so the same input always
 * produces the same run — which is what makes the eval suite and the Playwright smoke
 * test meaningful with no API key.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "user") return m.content;
  }
  return "";
}

/** Every tool already called in this conversation, so the mock never loops. */
function calledTools(messages: Message[]): Set<string> {
  const seen = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") for (const c of m.toolCalls ?? []) seen.add(c.name);
    if (m.role === "tool") seen.add(m.name);
  }
  return seen;
}

function toolResults(messages: Message[]): { name: string; content: string }[] {
  return messages.filter((m): m is Extract<Message, { role: "tool" }> => m.role === "tool").map((m) => ({ name: m.name, content: m.content }));
}

/**
 * The tools the template itself ships with. Anything not in here was added for the
 * current idea, which is exactly what a mock run should spend its steps on.
 *
 * Deliberately a literal list rather than an import from the tool registry: importing it
 * would make the mock provider depend on the registry, which depends on the config, which
 * is a cycle, and the mock has to stay usable in isolation from a unit test.
 */
const BUILTIN_TOOLS = new Set([
  "clean_input",
  "extract_structured",
  "verify",
  "calculate",
  "search_memory",
  "save_memory",
  "compare_with_memory",
  "rag_lookup",
  "web_search",
  "fetch_url",
  "ml_predict",
  "create_task",
  "send_message",
  "schedule_reminder",
]);

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "is", "it", "this",
  "that", "with", "from", "by", "my", "me", "i", "you", "your", "what", "how", "when",
  "use", "using", "call", "tool", "returns", "return", "do", "does", "not", "never",
  "should", "must", "can", "will", "be", "are", "was", "has", "have", "one", "each",
  "they", "them", "their", "its", "as", "if", "so", "then", "than", "but", "all", "any",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? []).filter((w) => !STOP_WORDS.has(w)),
  );
}

/**
 * Rank the offered tools by how well their own name and description match the prompt.
 *
 * Found during the dry run: the keyword list below only knows the fourteen tools the
 * template ships with, so an idea's *own* tools were never picked in mock mode. Its eval
 * cases then failed even though the code was correct, which is a nasty thing to debug at
 * 3pm on hackathon day. Scoring against each tool's declared name and description means a
 * tool the idea added is reached for when the prompt uses its words, with no change to
 * this provider needed per idea.
 */
function relevanceRanked(prompt: string, tools: { name: string; description: string }[]): string[] {
  const promptWords = contentWords(prompt);
  const scored = tools.map((tool) => {
    // The name is worth more than the description: it is what the idea author chose.
    const nameWords = contentWords(tool.name.replace(/_/g, " "));
    const descWords = contentWords(tool.description);
    let score = 0;
    for (const word of nameWords) if (promptWords.has(word)) score += 3;
    for (const word of descWords) if (promptWords.has(word)) score += 1;
    return { name: tool.name, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (hash(a.name) - hash(b.name)))
    .map((s) => s.name);
}

/**
 * Which tools to reach for, in order. Keyword-driven so the trace looks like reasoning
 * rather than a fixed script, with a floor of two calls: the whole point of the trace
 * panel is to show an agent doing more than one thing.
 */
function plan(prompt: string, tools: { name: string; description: string }[]): string[] {
  const offered = tools.map((t) => t.name);
  const text = prompt.toLowerCase();
  const wants: string[] = [];
  const add = (name: string) => {
    if (offered.includes(name) && !wants.includes(name)) wants.push(name);
  };

  // An idea's own tools come first when the prompt clearly points at them.
  for (const name of relevanceRanked(prompt, tools)) add(name);

  if (/\b(um|uh|actually|no wait|i mean|sorry)\b/.test(text)) add("clean_input");
  if (/[\d]|\bhow much\b|\bpercent\b|%|\bper month\b|\btotal\b|\bcost\b/.test(text)) add("calculate");
  if (/\bremember\b|\bprefer\b|\bmy name\b|\bnote that\b|\bfrom now on\b/.test(text)) add("save_memory");
  if (/\bwhat did i\b|\blast time\b|\bearlier\b|\bremind me\b|\bdo you know\b/.test(text)) add("search_memory");
  if (/\bhttps?:\/\//.test(text)) add("fetch_url");
  if (/\bsearch\b|\blook up\b|\bfind out\b|\blatest\b/.test(text)) add("web_search");
  if (/\bemail\b|\bmessage\b|\bslack\b|\bsend\b/.test(text)) add("send_message");
  if (/\btask\b|\bticket\b|\bissue\b|\btodo\b/.test(text)) add("create_task");
  if (/\bremind\b|\btomorrow\b|\bnext week\b|\bschedule\b/.test(text)) add("schedule_reminder");
  if (/\bextract\b|\bparse\b|\bfrom this\b|\bcsv\b|\bpaste\b/.test(text)) add("extract_structured");

  // The idea's own tools come before the standing habits. With two idea tools, three
  // habits and a keyword hit, the old order left room for only one of them inside the
  // step budget — so a two-tool idea only ever exercised one of its tools in mock mode.
  for (const name of offered) if (!BUILTIN_TOOLS.has(name)) add(name);

  /**
   * Make sure one approval-queueing tool runs, if the idea enabled any.
   *
   * "Nothing acts without a human" is the template's signature moment and a must-build at
   * most events, but in mock mode it only appeared when a keyword happened to match — so
   * an idea could rehearse all day and never see its own approval tray. Detected from the
   * tool's own description rather than a hard-coded list, so an idea's custom external
   * tool is covered too: every queueing tool says so in the text the model reads.
   */
  const queueing = tools.find((t) => /\bapprov(e|al)|queue[sd]?\b/i.test(t.description));
  if (queueing) add(queueing.name);

  // Then the habits the template is trying to teach: consult memory before answering,
  // and verify before asserting.
  add("search_memory");
  add("extract_structured");
  add("verify");

  // Anything left over, with the idea's own tools first.
  //
  // This ordering is the important half of the dry-run fix. The keyword rules above only
  // know the fourteen tools the template ships with, so without this an idea's own tools
  // were reached for last and often not at all inside the step budget — meaning mock mode
  // exercised the template's plumbing and skipped the code the team had just written.
  // Favouring unknown tool names inverts that: whatever is new is what the demo is about.
  const rest = offered.filter((t) => !wants.includes(t));
  const seed = hash(prompt);
  rest.sort((a, b) => {
    const aIdea = BUILTIN_TOOLS.has(a) ? 1 : 0;
    const bIdea = BUILTIN_TOOLS.has(b) ? 1 : 0;
    if (aIdea !== bIdea) return aIdea - bIdea;
    return ((hash(a) ^ seed) >>> 0) - ((hash(b) ^ seed) >>> 0);
  });
  // Six rather than four: an idea's own tools plus the three standing habits plus a
  // keyword hit already fills five, and a trace of six steps still reads cleanly.
  return [...wants, ...rest].slice(0, 6);
}

/**
 * Numbers mentioned in the prompt, so a synthesised expression computes something related
 * to what was actually asked rather than an arbitrary constant.
 */
function numbersIn(prompt: string): number[] {
  const matches = prompt.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

/**
 * A real arithmetic expression for the `calculate` tool.
 *
 * This matters more than it looks: mock mode is the default when no keys are set, so a
 * placeholder like "mock:expression" would make the tool throw and the demo would open
 * with a visible error. The mock has to produce input its own tools accept.
 */
function expressionFor(prompt: string): string {
  const nums = numbersIn(prompt);
  const percent = /(\d[\d,]*(?:\.\d+)?)\s*%/.exec(prompt);
  if (percent && nums.length >= 2) {
    const rate = Number(percent[1].replace(/,/g, ""));
    const base = nums.find((n) => n !== rate) ?? 100;
    return `${rate} / 100 * ${base}`;
  }
  if (nums.length >= 2) return `${nums[0]} + ${nums[1]}`;
  if (nums.length === 1) return `${nums[0]} * 12`;
  return "2 + 2";
}

/**
 * Satisfy a string node's own constraints before falling back to a name-based guess.
 *
 * Checked ahead of the semantic key names because a `pattern` is a hard requirement while
 * a key called "name" is only a hint — getting that order wrong is what made the mock
 * generate "Mock item" for a date-patterned field and fail its own validation.
 */
function constrainedString(node: Record<string, unknown>, prompt: string, key: string): string | null {
  const pattern = typeof node.pattern === "string" ? node.pattern : null;
  const format = typeof node.format === "string" ? node.format : null;

  if (pattern) {
    if (/\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(pattern) || /\d\{4\}-\d\{2\}-\d\{2\}/.test(pattern)) {
      return "2026-11-14";
    }
    // An unrecognised pattern: a bare alphanumeric token satisfies most of them, and the
    // router's one repair attempt covers the rest.
    return "mock";
  }
  if (format === "date") return "2026-11-14";
  if (format === "date-time") return new Date("2026-11-14T09:00:00Z").toISOString();
  if (format === "email") return "someone@example.com";
  if (format === "uri" || format === "url") return "https://example.invalid/mock";
  if (format === "uuid") return "00000000-0000-4000-8000-000000000000";

  // Keys whose value must be usable by the receiving tool, not merely well-typed.
  if (/^expression$/i.test(key)) return expressionFor(prompt);
  if (/^(query|claim|text|source|content|body|message|question)$/i.test(key)) {
    return prompt.slice(0, 400) || "mock input";
  }
  if (/^(to|recipient|email)$/i.test(key)) return "someone@example.com";
  if (/^url$/i.test(key)) return "https://example.invalid/mock";
  if (/^(name|field|column|label|title)$/i.test(key)) return "subject";
  return null;
}

/** Build a value that satisfies a JSON Schema node, biased toward the prompt's words. */
function synthesise(node: Record<string, unknown>, prompt: string, key = ""): unknown {
  const type = node.type as string | string[] | undefined;
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[hash(key + prompt) % node.enum.length];
  if (node.const !== undefined) return node.const;
  // anyOf/oneOf (a nullable or union field): take the first non-null branch.
  for (const union of ["anyOf", "oneOf"] as const) {
    const branches = node[union];
    if (Array.isArray(branches) && branches.length > 0) {
      const branch = branches.find(
        (b) => (b as Record<string, unknown>).type !== "null",
      ) as Record<string, unknown> | undefined;
      if (branch) return synthesise(branch, prompt, key);
    }
  }

  const kind = Array.isArray(type) ? type.find((t) => t !== "null") ?? "string" : type;

  switch (kind) {
    case "object": {
      const props = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
      const declared = (node.required as string[] | undefined) ?? [];
      /**
       * When every property is optional, fill only the first one.
       *
       * Filling them all is what a careless mock does, and it produces contradictory
       * input: `calculate` accepts either an expression or a date operation, and
       * populating both handed it a date operation whose operands were placeholders, so
       * the tool threw. A real model picks one branch, and so does this.
       */
      const required = declared.length > 0 ? declared : Object.keys(props).slice(0, 1);
      const out: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(props)) {
        if (required.includes(name)) out[name] = synthesise(sub, prompt, name);
      }
      return out;
    }
    case "array": {
      const items = (node.items ?? { type: "string" }) as Record<string, unknown>;
      const min = typeof node.minItems === "number" ? node.minItems : 1;
      return Array.from({ length: Math.max(min, 1) }, (_, i) => synthesise(items, prompt, `${key}${i}`));
    }
    case "number":
    case "integer": {
      const min = typeof node.minimum === "number" ? node.minimum : 0;
      const max = typeof node.maximum === "number" ? node.maximum : min + 100;
      const span = Math.max(0, max - min);
      // Confidence-shaped fields get a high value so the mock's results read as usable.
      if (/confidence|score|probability/i.test(key) && min === 0 && max === 1) return 0.9;
      const raw = min + (hash(key + prompt) % (span + 1));
      return kind === "integer" ? Math.round(raw) : raw;
    }
    case "boolean":
      return /^(is|has|should|can|ok|valid|matches)/i.test(key) ? true : hash(key + prompt) % 2 === 0;
    case "null":
      return null;
    default: {
      // Hard constraints and tool-usable keys first; only then fall back to guessing
      // from the field name.
      const constrained = constrainedString(node, prompt, key);
      if (constrained !== null) return constrained;

      if (/reason|explanation|rationale|why/i.test(key)) {
        return "Mock mode: no model was called, so this is a deterministic placeholder rationale.";
      }
      if (/verdict/i.test(key)) return "supported";
      if (/date|when|deadline|deliverat/i.test(key)) return "2026-11-14";
      if (/summary|answer|evidence/i.test(key)) {
        return `Mock mode summary of: ${prompt.slice(0, 120)}`;
      }
      if (/description/i.test(key)) return "a value read from the source text";
      return `mock ${key || "value"}`.trim();
    }
  }
}

function finalAnswer(prompt: string, results: { name: string; content: string }[]): string {
  const lines = [
    `Mock mode — no model was called, so this answer is generated locally from the tools that ran.`,
    ``,
    `You asked: ${prompt.slice(0, 200)}`,
  ];
  if (results.length > 0) {
    lines.push(``, `What the tools returned:`);
    for (const r of results) {
      const summary = r.content.length > 160 ? `${r.content.slice(0, 157)}…` : r.content;
      lines.push(`- \`${r.name}\`: ${summary}`);
    }
  }
  lines.push(
    ``,
    `Set an API key and LLM_MODE=live for a real answer; everything else in this run — the`,
    `tool calls, the rules, the approvals — is the same code path a live model drives.`,
  );
  return lines.join("\n");
}

export const mockProvider: Provider = {
  id: "mock",
  keyEnv: "",
  isConfigured: () => true,
  handles: () => true,

  async generate(_model: string, req: ProviderRequest): Promise<ProviderResponse> {
    const prompt = lastUserText(req.messages);

    // A schema request is a single-shot structured call, not a loop: answer it directly.
    if (req.jsonSchema) {
      const obj = synthesise(req.jsonSchema, prompt);
      const text = JSON.stringify(obj);
      return {
        text,
        toolCalls: [],
        stopReason: "end",
        tokens: { input: Math.ceil(prompt.length / 4), output: Math.ceil(text.length / 4) },
      };
    }

    const offered = req.tools ?? [];
    if (offered.length > 0) {
      const already = calledTools(req.messages);
      const next = plan(prompt, offered).find((name) => !already.has(name));
      if (next) {
        const spec = req.tools!.find((t) => t.name === next)!;
        const input = synthesise(
          (spec.inputSchema ?? { type: "object" }) as Record<string, unknown>,
          prompt,
        );
        const call: ToolCall = { id: `mock-${already.size}-${next}`, name: next, input };
        return {
          text: `I'll use \`${next}\` for this.`,
          toolCalls: [call],
          stopReason: "tool_use",
          tokens: { input: Math.ceil(prompt.length / 4), output: 24 },
        };
      }
    }

    const text = finalAnswer(prompt, toolResults(req.messages));
    return {
      text,
      toolCalls: [],
      stopReason: "end",
      tokens: { input: Math.ceil(prompt.length / 4), output: Math.ceil(text.length / 4) },
    };
  },
};
