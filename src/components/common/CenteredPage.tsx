import Link from "next/link";
import type { ReactNode } from "react";

/** The narrow, centred frame shared by sign-in and any single-purpose page. */
export function CenteredPage({
  children,
  width = 420,
  wordmark = "app",
}: {
  children: ReactNode;
  width?: number;
  /** Shown as the home link. Phase 2 wires this to `idea.config.ts`. */
  wordmark?: string;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink px-6 py-16">
      <div className="bg-vignette pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex w-full flex-col items-center text-center" style={{ maxWidth: width }}>
        <Link href="/" className="label-caps -m-4 rounded-chip p-4 text-ink-2 transition-colors hover:text-ink-1">
          {wordmark}
        </Link>
        {children}
      </div>
    </main>
  );
}
