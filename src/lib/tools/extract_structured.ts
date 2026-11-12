import { z } from "zod";
import { generate } from "@/lib/llm/router";
import type { Tool } from "@/lib/agent/types";

/**
 * Messy text in, structured JSON out, against a shape the *caller* supplies at call time.
 *
 * The schema is a parameter rather than a fixture because the template has no domain: an
 * idea's "extract the expenses" and "extract the action items" are the same operation
 * over a different shape. The model is handed a field spec and must fill it; the result
 * is validated before it is returned.
 */

const FieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "date"]),
  description: z.string().min(1),
  required: z.boolean().default(true),
});

const Input = z.object({
  text: z.string().min(1).max(50_000).describe("The source text to read."),
  fields: z
    .array(FieldSchema)
    .min(1)
    .max(20)
    .describe("The fields to pull out. Describe each one as you would to a careful intern."),
  /** Several records (a CSV paste, a list of items) rather than one. */
  many: z.boolean().default(false).describe("True when the text contains multiple records."),
});

/** Build the zod shape the extraction must satisfy, from the field spec. */
function schemaFor(fields: z.infer<typeof FieldSchema>[], many: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case "number":
        base = z.number();
        break;
      case "boolean":
        base = z.boolean();
        break;
      case "date":
        // A string, not z.date(): the model returns JSON, and an ISO date is checkable.
        base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be yyyy-mm-dd");
        break;
      default:
        base = z.string();
    }
    shape[field.name] = field.required ? base : base.nullable().optional();
  }
  const record = z.object(shape);
  return many ? z.object({ records: z.array(record) }) : z.object({ records: z.array(record).length(1) });
}

export const extractStructuredTool: Tool<typeof Input> = {
  name: "extract_structured",
  description:
    "Read messy text and return structured records matching the fields you specify. Use it for " +
    "pastes, transcripts, CSV dumps and documents. Always follow it with `verify` before you " +
    "present any extracted value as a fact.",
  inputSchema: Input,

  async run(input, ctx) {
    const schema = schemaFor(input.fields, input.many);
    const spec = input.fields
      .map((f) => `- ${f.name} (${f.type}${f.required ? ", required" : ", optional"}): ${f.description}`)
      .join("\n");

    const result = await generate({
      sessionId: ctx.sessionId,
      system:
        "You extract structured data from text. Copy values from the source; never invent one. " +
        "If a required value is genuinely absent, use an empty string for text, 0 for a number, " +
        "and say so in your reasoning rather than guessing. Dates must be yyyy-mm-dd. " +
        "Return JSON only.",
      messages: [
        {
          role: "user",
          content: `Fields to extract:\n${spec}\n\n${input.many ? "There may be several records." : "There is exactly one record."}\n\nSource text:\n"""\n${input.text}\n"""`,
        },
      ],
      schema,
      // Cached on the text and the field list: re-running an extraction during a demo
      // should be instant and identical.
      cacheKey: `extract:${input.many}:${JSON.stringify(input.fields)}:${input.text.slice(0, 2000)}`,
      maxTokens: 2048,
    });

    return {
      records: result.data.records,
      count: result.data.records.length,
      model: result.model,
      fromCache: result.fromCache,
      /** The caller should pass this to `verify` rather than trusting it. */
      unverified: true,
    };
  },
};
