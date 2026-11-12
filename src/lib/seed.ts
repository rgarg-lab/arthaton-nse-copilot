import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { agentSessions, chunks, documents, memoryItems, outbox, type Db } from "@/db";
import { embed } from "@/lib/llm/embed";

/**
 * Demo data. A seed file is the thing standing between a cold database and a demo that
 * looks lived-in, so it is a plain JSON file an idea can rewrite wholesale, validated on
 * the way in.
 */
export const SeedSchema = z.object({
  /** Shown in the demo banner so it is obvious which seed is loaded. */
  label: z.string().min(1),
  sessionTitle: z.string().min(1).default("Demo session"),
  memory: z
    .array(
      z.object({
        type: z.enum(["fact", "preference", "correction", "note"]),
        content: z.string().min(1),
        source: z.string().nullable().default(null),
        metadata: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
  documents: z
    .array(
      z.object({
        title: z.string().min(1),
        kind: z.enum(["file", "url", "paste"]).default("paste"),
        sourceRef: z.string().nullable().default(null),
        chunks: z.array(z.string().min(1)).min(1),
      }),
    )
    .default([]),
  outbox: z
    .array(
      z.object({
        connector: z.string().min(1).default("mock"),
        kind: z.string().min(1),
        body: z.string().min(1),
        status: z.enum(["queued", "delivered", "failed"]).default("delivered"),
      }),
    )
    .default([]),
});

export type Seed = z.infer<typeof SeedSchema>;

export const SEED_DIR = "seed";

export async function loadSeedFile(name: string): Promise<Seed> {
  // Defend the path: a seed name comes from config, but "Load demo" is a request away.
  const safe = path.basename(name).replace(/\.json$/i, "");
  const raw = await readFile(path.join(process.cwd(), SEED_DIR, `${safe}.json`), "utf8");
  return SeedSchema.parse(JSON.parse(raw));
}

export type SeedResult = {
  label: string;
  sessionId: string;
  memory: number;
  documents: number;
  chunks: number;
  outbox: number;
};

/**
 * Insert a seed and return the session it created. Idempotent only in the sense that it
 * always makes a *new* session — loading the demo twice gives two clean sessions rather
 * than duplicating rows inside one.
 */
export async function applySeed(handle: Db, seed: Seed): Promise<SeedResult> {
  const [session] = await handle
    .insert(agentSessions)
    .values({ title: seed.sessionTitle, llmMode: process.env.LLM_MODE ?? "mock" })
    .returning();

  let chunkCount = 0;

  if (seed.memory.length > 0) {
    const rows = await Promise.all(
      seed.memory.map(async (m) => ({
        sessionId: session.id,
        type: m.type,
        content: m.content,
        source: m.source,
        metadata: m.metadata,
        embedding: await embed(m.content),
      })),
    );
    await handle.insert(memoryItems).values(rows);
  }

  for (const doc of seed.documents) {
    const [row] = await handle
      .insert(documents)
      .values({
        sessionId: session.id,
        title: doc.title,
        kind: doc.kind,
        sourceRef: doc.sourceRef,
        bytes: doc.chunks.join("").length,
      })
      .returning();
    const chunkRows = await Promise.all(
      doc.chunks.map(async (content, ordinal) => ({
        documentId: row.id,
        ordinal,
        content,
        embedding: await embed(content),
      })),
    );
    await handle.insert(chunks).values(chunkRows);
    chunkCount += chunkRows.length;
  }

  if (seed.outbox.length > 0) {
    await handle.insert(outbox).values(
      seed.outbox.map((o) => ({
        sessionId: session.id,
        connector: o.connector,
        kind: o.kind,
        body: o.body,
        status: o.status,
        deliveredAt: o.status === "delivered" ? new Date() : null,
      })),
    );
  }

  return {
    label: seed.label,
    sessionId: session.id,
    memory: seed.memory.length,
    documents: seed.documents.length,
    chunks: chunkCount,
    outbox: seed.outbox.length,
  };
}
