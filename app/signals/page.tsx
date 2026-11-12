import type { Metadata } from "next";
import { getSignals } from "@/lib/ml/client";
import { config } from "@/lib/config";
import { currentDriver, driverFor } from "@/db";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { SignalsBoard } from "@/components/finance/SignalsBoard";

export const metadata: Metadata = {
  title: "Today's signals",
  description:
    "Calibrated next-session direction for a fixed basket of NSE large-caps, with explicit abstentions. Historical and paper-trading analysis only.",
};

/**
 * Server-rendered, uncached.
 *
 * `force-dynamic` because this board is a statement about *today*. A statically rendered
 * or revalidated page would serve a probability computed at build time under a heading
 * that reads "today's signals", which is the staleness failure this product can least
 * afford.
 */
export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const idea = config();
  const result = await getSignals();

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[22px] font-[420] tracking-[-0.03em] text-ink-1">
            Today&rsquo;s signals
          </h1>
          <p className="max-w-[76ch] text-[13.5px] leading-relaxed text-ink-2">
            {idea.name} calls the direction of the next trading session for each name in the
            basket — or declines to, when conviction does not clear its frozen threshold. Every
            probability here is calibrated against out-of-sample outcomes and read from the
            evaluated model artifacts; none of it is computed in the browser.
          </p>
        </header>

        <SignalsBoard result={result} />
      </main>
    </div>
  );
}
