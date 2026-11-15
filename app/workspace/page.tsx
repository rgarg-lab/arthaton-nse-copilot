import type { Metadata } from "next";
import { currentUserOrDemo } from "@/auth";
import { config } from "@/lib/config";
import { cachedMetrics, cachedNeighbors, cachedSignals } from "@/lib/ml/cached";
import { llmMode } from "@/lib/llm/router";
import { UNIVERSE } from "@/lib/universe";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { CopilotWorkspace } from "@/components/finance/CopilotWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Copilot",
  description:
    "Ask about any name in the basket and get a calibrated probability — or an explicit refusal, with the reason.",
};

/**
 * The workspace: the shell's three-region layout with this project's four panes.
 *
 * All three fetches happen here, in parallel, once — so switching tabs is instant. The
 * first version made each pane a separate route with its own blocking fetch, which is
 * where most of the perceived lag came from: every navigation paid a fresh round trip to
 * the ML service before any HTML was sent.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const idea = config();
  const params = await searchParams;
  const requested = (params.ticker ?? "").toUpperCase();
  const evidenceTicker = UNIVERSE.includes(requested) ? requested : UNIVERSE[0];

  const [user, signals, metrics, evidence] = await Promise.all([
    currentUserOrDemo(),
    cachedSignals(),
    cachedMetrics(),
    cachedNeighbors(evidenceTicker, 25),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} />
      <CopilotWorkspace
        user={user ?? { id: "anonymous", name: idea.assistant.name, email: null, image: null }}
        signals={signals}
        metrics={metrics}
        evidence={evidence}
        evidenceTicker={evidenceTicker}
      />
    </div>
  );
}
