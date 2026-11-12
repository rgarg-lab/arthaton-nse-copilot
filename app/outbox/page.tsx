import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { config } from "@/lib/config";
import { currentDriver, db, driverFor, outbox } from "@/db";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { ErrorState } from "@/components/common/EmptyState";
import { Nav } from "@/components/shell/Nav";
import { OutboxClient, type OutboxRow } from "@/components/outbox/OutboxClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage() {
  const idea = config();
  let rows: OutboxRow[] = [];
  let error: string | null = null;
  try {
    const handle = await db();
    const found = await handle.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(100);
    rows = found.map((row) => ({
      id: row.id,
      kind: row.kind,
      connector: row.connector,
      body: row.body,
      status: row.status,
      deliverAfter: row.deliverAfter?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
    }));
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-[20px] font-medium text-ink-1">Outbox</h1>
        <p className="mt-1 mb-5 text-[13px] text-ink-3">
          Everything that has been sent or is scheduled to be. Nothing arrives here without an approval.
        </p>
        {error ? <ErrorState title="Could not read the outbox" detail={error} /> : <OutboxClient initial={rows} />}
      </main>
    </div>
  );
}
