import type { Metadata } from "next";
import { config } from "@/lib/config";
import { cachedSignals } from "@/lib/ml/cached";
import { llmMode } from "@/lib/llm/router";
import { currentScope, getRiskProfile, listWatchlist } from "@/lib/watchlist";
import { UNIVERSE } from "@/lib/universe";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { WatchlistBoard } from "@/components/finance/WatchlistBoard";
import { AddTicker, RiskProfileForm } from "@/components/finance/WatchlistControls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Watchlist",
  description:
    "The names you track, with today's calibrated call for each. Historical and paper-trading analysis only.",
};

/**
 * The watchlist (§7.1 maps the template's memory surface to this).
 *
 * The nav entry used to be labelled "Watchlist" and lead to the agent's memory page —
 * real data, but not what the label promised. This is the real thing: the user's own
 * tracked names from the `watchlist` table, each with its live signal, plus the risk
 * profile.
 *
 * Both pieces of state are genuinely the user's. Everything else on the page is read from
 * the committed artifacts through the ML service, and the risk profile is explicitly
 * prevented from reaching back into the model — see `effectiveThreshold`.
 */
export default async function WatchlistPage() {
  const idea = config();
  const scope = await currentScope();
  const [entries, profile, signals] = await Promise.all([
    listWatchlist(scope),
    getRiskProfile(scope),
    cachedSignals(),
  ]);

  // The slider's floor is the model's frozen threshold. With the service down there is no
  // frozen threshold to read, so the profile form is withheld rather than rendered against
  // a guessed floor — and `saveRiskProfileAction` refuses the write for the same reason.
  const modelThreshold =
    signals.source === "service" ? signals.data.model.threshold : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[22px] font-[420] tracking-[-0.03em] text-ink-1">Watchlist</h1>
          <p className="max-w-[76ch] text-[13.5px] leading-relaxed text-ink-2">
            The names you track, with today&rsquo;s calibrated call for each — or its
            abstention. Your list and your risk profile are the only things on this site that
            are yours rather than the model&rsquo;s; they are stored in the embedded database
            and survive a reload.
          </p>
        </header>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <AddTicker universe={UNIVERSE} tracked={entries.map((e) => e.ticker)} />
            <WatchlistBoard entries={entries} result={signals} profile={profile} />
          </div>

          <aside className="w-full shrink-0 lg:max-w-[22rem]">
            {modelThreshold === null ? (
              <p className="rounded-panel border border-dashed border-line bg-glass p-4 text-[12.5px] leading-relaxed text-ink-3">
                The risk profile needs the model&rsquo;s frozen threshold as its floor, and the
                model service is not answering. Start it with{" "}
                <code className="font-mono text-[12px]">python ml/tasks.py serve</code> and
                reload.
              </p>
            ) : (
              <RiskProfileForm profile={profile} modelThreshold={modelThreshold} />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
