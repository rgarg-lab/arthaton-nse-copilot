import { currentUserOrDemo } from "@/auth";
import { ArcDeck } from "@/components/landing/ArcDeck";
import { BeamNetwork } from "@/components/landing/BeamNetwork";
import { TryIt } from "@/components/landing/BigType";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { QuickChatProvider, type QuickChatVisitor } from "@/components/landing/QuickChat";
import { MeasuredStrip } from "@/components/finance/MeasuredStrip";
import { getMetrics } from "@/lib/ml/client";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * Three of the inherited sections are gone: the course stream, the proof strip and the
 * evidence plates. Each was a well-built section whose only content was counts from the
 * demo seed's PRNG — a corpus size, a confirmed-edge ratio, a learner population. In a
 * domain-agnostic template that is a documented placeholder; in a finance submission it is
 * precisely the fabricated-statistics pattern §4.1 forbids, and the earlier version of
 * this project lost its credibility to exactly that. `MeasuredStrip` replaces them with
 * four figures read from the evaluation artifact, and shows nothing at all when the
 * service is down.
 *
 * What stays is the part of the shell that was always copy-driven and is now true: the
 * hero, the feature cards, the how-it-works deck, the beam network and the quick chat.
 * Their text comes from `idea.config.ts`.
 */
async function visitorState(): Promise<QuickChatVisitor> {
  const user = await currentUserOrDemo();
  // The learner concept is retired, so there is no per-learner deep link to resolve: the
  // quick chat only needs to know whether anyone is signed in, and the app runs signed out.
  return user ? { signedIn: true, learner: null } : { signedIn: false };
}

export default async function Home() {
  const idea = config();
  const [visitor, metrics] = await Promise.all([visitorState(), getMetrics()]);

  return (
    <QuickChatProvider visitor={visitor}>
      <main className="flex flex-1 flex-col">
        <Hero storyHref="#how-it-works" />
        <Features idea={idea} />
        <ArcDeck id="how-it-works" />
        <MeasuredStrip id="measured" result={metrics} />
        <BeamNetwork id="engine" />
        <TryIt id="try" />
        <Footer />
      </main>
    </QuickChatProvider>
  );
}
