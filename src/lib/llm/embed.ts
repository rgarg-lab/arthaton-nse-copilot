import { EMBEDDING_DIM } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Embeddings, with a deterministic local fallback.
 *
 * The mock is not a pretend vector: it is a hashed bag-of-words projection, so the same
 * text always gives the same vector and texts sharing words land closer together than
 * texts that share none. That is enough for `search_memory` to behave sensibly — and to
 * be *testable* — with no embedding key anywhere.
 *
 * Set `EMBED_PROVIDER=voyage|openai` plus its key to use a real one.
 */

function hash(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** L2-normalised, so cosine distance is a straight dot product. */
function normalise(v: number[]): number[] {
  const len = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return len === 0 ? v : v.map((x) => x / len);
}

export function mockEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = hash(token);
    // Two buckets per token with opposite signs: collisions stay survivable and the
    // vector does not drift positive as text gets longer.
    v[h % EMBEDDING_DIM] += 1;
    v[(h >>> 8) % EMBEDDING_DIM] -= 1;
  }
  return normalise(v);
}

export function embeddingProvider(): "mock" | "voyage" | "openai" {
  const want = env("EMBED_PROVIDER");
  if (want === "voyage" && env("VOYAGE_API_KEY")) return "voyage";
  if (want === "openai" && env("OPENAI_API_KEY")) return "openai";
  return "mock";
}

/**
 * Embed one string. Real providers are called through `fetch` rather than their SDKs so
 * the template carries no extra dependency for a slot most ideas never fill; a provider
 * failure degrades to the mock rather than taking the request down.
 */
export async function embed(text: string): Promise<number[]> {
  const provider = embeddingProvider();
  if (provider === "mock") return mockEmbed(text);
  try {
    if (provider === "voyage") {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          input: [text],
          model: env("EMBED_MODEL") ?? "voyage-3-lite",
          output_dimension: EMBEDDING_DIM,
        }),
      });
      if (!res.ok) throw new Error(`voyage ${res.status}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      return json.data[0].embedding;
    }
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: text,
        model: env("EMBED_MODEL") ?? "text-embedding-3-small",
        dimensions: EMBEDDING_DIM,
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  } catch (err) {
    console.warn(`embedding provider ${provider} failed, falling back to mock:`, err);
    return mockEmbed(text);
  }
}

export async function embedAll(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(embed));
}
