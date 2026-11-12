"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/workspace", label: "Workspace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/outbox", label: "Outbox" },
  { href: "/memory", label: "Memory" },
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
