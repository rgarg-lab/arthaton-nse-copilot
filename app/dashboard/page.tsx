import type { Metadata } from "next";
import { config } from "@/lib/config";
import { currentDriver, driverFor } from "@/db";
import { getMetrics } from "@/lib/ml/client";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { ModelCard } from "@/components/finance/ModelCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Model card",
  description:
    "The measured track record: purged walk-forward evaluation, probability calibration, four baselines and the abstention trade-off. Every figure read from the evaluation artifact.",
};

/**
 * The model card (§7.1 remaps the template's generic agent dashboard to this).
 *
 * The template's version counted the agent's own activity — sessions, tool calls,
 * approvals — from Postgres. Those counts are real but they are not interesting to a
 * finance judge, and the page is the natural home for the thing that *is*: whether the
 * model's numbers survive scrutiny. The agent-activity counts are still visible on
 * `/preflight` and in the trace, so nothing was lost by the swap.
 *
 * Not one figure on this page is computed here or written here. `ModelCard` renders
 * `ml/artifacts/metrics.json` as served by the ML service.
 */
export default async function ModelCardPage() {
  const idea = config();
  const result = await getMetrics();

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-[22px] font-[420] tracking-[-0.03em] text-ink-1">Model card</h1>
          <p className="max-w-[80ch] text-[13.5px] leading-relaxed text-ink-2">
            What this model actually does, measured rather than described. Every number below is
            read from <code className="font-mono text-[12.5px]">ml/artifacts/metrics.json</code>,
            which is produced by{" "}
            <code className="font-mono text-[12.5px]">ml/src/copilot/evaluate.py</code> and
            committed to the repository. There are no statistics written into this page&rsquo;s
            source — if the service is down, the page says so instead of showing a figure.
          </p>
        </header>

        <ModelCard result={result} />
      </main>
    </div>
  );
}
