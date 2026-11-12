"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Signals first, because it is the thing the product is for; the model card second,
 * because the honest second question after "what do you think" is "why should I believe
 * you". `/learn` and the learner routes are gone — see `app/README-retired.md`.
 */
const LINKS = [
  { href: "/signals", label: "Signals" },
  { href: "/dashboard", label: "Model card" },
  { href: "/evidence", label: "Evidence" },
  { href: "/workspace", label: "Copilot" },
  { href: "/memory", label: "Watchlist" },
  { href: "/outbox", label: "Alerts" },
  { href: "/preflight", label: "Preflight" },
];

/** One nav across every working page. Horizontally scrollable rather than wrapped on narrow screens. */
export function Nav({ ideaName }: { ideaName: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="label-caps shrink-0 text-ink-1">
          {ideaName}
        </Link>
        <nav aria-label="Main" className="min-w-0 flex-1">
          <ul className="flex list-none gap-1 overflow-x-auto">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-block rounded-pill px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors",
                      // A visible ring on keyboard focus. The nav is the first thing Tab
                      // reaches on every page, and a hover-only affordance leaves a
                      // keyboard user with no indication of where they are.
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1",
                      active ? "bg-glass-strong text-ink-1" : "text-ink-3 hover:text-ink-1",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
