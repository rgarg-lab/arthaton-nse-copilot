-- Scope the watchlist and the risk profile by owner, not by agent session.
--
-- Hand-written rather than generated: `drizzle-kit generate` prompts interactively to ask
-- whether a column was added or renamed, and it has no TTY in this environment. The
-- statements below are what it would have produced for the schema change, in the order
-- Drizzle applies them.
--
-- Why the change: both tables are reached from a *page* in the nav, and a page has no
-- agent session. Keying on `session_id` meant a watchlist that silently emptied whenever a
-- new conversation started, and a risk profile that reset with it.
--
-- The unique index could not stay on `(session_id, ticker)` either. Postgres treats NULLs
-- as distinct in a unique index, so with a null session every add would insert another row
-- and the page would have to de-duplicate on read — the bug being designed out.
--
-- `scope` is the signed-in user's id, or the literal 'anonymous'. It is deliberately plain
-- text with no foreign key: the app runs signed out by default, and an FK to `users` would
-- make the supported path the broken one.

--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN "scope" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint
ALTER TABLE "risk_profile" ADD COLUMN "scope" text DEFAULT 'anonymous' NOT NULL;--> statement-breakpoint

-- `session_id` survives on `watchlist` as provenance (which conversation added a name),
-- but it no longer cascades: deleting a conversation must not delete the user's list.
ALTER TABLE "watchlist" DROP CONSTRAINT IF EXISTS "watchlist_session_id_agent_sessions_id_fk";--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- The risk profile has no session dimension at all now.
ALTER TABLE "risk_profile" DROP CONSTRAINT IF EXISTS "risk_profile_session_id_agent_sessions_id_fk";--> statement-breakpoint
ALTER TABLE "risk_profile" DROP COLUMN IF EXISTS "session_id";--> statement-breakpoint

DROP INDEX IF EXISTS "watchlist_session";--> statement-breakpoint
DROP INDEX IF EXISTS "watchlist_session_ticker";--> statement-breakpoint
DROP INDEX IF EXISTS "risk_profile_session";--> statement-breakpoint

CREATE INDEX "watchlist_scope" ON "watchlist" USING btree ("scope","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_scope_ticker" ON "watchlist" USING btree ("scope","ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_profile_scope" ON "risk_profile" USING btree ("scope");
