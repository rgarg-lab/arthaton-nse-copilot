/**
 * Guard: no PENDING CAPTURE placeholder may survive into a final render.
 *
 * `<Capture>` deliberately renders a loud placeholder instead of an
 * approximation of the UI when a recording is missing — a placeholder that
 * *looked* like the app is how a fabricated demo frame gets shipped by
 * accident. This checks that every `<Capture name="...">` in the timeline has a
 * real recording behind it, and that the file is actually there on disk.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const main = readFileSync(join(ROOT, "src", "Main.tsx"), "utf8");
const manifestSrc = readFileSync(join(ROOT, "src", "captures.manifest.ts"), "utf8");

const used = [...main.matchAll(/<Capture\s[^>]*?name="([^"]+)"/gs)].map((m) => m[1]);
const declared = [...manifestSrc.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
const keys = [...manifestSrc.matchAll(/^\s*"?([a-zA-Z][\w-]*)"?:\s*\{/gm)]
  .map((m) => m[1])
  .filter((k) => k !== "captureManifest");

let bad = 0;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  bad++;
};

if (used.length === 0) fail("no <Capture> found in Main.tsx — did the timeline change?");

for (const name of used) {
  if (!keys.includes(name)) {
    fail(`<Capture name="${name}"> has no entry in captures.manifest.ts — ` +
         `it would render a PENDING CAPTURE placeholder`);
  }
}

for (const rel of declared) {
  const p = join(ROOT, "public", rel);
  if (!existsSync(p)) fail(`manifest points at ${rel}, which does not exist`);
  else if (statSync(p).size < 50_000) fail(`${rel} is suspiciously small`);
}

console.log(
  bad === 0
    ? `PASS  ${used.length} capture slots, all backed by real recordings`
    : `\n${bad} problem(s)`,
);
process.exit(bad === 0 ? 0 : 1);
