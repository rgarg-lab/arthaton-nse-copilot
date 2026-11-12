import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { currentDriver, db, driverFor, rows } from "@/db";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Dashboard, type SeriesPoint, type StatTile } from "@/components/dashboard/Dashboard";
import { ErrorState } from "@/components/common/EmptyState";
import { Nav } from "@/components/shell/Nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

/**
 * Counts computed in SQL, rendered through the generic dashboard contract. The queries
 * here are the only idea-specific part, and they are deliberately about the *agent*
 * (sessions, tool calls, approvals) rather than about any domain — so they stay correct
 * whatever the idea turns out to be.
 */
async function load() {
  const handle = await db();

  const [counts] = await rows<{
    sessions: number;
    traces: number;
    memory: number;
    pending: number;
    delivered: number;
  }>(
    handle,
    sql`select
      (select count(*)::int from agent_sessions) as sessions,
      (select count(*)::int from trace_events) as traces,
      (select count(*)::int from memory_items) as memory,
      (select count(*)::int from pending_actions where status = 'pending') as pending,
      (select count(*)::int from outbox where status = 'delivered') as delivered`,
  );

  const byType = await rows<{ name: string; value: number }>(
    handle,
    sql`select type as name, count(*)::int as value from trace_events group by type order by value desc limit 8`,
  );

  const byStatus = await rows<{ name: string; value: number }>(
    handle,
    sql`select status as name, count(*)::int as value from outbox group by status order by value desc`,
  );

  const [toolCalls] = await rows<{ value: number }>(
    handle,
    sql`select count(*)::int as value from trace_events where type = 'tool_call'`,
  );

  const tiles: StatTile[] = [
    { label: "Sessions", value: Number(counts?.sessions ?? 0), hint: "agent runs started" },
    { label: "Tool calls", value: Number(toolCalls?.value ?? 0), hint: "across every session" },
    { label: "Memory items", value: Number(counts?.memory ?? 0), hint: "facts and preferences stored" },
    {
      label: "Awaiting approval",
      value: Number(counts?.pending ?? 0),
      hint: `${Number(counts?.delivered ?? 0)} delivered so far`,
    },
  ];

  return {
    tiles,
    byType: byType.map((r) => ({ name: r.name, value: Number(r.value) })) as SeriesPoint[],
    byStatus: byStatus.map((r) => ({ name: r.name, value: Number(r.value) })) as SeriesPoint[],
  };
}

export default async function DashboardPage() {
  const idea = config();
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let error: string | null = null;
  try {
    data = await load();
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <h1 className="text-[20px] font-medium text-ink-1">Dashboard</h1>
        <p className="mt-1 mb-5 text-[13px] text-ink-3">
          Generic metrics over the agent&apos;s own activity. Swap the queries in{" "}
          <code className="font-mono">app/dashboard/page.tsx</code> for idea-specific ones.
        </p>
        {error ? (
          <ErrorState title="Could not read the database" detail={error} />
        ) : (
          <Dashboard tiles={data!.tiles} byType={data!.byType} overTime={data!.byStatus} />
        )}
      </main>
    </div>
  );
}
