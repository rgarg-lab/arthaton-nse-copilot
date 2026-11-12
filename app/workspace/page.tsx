import type { Metadata } from "next";
import { config } from "@/lib/config";
import { currentDriver, db, driverFor } from "@/db";
import { listPending } from "@/lib/approvals";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { WorkspaceClient } from "@/components/agent/WorkspaceClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const idea = config();
  return { title: "Workspace", description: idea.tagline };
}

/**
 * The main working surface. A server component so the mode banner is correct on first
 * paint — a demo that renders "live" for a moment before correcting itself to "mock" is
 * worse than one that is honest immediately.
 */
export default async function WorkspacePage() {
  const idea = config();
  const mode = llmMode();

  // Read the tray server-side so it is right on first paint. A database that is not up
  // yet is survivable here: the workspace still loads and the tray fills in later.
  let initialPending: Awaited<ReturnType<typeof listPending>> = [];
  try {
    initialPending = await listPending(await db());
  } catch (err) {
    console.warn("workspace: could not read the approval queue:", err);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={mode} driver={currentDriver() ?? driverFor()} />
      <WorkspaceClient
        idea={idea}
        mode={mode}
        initialPending={initialPending.map((action) => ({
          id: action.id,
          kind: action.kind,
          connector: action.connector,
          preview: action.preview,
        }))}
      />
    </div>
  );
}
