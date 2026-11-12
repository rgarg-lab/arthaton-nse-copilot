import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { currentDriver, driverFor } from "@/db";
import { findNeighbors } from "@/lib/ml/client";
import { llmMode } from "@/lib/llm/router";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";
import { EvidenceTimeline } from "@/components/finance/EvidenceTimeline";
import { UNIVERSE } from "@/lib/universe";
import { bareTicker } from "@/components/finance/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Evidence",
  description:
    "The historical sessions most similar to today, and what actually happened next. Historical analysis only.",
};

/**
 * The evidence timeline (§7.1 maps the template's `path` surface to this).
 *
 * Ticker selection is a row of plain links with a `?ticker=` query parameter rather than a
 * client-side dropdown. That makes every view of this page a real URL a judge can be sent
 * to, keeps the page a server component with no client JavaScript at all, and means the
 * browser's back button does what it should.
 */
export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string; k?: string }>;
}) {
  const idea = config();
  const params = await searchParams;

  const requested = (params.ticker ?? "").toUpperCase();
  const ticker = UNIVERSE.includes(requested) ? requested : UNIVERSE[0];
  const parsedK = Number(params.k);
  const k = Number.isFinite(parsedK) ? Math.min(100, Math.max(3, Math.trunc(parsedK))) : 25;

  const result = await findNeighbors({ ticker, k });

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[22px] font-[420] tracking-[-0.03em] text-ink-1">
            Evidence from similar sessions
          </h1>
          <p className="max-w-[80ch] text-[13.5px] leading-relaxed text-ink-2">
            A probability is a claim you either accept or you don&rsquo;t. These are the actual
            past sessions whose market state most resembles this one, with real dates and the
            real return that followed each — so the prediction can be checked rather than
            trusted. Neighbours are drawn strictly from before the query date.
          </p>
        </header>

        <nav aria-label="Choose a ticker" className="flex flex-col gap-1.5">
          <span className="label-caps text-[10px] text-ink-4">Basket</span>
          <ul className="flex list-none flex-wrap gap-1.5 p-0">
            {UNIVERSE.map((t) => {
              const active = t === ticker;
              return (
                <li key={t}>
                  <Link
                    href={`/evidence?ticker=${encodeURIComponent(t)}&k=${k}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-block rounded-pill border border-line-strong bg-glass-strong px-2.5 py-1 font-mono text-[11.5px] text-ink-1"
                        : "inline-block rounded-pill border border-line bg-glass px-2.5 py-1 font-mono text-[11.5px] text-ink-3 transition-colors hover:text-ink-1 focus-visible:text-ink-1"
                    }
                  >
                    {bareTicker(t)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <EvidenceTimeline result={result} />
      </main>
    </div>
  );
}
