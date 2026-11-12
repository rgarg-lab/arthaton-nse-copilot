import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { config } from "@/lib/config";
import { currentDriver, driverFor } from "@/db";
import { llmMode } from "@/lib/llm/router";
import { preflight, type CheckStatus } from "@/lib/preflight";
import { DemoBanner } from "@/components/common/DemoBanner";
import { Nav } from "@/components/shell/Nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preflight" };

const ICON = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle } as const;
const TONE: Record<CheckStatus, string> = {
  ok: "text-violet",
  warn: "text-evidence-review",
  fail: "text-coral",
};

/** The page to open before recording anything: what works, what does not, and the fix. */
export default async function PreflightPage() {
  const idea = config();
  const report = await preflight();
  const counts = {
    ok: report.checks.filter((c) => c.status === "ok").length,
    warn: report.checks.filter((c) => c.status === "warn").length,
    fail: report.checks.filter((c) => c.status === "fail").length,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav ideaName={idea.name} />
      <DemoBanner mode={llmMode()} driver={currentDriver() ?? driverFor()} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-medium text-ink-1">Preflight</h1>
          <span
            className={`label-caps rounded-pill border px-2 py-0.5 ${
              report.ok ? "border-violet-line text-violet" : "border-coral-line text-coral"
            }`}
          >
            {report.ok ? "ready" : "not ready"}
          </span>
        </div>
        <p className="mt-1 mb-5 text-[13px] text-ink-3">
          {counts.ok} ok · {counts.warn} {counts.warn === 1 ? "warning" : "warnings"} · {counts.fail} failing.
          Warnings are survivable; a failure is not.
        </p>

        <ul className="flex list-none flex-col gap-2">
          {report.checks.map((check) => {
            const Icon = ICON[check.status];
            return (
              <li
                key={check.name}
                className="flex gap-3 rounded-card border border-line bg-surface-1 p-3.5"
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[check.status]}`} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-1">
                    {check.name}
                    <span className="sr-only"> — {check.status}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] leading-relaxed break-words text-ink-2">
                    {check.detail}
                  </p>
                  {check.fix && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
                      <span className="label-caps mr-1.5 text-ink-4">fix</span>
                      {check.fix}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 font-mono text-[11px] text-ink-4">checked at {report.at}</p>
      </main>
    </div>
  );
}
