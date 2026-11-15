"use client";

import { useCallback, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import type { TraceEvent } from "@/lib/agent/trace";
import type { SessionUser } from "@/schemas";
import type {
  MagnitudePayload,
  MetricsPayload,
  NeighborsPayload,
  SignalsPayload,
} from "@/schemas/finance";
import type { MlResult } from "@/lib/ml/client";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ConfirmTray, type PendingAction } from "@/components/agent/ConfirmTray";
import { TracePanel } from "@/components/agent/TracePanel";
import { AppShell, type PaneTab } from "@/components/shell/AppShell";
import { CONFIDENCE_THRESHOLD, IDEA_NAME } from "@/lib/config/client";
import { SignalsBoard } from "./SignalsBoard";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { ModelCard } from "./ModelCard";
import { magnitudeByTicker, perTickerAccuracy, sessionDate } from "./format";

/**
 * The workspace, in the shell's own three-region layout: icon rail · chat · switchable
 * pane.
 *
 * This is §7.1's tab mapping, finally built in the chrome it was meant for. The first
 * pass made each of these surfaces a separate top-level route, which worked but threw away
 * the layout the shell was good at — you lost the conversation the moment you went to look
 * at a signal, which is exactly backwards for a product whose whole pitch is *ask it why*.
 *
 * | Tab | What it was in the template |
 * |---|---|
 * | Signals | the dashboard tab |
 * | Evidence | the path tab |
 * | Model card | the dashboard page |
 * | Agent | the trace + approvals tab |
 *
 * All four panes render the same components the standalone routes do, so there is one
 * implementation of each surface and the routes remain linkable.
 *
 * Everything is passed in from the server page already fetched. The pane does no data
 * loading of its own, which is what keeps tab switching instant — the lag in the first
 * version was a blocking round trip on every single navigation.
 */

type Tab = "signals" | "evidence" | "model" | "agent";

const TABS: PaneTab[] = [
  { id: "signals", label: "Signals" },
  { id: "evidence", label: "Evidence" },
  { id: "model", label: "Model card" },
  { id: "agent", label: "Agent" },
];

export function CopilotWorkspace({
  user,
  signals,
  metrics,
  evidence,
  evidenceTicker,
  magnitude,
}: {
  user: SessionUser;
  signals: MlResult<SignalsPayload>;
  metrics: MlResult<MetricsPayload>;
  evidence: MlResult<NeighborsPayload>;
  evidenceTicker: string;
  /** The magnitude head. Optional: that head can be absent while the rest works. */
  magnitude?: MlResult<MagnitudePayload>;
}) {
  const [tab, setTab] = useState<Tab>("signals");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * One session id for the life of this workspace.
   *
   * A lazy `useState` initialiser, not an effect and not a ref read during render —
   * both of which React's lint rules reject, and rightly: the first causes a cascading
   * re-render and the second is a render-phase side effect.
   *
   * The server pass generates an id too, and the client's replaces it at hydration. That
   * is harmless here because the id is never *rendered* — it is a React key and a field
   * in the chat request body, so there is no text for hydration to mismatch on. The route
   * treats an unrecognised id as a new conversation and inserts the row on first message,
   * so nothing is created until something is actually said.
   *
   * One id for the whole visit is deliberate: the conversation should carry across tab
   * switches, and a session carries the per-session tool budget.
   */
  const [sessionId] = useState(() => crypto.randomUUID());

  const refreshPending = useCallback(async () => {
    try {
      const res = await fetch("/api/approve");
      if (!res.ok) return;
      setPending(((await res.json()) as { pending: PendingAction[] }).pending ?? []);
    } catch {
      // A failed poll leaves the tray as it was; nothing to tell the user.
    }
  }, []);

  const decide = useCallback(
    async (id: string, decision: "approve" | "reject", edits?: { preview: string }) => {
      setDecidingId(id);
      try {
        await fetch("/api/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionId: id, decision, edits }),
        });
      } finally {
        setDecidingId(null);
        void refreshPending();
      }
    },
    [refreshPending],
  );

  const signalSummary =
    signals.source === "service"
      ? `${signals.data.summary.signals_emitted} called · ${signals.data.summary.abstained} abstained`
      : "model service unavailable";

  return (
    <AppShell
      rail={{
        learnerId: sessionId,
        displayName: IDEA_NAME,
        user,
        learners: [],
        onOpenProfile: () => setTab("model"),
        onSignOut: () => void signOut({ callbackUrl: "/" }),
      }}
      chatHeader={
        <div className="flex min-w-0 flex-col justify-center">
          <span className="label-caps truncate text-[12px] text-ink-2" data-testid="workspace-title">
            {signalSummary}
          </span>
        </div>
      }
      chat={
        <ChatPanel
          key={sessionId}
          learnerId={sessionId}
          initialMessages={[]}
          onProfileUpdated={() => undefined}
          onPathUpdated={() => undefined}
          onNovaState={() => undefined}
          inputRef={chatInputRef}
          onTrace={(event) => {
            setTraceEvents((prev) => [...prev, event]);
            if (event.type === "approval_needed") void refreshPending();
          }}
        />
      }
      tabs={TABS}
      tab={tab}
      fullWidth={tab === "model"}
      onTabChange={(id) => setTab(id as Tab)}
      paneAside={
        signals.source === "service" ? (
          <Badge variant="mono" data-testid="as-of">
            {sessionDate(signals.data.data.last_session)}
          </Badge>
        ) : null
      }
      pane={
        <>
          {/*
            The page's one `h1`. The inherited shell carries its hierarchy visually — the
            rail, the nav and the tab strip — and so ships no `h1` at all, which left every
            pane heading an `h2` under nothing and `/workspace` the only page in the app
            with no top-level heading. A screen reader user landing here got a document
            that starts at level two.

            Visually hidden rather than drawn, because adding a visible title above the tabs
            would change a layout that is deliberately not mine to redesign. It names the
            tab so the heading tracks what the pane is actually showing.
          */}
          <h1 className="sr-only">
            Copilot workspace — {TABS.find((t) => t.id === tab)?.label ?? "Signals"}
          </h1>
          {tab === "signals" && (
            <section data-testid="signals-section" className="flex flex-col gap-4">
              <div>
                <h2 className="text-[22px] font-[420] tracking-[-0.03em]">Today&rsquo;s signals</h2>
                <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-2">
                  A calibrated call for each name in the basket, or an explicit abstention.
                  Ask the Copilot on the left why any of them reads the way it does.
                </p>
              </div>
              <SignalsBoard
                result={signals}
                perTicker={
                  metrics.source === "service"
                    ? perTickerAccuracy(metrics.data.breakdowns)
                    : undefined
                }
                magnitude={
                  magnitude?.source === "service"
                    ? magnitudeByTicker(magnitude.data.signals)
                    : undefined
                }
              />
            </section>
          )}

          {tab === "evidence" && (
            <section data-testid="evidence-section" className="flex flex-col gap-4">
              <EvidenceTimeline result={evidence} />
              <p className="text-[11px] text-ink-4">
                Showing {evidenceTicker.replace(/\.NS$/, "")}. The full picker is on the{" "}
                <a href="/evidence" className="underline underline-offset-2 hover:text-ink-2">
                  evidence page
                </a>
                .
              </p>
            </section>
          )}

          {tab === "model" && (
            <section data-testid="model-section">
              <ModelCard result={metrics} />
            </section>
          )}

          {tab === "agent" && (
            <section className="flex h-full min-h-[360px] flex-col gap-4" data-testid="agent-section">
              <div>
                <h2 className="text-[22px] font-[420] tracking-[-0.03em]">Agent</h2>
                <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-2">
                  Every step the Copilot took on the last turn, and anything waiting for your
                  approval. Nothing reaches the outside world until you approve it.
                </p>
              </div>
              <TracePanel
                events={traceEvents}
                threshold={CONFIDENCE_THRESHOLD}
                running={false}
                className="min-h-0 flex-1"
              />
              <ConfirmTray actions={pending} onDecide={decide} busyId={decidingId} />
            </section>
          )}
        </>
      }
    />
  );
}
