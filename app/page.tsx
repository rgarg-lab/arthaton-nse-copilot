import { currentUserOrDemo } from "@/auth";
import { BeamNetwork } from "@/components/landing/BeamNetwork";
import { TryIt } from "@/components/landing/BigType";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { QuickChatProvider, type QuickChatVisitor } from "@/components/landing/QuickChat";
import { MeasuredStrip } from "@/components/finance/MeasuredStrip";
import { getMetrics } from "@/lib/ml/client";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * Four of the inherited sections are gone, all for the same reason: their content was
 * someone else's.
 *
 * The course stream, the proof strip and the evidence plates were well-built sections
 * whose only content was counts from the demo seed's PRNG — a corpus size, a
 * confirmed-edge ratio, a 1,284,000-user population. `ArcDeck` was worse on inspection: a
 * five-card explainer hard-coding a "Cloud Engineer" goal, a skill DAG of
 * Python/Linux/Git/SQL, and a six-row scoring breakdown of invented decimals, one of them
 * labelled "Learners' next". In a domain-agnostic template all of that is a documented
 * placeholder; on a finance submission it is precisely the fabricated-statistics pattern
 * §4.1 forbids, and the earlier version of this project lost its credibility to exactly
 * that.
 *
 * `MeasuredStrip` replaces them with four figures read from the evaluation artifact, and
 * shows nothing at all when the service is down. `HowItWorks` renders
 * `idea.config.landing.howItWorks`, which already held this project's three steps and was
 * being rendered nowhere.
 *
 * What stays is the part of the shell that was always copy-driven and is now true: the
 * hero, the feature cards, the beam network and the quick chat.
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
        <HowItWorks idea={idea} />
        <MeasuredStrip id="measured" result={metrics} />
        <BeamNetwork id="engine" />
        <TryIt id="try" />
        <Footer />
      </main>
    </QuickChatProvider>
  );
}
