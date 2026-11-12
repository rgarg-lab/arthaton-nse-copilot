import { ImageResponse } from "next/og";
import { ASSISTANT_ROLE, IDEA_NAME, IDEA_TAGLINE } from "@/lib/config/client";

/**
 * Every string here now comes from `idea.config.ts`.
 *
 * This file was the last place carrying the template's inherited copy, and it is the one
 * that matters most for a submission: it is the card that renders when the project link is
 * pasted into a judging form or a chat. It described "an AI learning mentor" that "maps
 * your skill gap and builds a learning path from real courses" — an accurate description of
 * a different product.
 */
export const alt = `${IDEA_NAME} — ${IDEA_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card: the wordmark on the ink base with the violet light, matching the landing. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(60% 70% at 80% 20%, rgba(135,101,255,0.28), rgba(5,5,6,0) 70%), #050506",
          color: "#f5f5f7",
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#a78bfa", boxShadow: "0 0 18px #a78bfa" }} />
          {ASSISTANT_ROLE}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 600, letterSpacing: -7, lineHeight: 0.95 }}>
            <span>Most stock tools</span>
            <span>always have an answer.</span>
            <span style={{ color: "#a78bfa" }}>This one tells you when it doesn&apos;t.</span>
          </div>
          {/**
           * One child, and an explicit `display`.
           *
           * Satori (which renders this to PNG) throws on a `<div>` with more than one
           * child node unless `display` is set explicitly — and `{IDEA_TAGLINE} some
           * text` is *two* nodes, an expression and a string. It fails at build time
           * during prerender, not at runtime, so the whole production build goes red.
           */}
          <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.62)", maxWidth: 940, lineHeight: 1.35 }}>
            {`${IDEA_TAGLINE} Historical and paper-trading analysis only — not investment advice.`}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "rgba(255,255,255,0.5)" }}>
          <span style={{ fontWeight: 600, color: "#f5f5f7", letterSpacing: -1 }}>{IDEA_NAME}</span>
          <span>{process.env.NEXT_PUBLIC_SITE_URL ?? "localhost:3000"}</span>
        </div>
      </div>
    ),
    size,
  );
}
