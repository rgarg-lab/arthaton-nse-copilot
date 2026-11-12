import { z } from "zod";
import { sql } from "drizzle-orm";
import { rows } from "@/db";
import { embed } from "@/lib/llm/embed";
import type { Tool } from "@/lib/agent/types";
import { env } from "@/lib/env";

/**
 * Retrieval over ingested documents, with citations.
 *
 * Citations are not decoration: an answer that names its chunk and document is one a
 * judge can check in ten seconds, and it is the difference between "the agent said" and
 * "the agent showed". Every hit carries the document title and chunk ordinal.
 */

const RagInput = z.object({
  query: z.string().min(1).max(1_000).describe("What you need from the ingested documents."),
  limit: z.number().int().min(1).max(10).default(4),
  documentId: z.string().uuid().optional().describe("Restrict to one document. Omit to search all."),
});

export type Citation = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  ordinal: number;
  content: string;
  distance: number | null;
  matchedBy: "keyword" | "vector" | "both";
};

export const ragLookupTool: Tool<typeof RagInput> = {
  name: "rag_lookup",
  description:
    "Search the documents the user has ingested and return passages with citations. Use it " +
    "before answering anything about an uploaded file or fetched page. Quote the passage and " +
    "name its document; never answer from memory of a document you did not retrieve.",
  inputSchema: RagInput,

  async run(input, ctx) {
    if (!ctx.db) return { citations: [], note: "no database in this context" };

    const vector = JSON.stringify(await embed(input.query));
    const docFilter = input.documentId ? sql`and c.document_id = ${input.documentId}` : sql``;
    const sessionFilter = sql`and (d.session_id = ${ctx.sessionId} or d.session_id is null)`;

    // Same two-channel union as memory search, for the same reason: keyword search has
    // tokenisation blind spots, vector search has vocabulary blind spots.
    const found = await rows<{
      document_id: string;
      document_title: string;
      chunk_id: string;
      ordinal: number;
      content: string;
      distance: number | null;
      keyword_hit: boolean;
      vector_hit: boolean;
    }>(
      ctx.db,
      sql`
        with scoped as (
          select c.id, c.document_id, c.ordinal, c.content, c.embedding, c.searchable, d.title
          from chunks c join documents d on d.id = c.document_id
          where true ${docFilter} ${sessionFilter}
        ),
        keyword as (
          select id, true as keyword_hit from scoped
          where searchable @@ plainto_tsquery('english', ${input.query})
          limit ${input.limit}
        ),
        vector as (
          select id, true as vector_hit, embedding <=> ${vector}::vector as distance
          from scoped where embedding is not null
          order by distance asc limit ${input.limit}
        )
        select s.document_id, s.title as document_title, s.id as chunk_id, s.ordinal, s.content,
               v.distance,
               coalesce(k.keyword_hit, false) as keyword_hit,
               coalesce(v.vector_hit, false) as vector_hit
        from scoped s
        left join keyword k on k.id = s.id
        left join vector v on v.id = s.id
        where k.keyword_hit is true or v.vector_hit is true
        order by (case when k.keyword_hit then 0 else 1 end), v.distance asc nulls last
        limit ${input.limit}
      `,
    );

    const citations: Citation[] = found.map((r) => ({
      documentId: r.document_id,
      documentTitle: r.document_title,
      chunkId: r.chunk_id,
      ordinal: Number(r.ordinal),
      content: r.content,
      distance: r.distance === null ? null : Number(r.distance),
      matchedBy: r.keyword_hit && r.vector_hit ? "both" : r.keyword_hit ? "keyword" : "vector",
    }));

    return { citations, count: citations.length };
  },
};

const WebSearchInput = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});

/**
 * Web search through Tavily when a key exists, deterministic placeholders otherwise.
 *
 * The mock results are labelled as mock in their own title and body. A plausible-looking
 * fake search result is worse than an obvious one: it could end up quoted in a demo as
 * though it were real.
 */
export const webSearchTool: Tool<typeof WebSearchInput> = {
  name: "web_search",
  description:
    "Search the web for current information. Returns titles, URLs and snippets. Cite the URL " +
    "for anything you take from here, and prefer `fetch_url` when you need the full page.",
  inputSchema: WebSearchInput,

  async run(input) {
    const key = env("TAVILY_API_KEY");
    if (!key) {
      return {
        mock: true,
        results: Array.from({ length: Math.min(input.limit, 3) }, (_, i) => ({
          title: `[MOCK RESULT ${i + 1}] no TAVILY_API_KEY is set`,
          url: `https://example.invalid/mock/${i + 1}`,
          snippet:
            `This is a placeholder search result for "${input.query}". No web search was performed. ` +
            `Set TAVILY_API_KEY to search for real. Do not present this as a real source.`,
        })),
      };
    }

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: input.query, max_results: input.limit }),
      });
      if (!res.ok) throw new Error(`tavily ${res.status}`);
      const json = (await res.json()) as {
        results?: { title: string; url: string; content: string }[];
      };
      return {
        mock: false,
        results: (json.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        })),
      };
    } catch (err) {
      // Degrade rather than fail the whole agent run on a flaky third party.
      return {
        mock: true,
        error: (err as Error).message,
        results: [],
        note: "web search failed; answer without it and say the search was unavailable",
      };
    }
  },
};

const FetchUrlInput = z.object({
  url: z.string().url().describe("An http(s) URL."),
  maxChars: z.number().int().min(500).max(50_000).default(10_000),
});

/** Strip a page to something a model can read, without pulling in a parser dependency. */
export function extractReadableText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block-level tags become paragraph breaks so the text keeps some structure.
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  return { title, text };
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

export const fetchUrlTool: Tool<typeof FetchUrlInput> = {
  name: "fetch_url",
  description:
    "Fetch a web page and return its readable text. Use it when the user gives a URL or when a " +
    "search snippet is not enough. Cite the URL for anything you quote.",
  inputSchema: FetchUrlInput,

  async run(input) {
    const parsed = new URL(input.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("only http and https URLs are allowed");
    }
    try {
      const res = await fetch(input.url, {
        headers: { "user-agent": "hackathon-template/1.0 (+agent fetch_url)" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, url: input.url, note: `fetch returned ${res.status}` };
      }
      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      if (contentType.includes("application/json")) {
        return { ok: true, url: input.url, contentType, text: raw.slice(0, input.maxChars) };
      }
      const { title, text } = extractReadableText(raw);
      return {
        ok: true,
        url: input.url,
        title,
        contentType,
        text: text.slice(0, input.maxChars),
        truncated: text.length > input.maxChars,
      };
    } catch (err) {
      return { ok: false, url: input.url, error: (err as Error).message };
    }
  },
};

const MlPredictInput = z.object({
  /** Free-form: whatever the configured endpoint expects. */
  features: z.record(z.string(), z.unknown()).describe("The input record to score."),
  task: z.string().min(1).max(100).describe("What is being predicted, e.g. 'churn_risk'."),
});

/**
 * The slot for a real model: a local endpoint, a Hugging Face Inference call, anything
 * that speaks JSON over HTTP. Mocked by default with an explicitly-labelled result, so an
 * idea that wants "and we also trained a model" has somewhere to put it.
 */
export const mlPredictTool: Tool<typeof MlPredictInput> = {
  name: "ml_predict",
  description:
    "Score a record with the configured prediction endpoint. Returns a label and a score. " +
    "Say the prediction is a model output, not a certainty.",
  inputSchema: MlPredictInput,

  async run(input) {
    const endpoint = env("ML_ENDPOINT");
    if (!endpoint) {
      // Deterministic from the input so a demo is reproducible, and loudly labelled.
      const digest = JSON.stringify(input.features).length;
      return {
        mock: true,
        task: input.task,
        label: digest % 2 === 0 ? "low" : "high",
        score: Number(((digest % 100) / 100).toFixed(2)),
        note: "MOCK PREDICTION — no ML_ENDPOINT configured. Do not present as a real model output.",
      };
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.ML_API_KEY ? { authorization: `Bearer ${process.env.ML_API_KEY}` } : {}),
        },
        body: JSON.stringify({ task: input.task, features: input.features }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`endpoint ${res.status}`);
      return { mock: false, task: input.task, ...(await res.json()) };
    } catch (err) {
      return { mock: true, task: input.task, error: (err as Error).message, note: "prediction endpoint failed" };
    }
  },
};
