import { config } from "@/lib/config";
import { db } from "@/db";
import { applySeed, loadSeedFile } from "@/lib/seed";

/**
 * `npm run seed` — load the seed named by `idea.config.ts` (`demoSeed`), or the one given
 * as an argument: `npm run seed -- <name>`.
 */
async function main() {
  const name = process.argv[2] ?? config().demoSeed;
  const seed = await loadSeedFile(name);
  const handle = await db();
  const result = await applySeed(handle, seed);
  console.log(
    `seeded "${result.label}": session=${result.sessionId} memory=${result.memory} ` +
      `documents=${result.documents} chunks=${result.chunks} outbox=${result.outbox}`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("seed failed:", err);
    process.exit(1);
  },
);
