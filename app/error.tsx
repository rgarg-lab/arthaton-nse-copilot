"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { CenteredPage } from "@/components/common/CenteredPage";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: a page that failed to render gets a way back instead of a blank screen. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page failed", error);
  }, [error]);
  return (
    <CenteredPage>
      <h1 className="mt-6 text-[clamp(2.2rem,4vw,3rem)] font-[420] leading-[1.06] tracking-[-0.047em]">
        Something <span className="text-gradient-violet">broke</span>.
      </h1>
      <p className="mt-4 max-w-[42ch] text-lead text-ink-2">
        This page hit an error on our side. No signal, model artifact or queued action is
        affected — try again, or go back to today&rsquo;s board.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[12px] text-ink-3" data-testid="error-digest">
          ref {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={reset}>
          Try again <ArrowRight data-icon="inline-end" />
        </Button>
        <Button size="lg" variant="ghost" asChild>
          {/* `/learn` is retired (§7.1); this was a dead link on the error page, which is
              the worst possible place for one. */}
          <Link href="/signals">Today&rsquo;s signals</Link>
        </Button>
      </div>
    </CenteredPage>
  );
}
