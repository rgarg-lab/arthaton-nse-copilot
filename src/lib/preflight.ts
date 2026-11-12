import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { currentDriver, db, driverFor, rows } from "@/db";
import { cacheEnabled, cacheSize } from "@/lib/llm/cache";
import { embeddingProvider } from "@/lib/llm/embed";
import { anyProviderConfigured, llmMode, modelChain } from "@/lib/llm/router";
import { anthropicProvider } from "@/lib/llm/providers/anthropic";
import { geminiProvider } from "@/lib/llm/providers/gemini";
import { groqProvider } from "@/lib/llm/providers/openai-compatible";
import { CONNECTORS } from "@/lib/integrations";
import { assertToolsExist } from "@/lib/tools";

/**
 * Demo readiness, with a fix for every failure.
 *
 * The rule here is that a check is only worth having if it tells you what to do about it,
 * so every result carries a `fix`. "ok" is not the only acceptable state either — `warn`
 * exists because running in mock mode with the embedded database is a perfectly good
 * state for a rehearsal and should not show as a failure.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do if this is not ok. */
  fix?: string;
};

export type PreflightReport = {
  ok: boolean;
  checks: Check[];
  at: string;
};

export async function preflight(): Promise<PreflightReport> {
  const checks: Check[] = [];
  const idea = config();

  // ── config ──────────────────────────────────────────────────────────────────
  try {
    assertToolsExist(idea.agent.enabledTools);
    checks.push({
      name: "idea.config.ts",
      status: "ok",
      detail: `"${idea.name}" · ${idea.agent.enabledTools.length} tools enabled · threshold ${idea.agent.confidenceThreshold}`,
    });
  } catch (err) {
    checks.push({
      name: "idea.config.ts",
      status: "fail",
      detail: (err as Error).message,
      fix: "Fix agent.enabledTools in idea.config.ts to match the registry in src/lib/tools/index.ts.",
    });
  }

  if (idea.name === "Starter" || idea.partnerTool.name === "TBD at kickoff") {
    checks.push({
      name: "idea filled in",
      status: "warn",
      detail: "idea.config.ts is still the neutral placeholder.",
      fix: "Run /new-idea, or edit idea.config.ts, before recording anything.",
    });
  }

  // ── database ────────────────────────────────────────────────────────────────
  const driver = driverFor();
  try {
    const handle = await db();
    const started = Date.now();
    await handle.execute(sql`select 1`);
    const ms = Date.now() - started;

    const [tables] = await rows<{ count: number }>(
      handle,
      sql`select count(*)::int as count from information_schema.tables
          where table_schema = 'public' and table_name in
          ('agent_sessions','messages','memory_items','documents','chunks',
           'pending_actions','outbox','trace_events','llm_cache','eval_runs')`,
    );
    const migrated = Number(tables?.count ?? 0) === 10;

    checks.push({
      name: "database",
      status: migrated ? (driver === "pglite" ? "warn" : "ok") : "fail",
      detail: migrated
        ? `${currentDriver() ?? driver} reachable in ${ms}ms, all 10 tables present`
        : `${currentDriver() ?? driver} reachable but only ${Number(tables?.count ?? 0)}/10 tables exist`,
      fix: migrated
        ? driver === "pglite"
          ? "Fine for local work. Set DATABASE_URL to a Neon database before deploying."
          : undefined
        : "Run `npm run db:migrate`.",
    });

    const [seeded] = await rows<{ count: number }>(
      handle,
      sql`select count(*)::int as count from memory_items`,
    );
    const seedCount = Number(seeded?.count ?? 0);
    checks.push({
      name: "demo seed",
      status: seedCount > 0 ? "ok" : "warn",
      detail: seedCount > 0 ? `${seedCount} memory items loaded` : "no seed data loaded",
      fix: seedCount > 0 ? undefined : "Run `npm run seed`, or press “Load demo” in the workspace.",
    });
  } catch (err) {
    checks.push({
      name: "database",
      status: "fail",
      detail: (err as Error).message,
      fix:
        driver === "pglite"
          ? "Run `npm run db:migrate` to create the embedded database."
          : "Check DATABASE_URL, then run `npm run db:migrate`.",
    });
    checks.push({
      name: "demo seed",
      status: "fail",
      detail: "skipped — no database",
      fix: "Fix the database check first.",
    });
  }

  // ── model providers ─────────────────────────────────────────────────────────
  const mode = llmMode();
  checks.push({
    name: "LLM mode",
    status: mode === "live" ? "ok" : "warn",
    detail: `${mode}${mode === "mock" ? " — answers are generated locally" : ""}`,
    fix:
      mode === "live"
        ? undefined
        : "Set a provider key and LLM_MODE=live for real output. Mock mode is fine for a rehearsal.",
  });

  for (const provider of [anthropicProvider, geminiProvider, groqProvider]) {
    checks.push({
      name: `provider: ${provider.id}`,
      status: provider.isConfigured() ? "ok" : "warn",
      detail: provider.isConfigured() ? `${provider.keyEnv} is set` : `${provider.keyEnv} is not set`,
      fix: provider.isConfigured() ? undefined : `Set ${provider.keyEnv} in .env.local to enable it.`,
    });
  }

  checks.push({
    name: "model chain",
    status: anyProviderConfigured() ? "ok" : "warn",
    detail: modelChain().join(" → ") || "(empty)",
    fix: anyProviderConfigured()
      ? undefined
      : "No provider is configured, so every model in the chain would fall through to the mock.",
  });

  checks.push({
    name: "embeddings",
    status: "ok",
    detail:
      embeddingProvider() === "mock"
        ? "deterministic local embeddings (no key needed)"
        : `${embeddingProvider()} provider`,
  });

  // ── cache ───────────────────────────────────────────────────────────────────
  const warm = await cacheSize();
  checks.push({
    name: "response cache",
    status: !cacheEnabled() ? "warn" : warm > 0 ? "ok" : "warn",
    detail: !cacheEnabled() ? "disabled (LLM_CACHE=off)" : `${warm} cached ${warm === 1 ? "response" : "responses"}`,
    fix: !cacheEnabled()
      ? "Set LLM_CACHE=on so a rehearsed demo replays instantly."
      : warm > 0
        ? undefined
        : "Rehearse the demo once with the cache on; the second run will be instant.",
  });

  // ── connectors ──────────────────────────────────────────────────────────────
  for (const connector of CONNECTORS) {
    if (connector.id === "mock") continue;
    checks.push({
      name: `connector: ${connector.id}`,
      status: connector.isConfigured() ? "ok" : "warn",
      detail: connector.isConfigured()
        ? "configured"
        : `needs ${connector.requires.join(", ")}`,
      fix: connector.isConfigured()
        ? undefined
        : `Optional. Set ${connector.requires.join(" and ")} to deliver through ${connector.name}; approvals fall back to the outbox otherwise.`,
    });
  }

  checks.push({
    name: "cron secret",
    status: process.env.CRON_SECRET ? "ok" : "warn",
    detail: process.env.CRON_SECRET ? "set" : "not set — /api/cron is unauthenticated",
    fix: process.env.CRON_SECRET
      ? undefined
      : "Fine locally. Set CRON_SECRET before deploying, or anyone can trigger deliveries.",
  });

  return {
    // A warning is not a failure: mock mode with the embedded database is a valid state.
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    at: new Date().toISOString(),
  };
}
