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
        affected — {error.digest ? "try again" : "reload the page"}, or go back to today
        &rsquo;s board.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-[12px] text-ink-3" data-testid="error-digest">
          ref {error.digest}
        </p>
      ) : (
        /**
         * No digest means the failure happened in the browser rather than on the server, and
         * by far the most common cause in local use is a tab that was open across a rebuild:
         * Next names its chunks by content hash, so after `npm run build` the URLs the old
         * page is holding no longer exist and the next navigation fetches a 404.
         *
         * This is worth its own sentence because `reset()` cannot fix it. Re-rendering reuses
         * the same stale chunk references, so "Try again" fails identically and the page
         * looks genuinely broken. Only a full reload re-reads the document and picks up the
         * new hashes — hence the primary button below becomes a reload in this case.
         */
        <p className="mt-3 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-4">
          No server reference, so this failed in the browser. If the app was rebuilt while
          this tab was open, its cached scripts are stale — a reload fixes it. The details are
          in the browser console.
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/*
          A reload, not `reset()`, when there is no digest — see above. With a digest the
          server failed and a re-render is genuinely worth a try.
        */}
        {error.digest ? (
          <Button size="lg" onClick={reset}>
            Try again <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button size="lg" onClick={() => window.location.reload()}>
            Reload the page <ArrowRight data-icon="inline-end" />
          </Button>
        )}
        <Button size="lg" variant="ghost" asChild>
          {/* `/learn` is retired (§7.1); this was a dead link on the error page, which is
              the worst possible place for one. */}
          <Link href="/signals">Today&rsquo;s signals</Link>
        </Button>
      </div>
    </CenteredPage>
  );
}
