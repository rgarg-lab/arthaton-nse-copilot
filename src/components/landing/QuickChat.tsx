"use client";

import { ArrowRight, LogIn, X } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Orb } from "@/components/ui/orb";
import { signInUrl } from "@/lib/signInUrl";
import { NOVA_LABEL, NOVA_ORB } from "@/nova/stage";
import type { NovaState } from "@/schemas";

import styles from "./quickchat.module.css";
import { ASSISTANT_NAME } from "@/lib/config/client";

type QuickChatApi = { open: () => void; close: () => void; isOpen: boolean };
const QuickChatContext = createContext<QuickChatApi | null>(null);

export function useQuickChat(): QuickChatApi {
  const ctx = useContext(QuickChatContext);
  if (!ctx) throw new Error("useQuickChat must be used inside <QuickChatProvider>");
  return ctx;
}

const ENTER = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

/**
 * The one frame between opening the drawer and the session id existing.
 *
 * Copy lives in `idea.config.ts` as a rule, and this is the exception that proves it: the
 * string is a *loading* state for a component that renders for one frame, not product
 * copy, and threading a config value through for it would put a schema field in front of
 * something nobody will read. Named here so it is still in one place.
 */
const QUICK_CHAT_LEAD = "Opening a session…";

type Learner = { id: string; displayName: string };

/**
 * What the landing page knows about the visitor.
 *
 * `learner` is retained in the type but is always `null` in this build: the learner
 * concept is retired (§7.1) and the quick chat now opens a plain agent session instead.
 * Kept rather than removed because `app/page.tsx` still distinguishes signed-in from
 * signed-out, and auth is a supported-but-unconfigured path here.
 */
export type QuickChatVisitor = { signedIn: false } | { signedIn: true; learner: Learner | null };

/**
 * `Talk to ${ASSISTANT_NAME}` on the landing: a glass drawer with the real chat inside.
 *
 * **Rewired, not redesigned.** The drawer, its motion, its scrim and its CSS module are
 * untouched; what changed is what gates the chat. The template gated it on a signed-in
 * visitor with a named "learner", and offered a sign-in button otherwise — which in this
 * build meant the drawer rendered a form asking for the visitor's name before it would
 * talk about stocks, and with auth unconfigured it rendered nothing useful at all.
 *
 * Now it opens immediately, signed in or not, on a fresh agent session. That matches the
 * rest of the app: there is no login wall, and a visitor asking "what are today's signals"
 * should not be asked their first name first.
 */
export function QuickChatProvider({
  // Accepted and unused: the drawer no longer gates on it, but `app/page.tsx` computes it
  // and the prop keeps the signature stable for whenever auth is configured.
  visitor: _visitor,
  children,
}: {
  visitor: QuickChatVisitor;
  children: ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const api = useMemo<QuickChatApi>(
    () => ({ open: () => setOpen(true), close: () => setOpen(false), isOpen }),
    [isOpen],
  );
  return (
    <QuickChatContext.Provider value={api}>
      {children}
      <QuickChatDrawer open={isOpen} onClose={api.close} />
    </QuickChatContext.Provider>
  );
}

function QuickChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const [nova, setNova] = useState<NovaState>("idle");

  /**
   * One session id per drawer opening, generated on the client.
   *
   * `/api/chat` treats an id it has never seen as a new conversation and inserts the row
   * on the first message, so nothing has to be created up front — the drawer opens with no
   * network call at all, which is what lets the landing page stay instant.
   *
   * A fresh id each time it is opened, deliberately: a session carries a per-session tool
   * budget, and reusing one across a whole demo eventually exhausts it, after which every
   * turn silently takes the fallback path with no tool calls and nothing visibly wrong.
   */
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (open && !sessionId) setSessionId(crypto.randomUUID());
    if (!open) setSessionId(null);
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className={styles.scrim}
            aria-label="Close chat"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={`Quick chat with ${ASSISTANT_NAME}`}
            initial={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={ENTER}
          >
            <header className={styles.header}>
              <div className={styles.presence} data-state={nova}>
                <Orb state={NOVA_ORB[nova]} size={20} paused={reduce} />
                <div>
                  <span className="label-caps">Quick chat</span>
                  <strong>{NOVA_LABEL[nova]}</strong>
                </div>
              </div>
              <div className={styles.headerActions}>
                <Button asChild variant="secondary" size="sm" className="ring-orbit">
                  <Link href="/workspace">
                    Full workspace <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                  <X />
                </button>
              </div>
            </header>

            {sessionId ? (
              <div className={styles.body}>
                <ChatPanel
                  key={sessionId}
                  learnerId={sessionId}
                  initialMessages={[]}
                  onProfileUpdated={() => undefined}
                  onPathUpdated={() => undefined}
                  onNovaState={setNova}
                  compact
                />
              </div>
            ) : (
              <div className={styles.start}>
                <Orb state="breathing" size={64} label={`${ASSISTANT_NAME}`} paused={reduce} />
                <h2 className={styles.startTitle}>
                  Hi, I&apos;m <span className="text-gradient-violet">{ASSISTANT_NAME}</span>.
                </h2>
                <p className={styles.startLead}>{QUICK_CHAT_LEAD}</p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
