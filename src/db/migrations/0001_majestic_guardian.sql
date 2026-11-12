CREATE TABLE "risk_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"horizon_sessions" integer DEFAULT 1 NOT NULL,
	"risk_tolerance" text DEFAULT 'balanced' NOT NULL,
	"min_probability" real DEFAULT 0.5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"ticker" text NOT NULL,
	"as_of_session" text NOT NULL,
	"abstain" integer DEFAULT 0 NOT NULL,
	"probability_up" real,
	"direction" text,
	"threshold" real NOT NULL,
	"volatility_regime" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"ticker" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_profile" ADD CONSTRAINT "risk_profile_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_profile" ADD CONSTRAINT "risk_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals_snapshot" ADD CONSTRAINT "signals_snapshot_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risk_profile_session" ON "risk_profile" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "signals_snapshot_ticker" ON "signals_snapshot" USING btree ("ticker","shown_at");--> statement-breakpoint
CREATE INDEX "watchlist_session" ON "watchlist" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_session_ticker" ON "watchlist" USING btree ("session_id","ticker");