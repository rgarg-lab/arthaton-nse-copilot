import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, memoryItems } from "@/db";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { EmptyState, ErrorState } from "@/components/common/EmptyState";
import { Nav } from "@/components/shell/Nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Memory" };

const TYPE_TONE: Record<string, string> = {
  fact: "border-line text-ink-2",
  preference: "border-violet-line text-violet",
  correction: "border-evidence-review-line text-evidence-review",
  note: "border-line text-ink-3",
};

/** Browse what the agent has remembered. Read-only: editing memory is an idea's decision. */
export default async function MemoryPage() {
  const idea = config();
  let items: (typeof memoryItems.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    const handle = await db();
    items = await handle.select().from(memoryItems).orderBy(desc(memoryItems.createdAt)).limit(100);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-[20px] font-medium text-ink-1">Memory</h1>
        <p className="mt-1 mb-5 text-[13px] text-ink-3">
          {items.length > 0
            ? `${items.length} stored ${items.length === 1 ? "item" : "items"}, newest first.`
            : "Everything the agent has chosen to remember."}
        </p>

        {error ? (
          <ErrorState title="Could not read memory" detail={error} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing remembered yet"
            description="Ask the agent to remember something, or load the demo seed from the workspace."
          />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-card border border-line bg-surface-1 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`label-caps rounded-chip border px-1.5 py-0.5 ${TYPE_TONE[item.type] ?? TYPE_TONE.note}`}
                  >
                    {item.type}
                  </span>
                  {item.source && <span className="text-[11px] text-ink-4">from {item.source}</span>}
                  <span className="ml-auto font-mono text-[10px] text-ink-4">
                    {item.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  {item.embedding === null && (
                    <span
                      className="text-[10px] text-evidence-review"
                      title="No embedding, so this item is only findable by keyword"
                    >
                      no vector
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-1">{item.content}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
