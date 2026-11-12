import type { AdapterAccountType } from "next-auth/adapters";
import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * Embedding width. One constant because a pgvector column is fixed at DDL time — changing
 * it means a new migration. The mock embedding provider produces vectors of exactly this
 * width so the whole app works with no embedding key.
 */
export const EMBEDDING_DIM = 768;

/** Postgres `tsvector`, which Drizzle has no first-class type for. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

// ───────────────────────────── Auth.js ─────────────────────────────
// Column names follow the Drizzle adapter's defaults so the adapter needs no mapping.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// ─────────────────────── Application tables ───────────────────────
// `sessions` is taken by Auth.js, so an agent conversation is an `agent_sessions` row.
// Everything the agent does hangs off one of these, which is also what makes a demo
// reproducible: load a seed, get a session, replay it.

export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null for an anonymous visitor; the demo works without signing in. */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  /** "live" | "cached" | "mock" — what the LLM layer was doing for this session. */
  llmMode: text("llm_mode").notNull().default("mock"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull(), // user | assistant | tool
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("messages_session_created").on(table.sessionId, table.createdAt)],
);

/**
 * Durable memory. Keyword search runs over a generated `tsvector`; similarity runs over
 * the HNSW index on `embedding`. `search_memory` does the keyword prefilter first and
 * reranks by distance, so it still returns sensible results when embeddings are mocked.
 */
export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => agentSessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // fact | preference | correction | note
    content: text("content").notNull(),
    source: text("source"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    searchable: tsvector("searchable").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`to_tsvector('english', ${memoryItems.content})`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("memory_items_embedding").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("memory_items_searchable").using("gin", table.searchable),
    index("memory_items_user").on(table.userId, table.createdAt),
  ],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** "file" | "url" | "paste" — how it arrived. */
  kind: text("kind").notNull(),
  sourceRef: text("source_ref"),
  bytes: integer("bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    searchable: tsvector("searchable").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`to_tsvector('english', ${chunks.content})`,
    ),
  },
  (table) => [
    uniqueIndex("chunks_doc_ordinal").on(table.documentId, table.ordinal),
    index("chunks_embedding").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("chunks_searchable").using("gin", table.searchable),
  ],
);

/** Anything the agent wants to do to the outside world waits here for a human. */
export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .notNull(),
    /** Connector id the action would be pushed to, e.g. "mock", "github-issues". */
    connector: text("connector").notNull(),
    kind: text("kind").notNull(), // create_task | send_message | schedule_reminder | ...
    /** What the user sees in the tray before approving. */
    preview: text("preview").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | failed
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("pending_actions_status").on(table.status, table.createdAt)],
);

/** Everything that actually went out, or is scheduled to. The demo's receipt drawer. */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
    actionId: uuid("action_id").references(() => pendingActions.id, { onDelete: "set null" }),
    connector: text("connector").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    /** Null means "send now"; a future time means the scheduler owns it. */
    deliverAfter: timestamp("deliver_after", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    status: text("status").notNull().default("queued"), // queued | delivered | failed
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("outbox_pending").on(table.status, table.deliverAfter)],
);

/**
 * The proof that the thing is agentic. One row per step, append-only, streamed to the
 * client over SSE as it is written.
 */
export const traceEvents = pgTable(
  "trace_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .notNull(),
    seq: integer("seq").notNull(),
    /** thought | tool_call | tool_result | verify | rule | approval_needed | final | fallback */
    type: text("type").notNull(),
    label: text("label"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model"),
    durationMs: integer("duration_ms"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("trace_events_session_seq").on(table.sessionId, table.seq)],
);

/** Hash of (model family + prompt + schema) → the response. Makes a rehearsed demo instant. */
export const llmCache = pgTable("llm_cache", {
  key: text("key").primaryKey(),
  modelFamily: text("model_family").notNull(),
  response: jsonb("response").notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────── NSE Copilot tables ───────────────────────
//
// The template's application tables above are domain-agnostic and are kept unchanged
// (§7.1 asked for learner/skill/course tables to be replaced; the template's schema turned
// out to carry none — it is already generic, so this is purely additive).
//
// Three tables, and one rule that shapes all of them: **nothing the model predicts is
// stored here.** Signals, probabilities and metrics live in `ml/artifacts/` and are read
// through the service. A copy of a probability in Postgres would be a second source of
// truth that can go stale, and a stale probability presented as today's is the exact class
// of failure this build exists to avoid. `signals_snapshot` is the one deliberate
// exception and it is an *audit log*, not a cache — see its comment.
//
// `user_id` is nullable everywhere and written through `persistableUserId()` in
// `src/auth.ts`. With auth unconfigured the app hands out a fixed anonymous identity that
// has no `users` row, so writing it directly makes the foreign key reject the insert — and
// that failure surfaces inside the assistant's own answer, which is a confusing place to
// debug it.

/** Names the user is tracking. */
export const watchlist = pgTable(
  "watchlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("watchlist_session").on(table.sessionId, table.createdAt),
    // One entry per ticker per session: adding the same name twice is a no-op, not a
    // duplicate row the UI then has to de-duplicate on read.
    uniqueIndex("watchlist_session_ticker").on(table.sessionId, table.ticker),
  ],
);

/**
 * An audit trail of what the user was actually shown, and when.
 *
 * This is not a cache and must never be read as one. The point is accountability: if a
 * signal is acted on, there has to be a record of exactly what the model said at that
 * moment, because the model is retrained and the artifact is regenerated. `probability_up`
 * here is the value *as displayed on `shown_at`* — reading it later and presenting it as
 * current would be the staleness bug this table's existence otherwise invites, so every
 * read path in the app treats it as history.
 */
export const signalsSnapshot = pgTable(
  "signals_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    /** The session the signal was *about*, not the moment it was rendered. */
    asOfSession: text("as_of_session").notNull(),
    abstain: integer("abstain").notNull().default(0),
    /** Calibrated. Null when the model abstained — there is no direction to attach. */
    probabilityUp: real("probability_up"),
    direction: text("direction"),
    threshold: real("threshold").notNull(),
    volatilityRegime: text("volatility_regime"),
    /** The whole payload, so the record is complete even if the schema grows. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    shownAt: timestamp("shown_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("signals_snapshot_ticker").on(table.ticker, table.shownAt)],
);

/**
 * The user's own risk settings.
 *
 * `min_probability` is a **display** filter and is constrained at the application edge to
 * be at or above the model's frozen threshold. It can only ever show the user *fewer*
 * signals. §6.5 freezes the model's threshold precisely so it cannot become a dial for
 * making the coverage-accuracy curve look better, and a user-editable setting that could
 * lower it would reopen that dial from the other side.
 */
export const riskProfile = pgTable(
  "risk_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    horizonSessions: integer("horizon_sessions").notNull().default(1),
    riskTolerance: text("risk_tolerance").notNull().default("balanced"),
    minProbability: real("min_probability").notNull().default(0.5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("risk_profile_session").on(table.sessionId)],
);

/** One row per eval run; the number that goes in the README's "Measured accuracy". */
export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  suite: text("suite").notNull(),
  mode: text("mode").notNull(), // mock | cached | live
  total: integer("total").notNull(),
  passed: integer("passed").notNull(),
  details: jsonb("details").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
