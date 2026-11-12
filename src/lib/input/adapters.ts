/**
 * Turn whatever the user dropped in into text the agent can read.
 *
 * Deliberately thin on dependencies: plain text, CSV, JSON and subtitle formats are
 * handled natively, PDF goes through `unpdf` (serverless-friendly, no native binary) and
 * DOCX is a zip containing XML, which `fflate` plus tag-stripping handles in a few lines.
 * Anything unrecognised is decoded as UTF-8 and reported as best-effort rather than
 * rejected, because a judge dropping an odd file mid-demo should still get something.
 */

export type ParsedInput = {
  text: string;
  /** What the adapter believes it parsed; shown in the ingest result. */
  format: string;
  metadata: Record<string, unknown>;
  /** False when the text is a best-effort decode rather than a real parse. */
  reliable: boolean;
};

export const SUPPORTED_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".json",
  ".vtt",
  ".srt",
  ".pdf",
  ".docx",
] as const;

export function extensionOf(name: string): string {
  const match = /\.[a-z0-9]+$/i.exec(name.trim());
  return match ? match[0].toLowerCase() : "";
}

/** VTT/SRT: keep the words, drop the timings and cue numbers. */
export function parseSubtitles(raw: string): { text: string; cues: number } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let cues = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "WEBVTT" || trimmed.startsWith("NOTE ")) continue;
    // "00:00:01.000 --> 00:00:04.000" and bare cue numbers carry no content.
    if (/-->/.test(trimmed)) {
      cues += 1;
      continue;
    }
    if (/^\d+$/.test(trimmed)) continue;
    // Strip VTT inline tags like <v Speaker> and <00:00:01.000>.
    out.push(trimmed.replace(/<[^>]*>/g, "").trim());
  }
  // Consecutive duplicate lines are a rolling-caption artefact, not repetition.
  const deduped = out.filter((line, i) => line !== out[i - 1]);
  return { text: deduped.join("\n"), cues };
}

/** CSV/TSV: a readable table, not a raw dump — the model reads prose better than commas. */
export function parseDelimited(raw: string, delimiter: string): { text: string; rows: number; columns: string[] } {
  const lines = raw.replace(/\r\n/g, "\n").trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { text: "", rows: 0, columns: [] };

  const split = (line: string): string[] => {
    // Minimal quoted-field handling: enough for exported spreadsheets.
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (ch === delimiter && !quoted) {
        cells.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  };

  const columns = split(lines[0]);
  const body = lines.slice(1).map(split);
  // Rendered as "column: value" per record: unambiguous for a model, and it survives
  // ragged rows, which a fixed-width table does not.
  const text = body
    .map(
      (row, i) =>
        `Record ${i + 1}:\n` +
        columns.map((col, c) => `  ${col}: ${row[c] ?? ""}`).join("\n"),
    )
    .join("\n\n");
  return { text, rows: body.length, columns };
}

export async function parsePdf(bytes: Uint8Array): Promise<ParsedInput> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n\n") : text;
    return {
      text: merged.trim(),
      format: "pdf",
      metadata: { pages: totalPages },
      // A scanned PDF parses to almost nothing; say so rather than returning silence.
      reliable: merged.trim().length > 0,
    };
  } catch (err) {
    return {
      text: "",
      format: "pdf",
      metadata: { error: (err as Error).message },
      reliable: false,
    };
  }
}

export async function parseDocx(bytes: Uint8Array): Promise<ParsedInput> {
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes);
    const entry = files["word/document.xml"];
    if (!entry) throw new Error("not a Word document (no word/document.xml)");
    const xml = strFromU8(entry);
    const text = xml
      // Paragraph and line breaks become real breaks before tags are stripped.
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\s*\/?>/g, "\n")
      .replace(/<w:tab\s*\/?>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { text, format: "docx", metadata: {}, reliable: text.length > 0 };
  } catch (err) {
    return { text: "", format: "docx", metadata: { error: (err as Error).message }, reliable: false };
  }
}

/** The one entry point: bytes plus a filename in, text out. */
export async function parseFile(name: string, bytes: Uint8Array): Promise<ParsedInput> {
  const ext = extensionOf(name);
  const decode = () => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  switch (ext) {
    case ".pdf":
      return parsePdf(bytes);
    case ".docx":
      return parseDocx(bytes);
    case ".csv": {
      const { text, rows, columns } = parseDelimited(decode(), ",");
      return { text, format: "csv", metadata: { rows, columns }, reliable: true };
    }
    case ".tsv": {
      const { text, rows, columns } = parseDelimited(decode(), "\t");
      return { text, format: "tsv", metadata: { rows, columns }, reliable: true };
    }
    case ".vtt":
    case ".srt": {
      const { text, cues } = parseSubtitles(decode());
      return { text, format: ext.slice(1), metadata: { cues }, reliable: true };
    }
    case ".json": {
      const raw = decode();
      try {
        // Re-indented: a model reads formatted JSON far better than one long line.
        return {
          text: JSON.stringify(JSON.parse(raw), null, 2),
          format: "json",
          metadata: {},
          reliable: true,
        };
      } catch {
        return { text: raw, format: "json", metadata: { malformed: true }, reliable: false };
      }
    }
    case ".txt":
    case ".md":
      return { text: decode(), format: ext.slice(1), metadata: {}, reliable: true };
    default:
      return {
        text: decode(),
        format: ext ? ext.slice(1) : "unknown",
        metadata: { note: "unrecognised extension; decoded as UTF-8 text" },
        reliable: false,
      };
  }
}

/**
 * Split text for embedding. Paragraph-aware with a character budget: splitting mid
 * sentence produces chunks that retrieve badly, and splitting per paragraph produces
 * chunks of wildly different sizes.
 */
export function chunkText(text: string, targetChars = 1_200, overlapChars = 120): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > targetChars) {
      flush();
      // A single oversized paragraph is split on sentence boundaries.
      const sentences = paragraph.match(/[^.!?]+[.!?]+|\S+$/g) ?? [paragraph];
      let buffer = "";
      for (const sentence of sentences) {
        if (buffer.length + sentence.length > targetChars && buffer) {
          chunks.push(buffer.trim());
          buffer = overlapChars > 0 ? buffer.slice(-overlapChars) : "";
        }
        buffer += sentence;
      }
      if (buffer.trim()) chunks.push(buffer.trim());
      continue;
    }
    if (current.length + paragraph.length + 2 > targetChars && current) flush();
    current += (current ? "\n\n" : "") + paragraph;
  }
  flush();
  return chunks;
}
