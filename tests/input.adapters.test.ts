import { describe, expect, it } from "vitest";
import { chunkText, extensionOf, parseDelimited, parseFile, parseSubtitles } from "@/lib/input/adapters";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("subtitles", () => {
  it("keeps the words and drops the timings", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
We should ship on Friday.

2
00:00:04.500 --> 00:00:07.000
<v Priya>Actually Monday is safer.`;
    const { text, cues } = parseSubtitles(vtt);
    expect(cues).toBe(2);
    expect(text).toContain("We should ship on Friday.");
    expect(text).toContain("Monday is safer.");
    expect(text).not.toMatch(/00:00/);
    expect(text).not.toMatch(/WEBVTT/);
    expect(text).not.toMatch(/<v /);
  });

  it("collapses rolling-caption repeats", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
the same line

2
00:00:02,000 --> 00:00:03,000
the same line`;
    expect(parseSubtitles(srt).text).toBe("the same line");
  });
});

describe("delimited files", () => {
  it("renders CSV as labelled records", () => {
    const csv = "date,amount,merchant\n2026-11-01,420.50,Chai Point\n2026-11-02,89,Metro";
    const { text, rows, columns } = parseDelimited(csv, ",");
    expect(rows).toBe(2);
    expect(columns).toEqual(["date", "amount", "merchant"]);
    expect(text).toContain("Record 1:");
    expect(text).toContain("merchant: Chai Point");
    expect(text).toContain("amount: 89");
  });

  it("handles quoted fields containing the delimiter", () => {
    const csv = 'name,note\n"Smith, John","said ""yes"" twice"';
    const { text } = parseDelimited(csv, ",");
    expect(text).toContain("name: Smith, John");
    expect(text).toContain('note: said "yes" twice');
  });

  it("survives a ragged row rather than throwing", () => {
    const { text, rows } = parseDelimited("a,b,c\n1,2", ",");
    expect(rows).toBe(1);
    expect(text).toContain("c:");
  });

  it("returns nothing for an empty file", () => {
    expect(parseDelimited("", ",")).toEqual({ text: "", rows: 0, columns: [] });
  });
});

describe("parseFile dispatch", () => {
  it("picks the parser from the extension", async () => {
    expect((await parseFile("a.txt", bytes("plain"))).format).toBe("txt");
    expect((await parseFile("a.md", bytes("# head"))).format).toBe("md");
    expect((await parseFile("a.csv", bytes("x\n1"))).format).toBe("csv");
    expect((await parseFile("a.tsv", bytes("x\t y\n1\t2"))).format).toBe("tsv");
    expect((await parseFile("a.vtt", bytes("WEBVTT\n\nhello"))).format).toBe("vtt");
  });

  it("pretty-prints JSON and flags malformed JSON", async () => {
    const good = await parseFile("a.json", bytes('{"b":2,"a":1}'));
    expect(good.reliable).toBe(true);
    expect(good.text).toContain("\n");
    const bad = await parseFile("a.json", bytes("{not json"));
    expect(bad.reliable).toBe(false);
    expect(bad.metadata.malformed).toBe(true);
  });

  it("decodes an unknown extension as best-effort rather than refusing", async () => {
    const result = await parseFile("mystery.xyz", bytes("still readable"));
    expect(result.text).toBe("still readable");
    expect(result.reliable).toBe(false);
    expect(result.format).toBe("xyz");
  });

  it("reports a PDF it cannot read instead of throwing", async () => {
    const result = await parseFile("broken.pdf", bytes("not actually a pdf"));
    expect(result.format).toBe("pdf");
    expect(result.reliable).toBe(false);
  });

  it("reports a DOCX it cannot read instead of throwing", async () => {
    const result = await parseFile("broken.docx", bytes("not a zip"));
    expect(result.format).toBe("docx");
    expect(result.reliable).toBe(false);
    expect(result.metadata.error).toBeDefined();
  });

  it("extracts text from a real DOCX", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const xml =
      '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
      "<w:p><w:r><w:t>First line</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Second &amp; last</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    const zip = zipSync({ "word/document.xml": strToU8(xml) });
    const result = await parseFile("real.docx", zip);
    expect(result.reliable).toBe(true);
    expect(result.text).toContain("First line");
    expect(result.text).toContain("Second & last");
  });
});

describe("extensionOf", () => {
  it("is case-insensitive and tolerates no extension", () => {
    expect(extensionOf("Report.PDF")).toBe(".pdf");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("README")).toBe("");
  });
});

describe("chunkText", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkText("One short paragraph.")).toEqual(["One short paragraph."]);
  });

  it("splits on paragraph boundaries within the budget", () => {
    const para = (n: number) => `Paragraph ${n}. ${"word ".repeat(100)}`.trim();
    const chunks = chunkText([para(1), para(2), para(3)].join("\n\n"), 600);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(900);
  });

  it("splits an oversized paragraph on sentence boundaries", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(long, 300);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should begin mid-word.
    for (const chunk of chunks) expect(chunk).toMatch(/^\S/);
  });

  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("loses no words", () => {
    const text = Array.from({ length: 30 }, (_, i) => `para ${i} content here`).join("\n\n");
    const joined = chunkText(text, 200).join(" ");
    for (let i = 0; i < 30; i += 1) expect(joined).toContain(`para ${i}`);
  });
});
