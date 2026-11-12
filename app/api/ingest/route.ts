import { z } from "zod";
import { currentUser } from "@/auth";
import { agentSessions, chunks, db, documents } from "@/db";
import { jsonError } from "@/lib/api";
import { config } from "@/lib/config";
import { chunkText, extensionOf, parseFile } from "@/lib/input/adapters";
import { embedAll } from "@/lib/llm/embed";
import { cleanText } from "@/lib/tools/clean_input";
import { fetchUrlTool } from "@/lib/tools/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Keep a stray 200MB upload from taking the function down. */
const MAX_BYTES = 10 * 1024 * 1024;

const TextBody = z.object({
  kind: z.literal("text"),
  text: z.string().min(1).max(200_000),
  title: z.string().max(200).optional(),
  sessionId: z.string().uuid().optional(),
});

const UrlBody = z.object({
  kind: z.literal("url"),
  url: z.string().url(),
  sessionId: z.string().uuid().optional(),
});

/**
 * POST /api/ingest — take text, a URL or a file and make it retrievable.
 *
 * Accepts JSON for text and URL, multipart for files. Everything ends up the same way: a
 * `documents` row plus embedded `chunks`, which is what `rag_lookup` searches.
 *
 * Text input also comes back cleaned, with the diff, so the UI can show raw vs cleaned
 * before anything is stored — the user should see what was changed on their behalf.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const user = await currentUser();

  let handle;
  try {
    handle = await db();
  } catch (err) {
    console.error("ingest: database unavailable", err);
    return jsonError(503, "Database unavailable");
  }

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError(400, "Expected a `file` field");
      if (file.size > MAX_BYTES) {
        return jsonError(413, `File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
      }

      const accepted = config().inputs.acceptedFileTypes;
      const ext = extensionOf(file.name);
      if (accepted.length > 0 && !accepted.includes(ext)) {
        return jsonError(415, `This idea accepts ${accepted.join(", ")}; got "${ext || "no extension"}"`);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseFile(file.name, bytes);
      if (!parsed.text.trim()) {
        return jsonError(422, `Could not read any text out of ${file.name}`, parsed.metadata);
      }

      const sessionId = await ensureSession(handle, form.get("sessionId"), user?.id ?? null);
      const stored = await store(handle, {
        sessionId,
        title: file.name,
        kind: "file",
        sourceRef: file.name,
        text: parsed.text,
        bytes: file.size,
      });
      return Response.json({ ...stored, format: parsed.format, reliable: parsed.reliable, metadata: parsed.metadata });
    }

    const raw: unknown = await request.json();
    const parsedBody = z.discriminatedUnion("kind", [TextBody, UrlBody]).safeParse(raw);
    if (!parsedBody.success) {
      return jsonError(400, "Invalid request body", z.treeifyError(parsedBody.error));
    }
    const body = parsedBody.data;
    const sessionId = await ensureSession(handle, body.sessionId ?? null, user?.id ?? null);

    if (body.kind === "url") {
      const fetched = (await fetchUrlTool.run(
        { url: body.url, maxChars: 50_000 },
        // The tool only needs these fields for this call; it does not emit or touch the db.
        { sessionId, userId: user?.id ?? null, db: handle, config: config(), emit: async (e) => ({ ...e, seq: 0, at: "" }), mock: false },
      )) as { ok: boolean; title?: string; text?: string; error?: string; status?: number };
      if (!fetched.ok || !fetched.text?.trim()) {
        return jsonError(422, `Could not read ${body.url}`, { error: fetched.error, status: fetched.status });
      }
      const stored = await store(handle, {
        sessionId,
        title: fetched.title || body.url,
        kind: "url",
        sourceRef: body.url,
        text: fetched.text,
        bytes: fetched.text.length,
      });
      return Response.json({ ...stored, format: "url" });
    }

    // Text: clean first and return the diff, so the UI can show what changed.
    const cleaned = cleanText(body.text);
    const stored = await store(handle, {
      sessionId,
      title: body.title || `Pasted text ${new Date().toISOString().slice(0, 16)}`,
      kind: "paste",
      sourceRef: null,
      text: cleaned.cleaned,
      bytes: body.text.length,
    });
    return Response.json({
      ...stored,
      format: "text",
      raw: cleaned.raw,
      cleaned: cleaned.cleaned,
      changes: cleaned.changes,
      cleanConfidence: cleaned.confidence,
    });
  } catch (err) {
    console.error("ingest failed:", err);
    return jsonError(500, "Ingestion failed", { error: (err as Error).message });
  }
}

async function ensureSession(
  handle: Awaited<ReturnType<typeof db>>,
  given: FormDataEntryValue | string | null,
  userId: string | null,
): Promise<string> {
  const candidate = typeof given === "string" ? given : null;
  if (candidate && z.uuid().safeParse(candidate).success) return candidate;
  const [row] = await handle.insert(agentSessions).values({ userId }).returning({ id: agentSessions.id });
  return row.id;
}

async function store(
  handle: Awaited<ReturnType<typeof db>>,
  args: {
    sessionId: string;
    title: string;
    kind: "file" | "url" | "paste";
    sourceRef: string | null;
    text: string;
    bytes: number;
  },
) {
  const [doc] = await handle
    .insert(documents)
    .values({
      sessionId: args.sessionId,
      title: args.title,
      kind: args.kind,
      sourceRef: args.sourceRef,
      bytes: args.bytes,
    })
    .returning({ id: documents.id });

  const pieces = chunkText(args.text);
  if (pieces.length > 0) {
    const vectors = await embedAll(pieces);
    await handle.insert(chunks).values(
      pieces.map((content, ordinal) => ({
        documentId: doc.id,
        ordinal,
        content,
        embedding: vectors[ordinal],
      })),
    );
  }

  return { sessionId: args.sessionId, documentId: doc.id, title: args.title, chunks: pieces.length };
}
