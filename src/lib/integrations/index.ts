import { env } from "@/lib/env";
/**
 * Connectors: the one boundary where the system touches the outside world.
 *
 * This is also the partner-tool integration slot. Each connector is enabled purely by the
 * presence of its env keys, so an idea gains a real integration by pasting a token into
 * `.env.local` — no code change, no conditional sprinkled through the app.
 *
 * Only `src/lib/approvals` calls `push()`. Tools cannot reach a connector at all, which
 * is what makes "nothing acts without approval" structural rather than aspirational.
 */

export type ConnectorAction = {
  kind: string;
  payload: Record<string, unknown>;
  /** Human-readable text, used by connectors that just need a body. */
  preview: string;
};

export type PushResult = {
  ok: boolean;
  /** Where it landed, when the service gives a URL or id. */
  ref?: string;
  detail?: string;
};

export type Connector = {
  id: string;
  name: string;
  /** Which env vars this connector needs, for /preflight to report. */
  requires: string[];
  isConfigured(): boolean;
  push(action: ConnectorAction): Promise<PushResult>;
};

/**
 * The default. Writes nowhere, succeeds always, and is explicit that it is a mock —
 * the outbox row it produces is what the demo shows.
 */
export const mockConnector: Connector = {
  id: "mock",
  name: "Mock (outbox only)",
  requires: [],
  isConfigured: () => true,
  async push(action) {
    return {
      ok: true,
      ref: `mock:${action.kind}:${Date.now()}`,
      detail: "Delivered to the local outbox. No external service was contacted.",
    };
  },
};

export const githubIssuesConnector: Connector = {
  id: "github-issues",
  name: "GitHub Issues",
  requires: ["GITHUB_TOKEN", "GITHUB_REPO"],
  isConfigured: () => Boolean(env("GITHUB_TOKEN") && env("GITHUB_REPO")),
  async push(action) {
    const repo = process.env.GITHUB_REPO!; // "owner/name"
    const title = String(action.payload.title ?? action.preview.slice(0, 80));
    const body = String(action.payload.body ?? action.preview);
    const labels = Array.isArray(action.payload.labels) ? (action.payload.labels as string[]) : [];
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title, body, labels }),
      });
      if (!res.ok) return { ok: false, detail: `github ${res.status}: ${(await res.text()).slice(0, 200)}` };
      const json = (await res.json()) as { html_url?: string; number?: number };
      return { ok: true, ref: json.html_url ?? `#${json.number}`, detail: "Issue created." };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
};

export const notionConnector: Connector = {
  id: "notion",
  name: "Notion",
  requires: ["NOTION_TOKEN", "NOTION_DATABASE_ID"],
  isConfigured: () => Boolean(env("NOTION_TOKEN") && env("NOTION_DATABASE_ID")),
  async push(action) {
    const title = String(action.payload.title ?? action.preview.slice(0, 80));
    const body = String(action.payload.body ?? action.preview);
    try {
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          "content-type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: process.env.NOTION_DATABASE_ID },
          properties: { Name: { title: [{ text: { content: title } }] } },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: body.slice(0, 1900) } }] },
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false, detail: `notion ${res.status}: ${(await res.text()).slice(0, 200)}` };
      const json = (await res.json()) as { url?: string; id?: string };
      return { ok: true, ref: json.url ?? json.id, detail: "Page created." };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
};

export const emailConnector: Connector = {
  id: "email",
  name: "Email (Resend)",
  requires: ["RESEND_API_KEY", "RESEND_FROM"],
  isConfigured: () => Boolean(env("RESEND_API_KEY") && env("RESEND_FROM")),
  async push(action) {
    const to = String(action.payload.to ?? "");
    if (!to) return { ok: false, detail: "no recipient" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM,
          to: [to],
          subject: String(action.payload.subject ?? "(no subject)"),
          text: String(action.payload.body ?? action.preview),
        }),
      });
      if (!res.ok) return { ok: false, detail: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
      const json = (await res.json()) as { id?: string };
      return { ok: true, ref: json.id, detail: `Email sent to ${to}.` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
};

export const slackWebhookConnector: Connector = {
  id: "slack-webhook",
  name: "Slack (incoming webhook)",
  requires: ["SLACK_WEBHOOK_URL"],
  isConfigured: () => Boolean(env("SLACK_WEBHOOK_URL")),
  async push(action) {
    try {
      const res = await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: String(action.payload.body ?? action.preview) }),
      });
      if (!res.ok) return { ok: false, detail: `slack ${res.status}` };
      return { ok: true, ref: "slack", detail: "Posted to Slack." };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
};

export const CONNECTORS: Connector[] = [
  mockConnector,
  githubIssuesConnector,
  notionConnector,
  emailConnector,
  slackWebhookConnector,
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/**
 * Resolve the connector an action should actually use.
 *
 * If the named connector is not configured, fall back to the mock rather than failing:
 * an approval that cannot deliver should still be recorded in the outbox, and the
 * fallback is reported in the result so the UI can say what happened.
 */
export function resolveConnector(id: string): { connector: Connector; fellBack: boolean } {
  const wanted = connectorById(id);
  if (wanted?.isConfigured()) return { connector: wanted, fellBack: false };
  return { connector: mockConnector, fellBack: true };
}

export function configuredConnectors(): Connector[] {
  return CONNECTORS.filter((c) => c.isConfigured());
}
