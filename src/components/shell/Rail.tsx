"use client";

import { DropdownMenu } from "radix-ui";
import { LogOut, Star, UserRound, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/schemas";

import styles from "./shell.module.css";
import { IDEA_NAME } from "@/lib/config/client";

export type RailLearner = { id: string; displayName: string };

export type RailProps = {
  /** The learner this workspace belongs to. */
  learnerId: string;
  displayName: string;
  /** The signed-in Google user behind the avatar button. */
  user: SessionUser;
  /** Every learner this user owns, for the switcher. */
  learners: RailLearner[];
  onOpenProfile: () => void;
  onSignOut: () => void;
  /** Extra controls (the Chat / Workspace switch on narrow screens). */
  children?: ReactNode;
};

/** The surfaces a user switches between, in the account menu the learner picker used. */
const QUICK_LINKS = [
  { href: "/signals", label: "Today's signals" },
  { href: "/dashboard", label: "Model card" },
  { href: "/evidence", label: "Evidence" },
  { href: "/watchlist", label: "Watchlist" },
];

function RailButton({
  label,
  active,
  onClick,
  href,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) {
  const className = cn(styles.railButton, active && styles.railButtonActive);
  const inner = href ? (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick} aria-label={label} aria-pressed={active}>
      {children}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The icon rail: mark, "new learner", and the signed-in user pinned at the end (§19). */
// `learnerId`, `displayName` and `learners` stay on RailProps because callers still
// pass them, but the rail itself renders none of them — it is icons, the mark and the
// account button. Destructuring them here only made them look used.
export function Rail({ user, onOpenProfile, onSignOut, children }: RailProps) {
  const userLabel = user.name ?? user.email ?? "Account";
  return (
    <nav className={styles.rail} aria-label="Workspace">
      <Link href="/" className={styles.mark} aria-label={`${IDEA_NAME} home`}>
        <svg viewBox="0 0 160 160" aria-hidden>
          <path d="M12 18h50c0 25 11 38 36 38v22c-25 0-36 13-36 38H12V18Z" fill="currentColor" />
          <path d="M148 142H98c0-25-11-38-36-38V82c25 0 36-13 36-38h50v98Z" fill="currentColor" />
        </svg>
      </Link>

      {/*
        Was a "New learner" button. The learner concept is retired (§7.1), so the rail's
        one quick action is now the thing a user most often wants from the workspace:
        their own watchlist.
      */}
      <div className={styles.railGroup}>
        <RailButton label="Watchlist" href="/watchlist">
          <Star />
        </RailButton>
      </div>

      {children}

      <DropdownMenu.Root modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenu.Trigger asChild>
              <button type="button" className={styles.userButton} aria-label={`Account: ${userLabel}`} data-testid="user-button">
                {user.image ? (
                  // Google's avatar host varies per account; a plain img keeps it out of the image optimiser's allow-list.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className={styles.avatar}>{initials(userLabel)}</span>
                )}
              </button>
            </DropdownMenu.Trigger>
          </TooltipTrigger>
          <TooltipContent side="right">{userLabel}</TooltipContent>
        </Tooltip>

        <DropdownMenu.Portal>
          <DropdownMenu.Content side="right" align="end" sideOffset={10} className={styles.menu}>
            <div className={styles.menuIdentity}>
              <strong>{user.name ?? "Signed in"}</strong>
              {user.email && <span>{user.email}</span>}
            </div>

            {/*
              The learner switcher is gone with the learner concept. What a user actually
              switches between here are the product's own surfaces, so the menu lists
              those — and `learners` is kept on the props as an empty array so the shell's
              own type does not have to change.
            */}
            <DropdownMenu.Separator className={styles.menuSeparator} />
            <DropdownMenu.Label className={styles.menuLabel}>
              <Users /> Go to
            </DropdownMenu.Label>
            {QUICK_LINKS.map((link) => (
              <DropdownMenu.Item key={link.href} asChild className={styles.menuItem}>
                <Link href={link.href}>
                  <span className={styles.menuItemText}>{link.label}</span>
                </Link>
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className={styles.menuSeparator} />
            <DropdownMenu.Item className={styles.menuItem} onSelect={onOpenProfile}>
              <UserRound /> Risk profile
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={onSignOut} data-testid="sign-out">
              <LogOut /> Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  );
}
