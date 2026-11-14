/**
 * `npm run cache:clear` — drop every cached LLM response.
 *
 * Run this after changing a tool, the mock provider, or the system prompt. The cache key
 * covers the prompt and the model family but not the code that generated the answer, so
 * without this a fixed bug is replayed from cache and looks unfixed.
 */

import { clearCache } from "@/lib/llm/cache";

async function main() {
  const dropped = await clearCache();
  console.log(
    dropped === 0
      ? "response cache was already empty"
      : `cleared ${dropped} cached response${dropped === 1 ? "" : "s"}`,
  );
  console.log("restart the web server so it serves fresh answers.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("cache:clear failed", err);
    process.exit(1);
  },
);
