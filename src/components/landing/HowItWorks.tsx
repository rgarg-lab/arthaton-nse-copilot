import type { IdeaConfig } from "@/lib/config";

export function HowItWorks({ idea }: { idea: IdeaConfig }) {
  return (
    <section id="how-it-works" className="border-y border-line bg-surface-1 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-[420] tracking-[-0.03em] text-ink-1">
          How it works
        </h2>
        <ol className="mt-8 grid list-none gap-6 sm:grid-cols-3">
          {idea.landing.howItWorks.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="font-mono text-[12px] text-violet">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 text-[15px] font-medium text-ink-1">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.description}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-panel border border-line bg-surface-2 p-5">
          <h3 className="label-caps text-ink-3">Target user</h3>
          <p className="mt-1.5 text-[14px] text-ink-1">{idea.targetUser}</p>
          <h3 className="label-caps mt-4 text-ink-3">Partner tool</h3>
          <p className="mt-1.5 text-[14px] text-ink-1">
            {idea.partnerTool.name}{" "}
            <span className="text-ink-3">({idea.partnerTool.type})</span>
          </p>
        </div>
      </div>
    </section>
  );
}
