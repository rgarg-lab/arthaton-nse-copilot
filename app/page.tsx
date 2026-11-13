import { currentUserOrDemo } from "@/auth";
import { ArcDeck } from "@/components/landing/ArcDeck";
import { BeamNetwork } from "@/components/landing/BeamNetwork";
import { TryIt } from "@/components/landing/BigType";
import { EvidencePlates } from "@/components/landing/EvidencePlates";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { MotionWall } from "@/components/landing/MotionWall";
import { ProofStrip } from "@/components/landing/ProofStrip";
import { QuickChatProvider, type QuickChatVisitor } from "@/components/landing/QuickChat";
import { SkillStream } from "@/components/landing/SkillStream";
import { config } from "@/lib/config";
import { landingData } from "@/lib/landingData";

export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * ## What happened here, and the correction
 *
 * The first pass at this project **deleted** five of the shell's sections — the stream,
 * the arc deck, the counting strip, the motion wall and the evidence plates — because
 * their content came from the template's seeded PRNG and §4.1 forbids fabricated figures
 * in a finance submission.
 *
 * Deleting them was the wrong reading of that rule. §4.1 says do not invent statistics; it
 * does not say throw away the components that display them. The build spec is explicit in
 * the other direction — do not redesign the shell — and removing most of it is a redesign.
 * The result was a page of plain tables that lost everything the inherited UI was good at.
 *
 * Every section is back, and each one now takes its figures as props from
 * `src/lib/landingData.ts`, which reads `ml/artifacts/*.json` through the service. The
 * layout, the motion, the CSS modules and the scroll choreography are untouched.
 *
 * ## Still no fabrication
 *
 * `landingData()` returns `null` when the ML service is unreachable, and every section
 * that would show a number is omitted entirely rather than rendered with placeholders.
 * What remains — the hero, the feature cards, the beam network, the quick chat — is
 * copy-driven from `idea.config.ts` and true regardless.
 *
 * ## Speed
 *
 * `landingData` is cached for five minutes. The artifacts change once a day at most, and
 * the old version blocked the whole render on two uncached HTTP round trips, every visit.
 */
async function visitorState(): Promise<QuickChatVisitor> {
  return { signedIn: Boolean(await currentUserOrDemo()) };
}

export default async function Home() {
  const idea = config();
  const [visitor, data] = await Promise.all([visitorState(), landingData()]);

  return (
    <QuickChatProvider visitor={visitor}>
      <main className="flex flex-1 flex-col">
        <Hero storyHref="#how-it-works" />
        {data && <SkillStream id="basket" cards={data.stream} nextHref="#how-it-works" />}
        <ArcDeck id="how-it-works" importance={data?.importance} />
        {data && (
          <ProofStrip
            id="proof"
            title="What has this actually been measured at?"
            cells={data.proof}
          />
        )}
        <MotionWall id="different" data={data?.wall ?? null} />
        <BeamNetwork id="engine" />
        {data && <EvidencePlates id="evidence" plates={data.plates} />}
        <Features idea={idea} />
        <TryIt id="try" />
        <Footer />
      </main>
    </QuickChatProvider>
  );
}
