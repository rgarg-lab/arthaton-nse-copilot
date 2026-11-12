import { z } from "zod";
import type { Tool } from "@/lib/agent/types";

/**
 * Turn dictated or pasted text into what the speaker meant, and keep the evidence.
 *
 * Dictation is the input mode the template is built for, and dictated text has two
 * properties worth handling in code: fillers ("um", "you know") and self-corrections
 * ("Friday, no wait, Monday"). The correction case is the interesting one — resolving it
 * wrongly silently changes the meaning, so the diff is returned alongside the result and
 * shown raw-vs-cleaned in the UI.
 *
 * Deterministic on purpose: the same utterance always cleans the same way, so what a
 * judge sees in a rehearsal is what they see in the recording.
 */

const Input = z.object({
  text: z.string().min(1).max(20_000).describe("The raw text, as typed or dictated."),
});

/**
 * Fillers that are never anything else. Safe to strip wherever they appear as a word.
 */
const ALWAYS_FILLERS = ["um", "uh", "erm", "uhm", "hmm"];

/**
 * Fillers that are also ordinary words — "like" is a verb, "right" is a direction,
 * "actually" can carry real contrast. These are stripped only when punctuation marks them
 * as discourse filler: bounded by a comma, or sitting at the very start or end of the
 * utterance.
 *
 * The conservative direction is deliberate. Leaving a filler in costs nothing; deleting
 * the verb from "I like the second option" changes what the user said.
 */
const COMMA_FILLERS = [
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "literally",
  "actually",
  "right",
  "so yeah",
  "so",
  "well",
];

/** Phrases that announce a correction: everything before them is retracted. */
const CORRECTION_MARKERS = [
  "no wait",
  "no, wait",
  "wait no",
  "sorry i meant",
  "sorry, i meant",
  "i meant",
  "scratch that",
  "correction",
  "make that",
  "no sorry",
  "actually no",
  "rather",
];

export type Change = {
  kind: "filler" | "correction" | "whitespace" | "duplicate";
  removed: string;
  replacement?: string;
  note: string;
};

export type CleanResult = {
  raw: string;
  cleaned: string;
  changes: Change[];
  /** Low when a lot was changed: the UI should ask rather than assume. */
  confidence: number;
};

const SEPARATORS = [",", ";", " and ", " or ", " on ", " by ", " is ", " to "];

/**
 * Find where the retracted fragment starts inside the text preceding the marker.
 *
 * Scope matters here. Too wide and the correction eats real content ("Invite Priya and
 * Sam, no wait, Alex" must keep Priya); too narrow and it leaves the retracted value in
 * place. The rule: cut at the last clause separator, and if there is none, retract just
 * the final word — which is what a correction almost always targets.
 */
function retractionStart(before: string): number {
  let best = -1;
  for (const sep of SEPARATORS) {
    const idx = before.toLowerCase().lastIndexOf(sep);
    if (idx >= 0 && idx + sep.length > best) best = idx + sep.length;
  }
  if (best >= 0) return best;
  const lastWord = /\S+$/.exec(before);
  return lastWord ? lastWord.index : 0;
}

function findMarker(text: string): { index: number; length: number; marker: string } | null {
  let found: { index: number; length: number; marker: string } | null = null;
  for (const marker of CORRECTION_MARKERS) {
    const pattern = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[,:]?\\s*`, "i");
    const match = pattern.exec(text);
    // Earliest marker wins, so chained corrections resolve left to right.
    if (match && (found === null || match.index < found.index)) {
      found = { index: match.index, length: match[0].length, marker };
    }
  }
  return found;
}

/**
 * Resolve self-corrections: the marker retracts what came before it and what follows
 * takes its place.
 *
 * Anything it cannot resolve confidently is left alone and reported rather than guessed
 * at — a wrong resolution silently changes meaning, which is worse than no resolution.
 */
function resolveCorrections(text: string, changes: Change[]): string {
  let result = text;

  // Chained corrections ("Friday, no wait Monday, sorry I meant Tuesday") need repeated
  // passes; the bound stops a pathological input from spinning.
  for (let pass = 0; pass < 8; pass += 1) {
    const found = findMarker(result);
    if (!found) break;

    const rawBefore = result.slice(0, found.index);
    const after = result.slice(found.index + found.length);
    if (!after.trim()) break;

    // Drop the separator that led into the marker ("Friday, no wait" → "Friday").
    const before = rawBefore.replace(/[\s,;:]+$/, "");
    if (!before) break;

    const start = retractionStart(before);
    const retracted = before.slice(start).trim();
    if (!retracted) break;

    const replacementMatch = /^[^,.;!?]+/.exec(after);
    const replacementRaw = replacementMatch ? replacementMatch[0] : after;
    const replacement = replacementRaw.trim();
    if (!replacement) break;

    const head = before.slice(0, start);
    const tail = after.slice(replacementRaw.length);
    result = `${head}${replacement}${tail}`.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();

    changes.push({
      kind: "correction",
      removed: retracted,
      replacement,
      note: `"${retracted}" was retracted by "${found.marker}" and replaced with "${replacement}"`,
    });
  }

  return result;
}

export function cleanText(raw: string): CleanResult {
  const changes: Change[] = [];
  let text = raw;

  text = resolveCorrections(text, changes);

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Unambiguous fillers: strip wherever they stand as their own word.
  for (const filler of ALWAYS_FILLERS) {
    const pattern = new RegExp(`(^|[\\s,.!?])${escape(filler)}\\b[,]?\\s*`, "gi");
    const before = text;
    text = text.replace(pattern, (_m, lead: string) => (/^[\s]*$/.test(lead) ? " " : `${lead} `));
    if (before !== text) {
      changes.push({ kind: "filler", removed: filler, note: `removed filler "${filler}"` });
    }
  }

  // Ambiguous fillers: only where punctuation marks them as filler rather than content.
  for (const filler of COMMA_FILLERS) {
    const f = escape(filler);
    const patterns = [
      // Start of the utterance, followed by a comma: "So, send it" / "Well, maybe".
      new RegExp(`^\\s*${f}\\s*,\\s*`, "i"),
      // Mid-sentence, comma on both sides: "send it, you know, tomorrow".
      new RegExp(`,\\s*${f}\\s*,\\s*`, "gi"),
      // Trailing, after a comma: "tomorrow, you know."
      new RegExp(`,\\s*${f}\\s*(?=[.!?]|$)`, "gi"),
    ];
    const replacements = ["", ", ", ""];
    for (let i = 0; i < patterns.length; i += 1) {
      const before = text;
      text = text.replace(patterns[i], replacements[i]);
      if (before !== text) {
        changes.push({ kind: "filler", removed: filler, note: `removed filler "${filler}"` });
      }
    }
  }

  // "the the", "I I" — a dictation artefact, not emphasis.
  const deduped = text.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  if (deduped !== text) {
    changes.push({ kind: "duplicate", removed: "repeated word", note: "collapsed a repeated word" });
    text = deduped;
  }

  const tidied = text.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  if (tidied !== text) {
    changes.push({ kind: "whitespace", removed: "extra spacing", note: "normalised spacing" });
    text = tidied;
  }

  // If cleaning consumed everything, the input was pure filler — keep the original rather
  // than handing the agent an empty string, and say so.
  if (!text.trim() && raw.trim()) {
    return {
      raw,
      cleaned: raw.trim(),
      changes: [
        {
          kind: "filler",
          removed: "(nothing)",
          note: "the input was entirely filler, so it was left as-is",
        },
      ],
      confidence: 0.5,
    };
  }

  // Confidence falls with how much was changed, and falls fastest for corrections, which
  // are the edits that can change meaning rather than just tidy it.
  const corrections = changes.filter((c) => c.kind === "correction").length;
  const ratio = raw.length > 0 ? Math.abs(raw.length - text.length) / raw.length : 0;
  const confidence = Math.max(0.3, Math.min(1, 1 - corrections * 0.15 - ratio * 0.4));

  return { raw, cleaned: text, changes, confidence: Math.round(confidence * 100) / 100 };
}

export const cleanInputTool: Tool<typeof Input> = {
  name: "clean_input",
  description:
    "Normalise messy or dictated text: strip fillers and resolve self-corrections such as " +
    '"Friday, no wait, Monday". Call this first on anything the user typed or dictated. ' +
    "Returns the cleaned text plus a list of what changed, so the user can see the edits.",
  inputSchema: Input,

  async run(input) {
    return cleanText(input.text);
  },
};
