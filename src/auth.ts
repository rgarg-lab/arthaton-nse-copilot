import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { accounts, dbSync, sessions, users, verificationTokens } from "@/db";
import { SessionUserSchema } from "@/schemas";
import { env } from "@/lib/env";

/** Google sign-in is on only when both halves of the credential are present. */
export function authConfigured(): boolean {
  return Boolean(env("AUTH_GOOGLE_ID") && env("AUTH_GOOGLE_SECRET"));
}

/**
 * Sign in with Google. Optional by design: the whole app works signed out, because a
 * hackathon demo should never open with a login wall.
 *
 * Session storage depends on the database driver. With a real DATABASE_URL the Drizzle
 * adapter persists sessions in Postgres. With the embedded database there is no
 * synchronous handle to hand the adapter, so sessions are JWTs instead — same API
 * surface, nothing persisted server-side.
 */
// A config factory, not an object: nothing connects at import time, so builds and tests
// run with no database and no keys.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const sync = dbSync();
  const providers = authConfigured() ? [Google] : [];
  if (!sync) {
    return { providers, session: { strategy: "jwt" as const }, pages: { signIn: "/sign-in" } };
  }
  return {
    adapter: DrizzleAdapter(sync, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers,
    session: { strategy: "database" as const },
    pages: { signIn: "/sign-in" },
    callbacks: {
      // What the client may see: the user (with id, so routes can check ownership) and
      // the expiry. Never the adapter row itself — that carries the session token.
      session({ session, user }) {
        return {
          expires: session.expires,
          user: {
            id: user.id,
            name: user.name ?? null,
            email: user.email ?? null,
            image: user.image ?? null,
          },
        };
      },
    },
  };
});

/**
 * Validated shape of the signed-in user, or null. Routes and pages go through this.
 *
 * Short-circuits when sign-in is not configured. Auth.js logs a `MissingSecret` error
 * every time it is called without `AUTH_SECRET`, so on a fresh clone the dev console
 * filled with red on every request while the app worked perfectly — which is a good way
 * to convince someone their setup is broken. With no providers nobody can be signed in,
 * so there is nothing to ask.
 */
export async function currentUser() {
  if (!authConfigured()) return null;
  const session = await auth();
  if (!session?.user) return null;
  const parsed = SessionUserSchema.safeParse({
    id: session.user.id ?? null,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The visitor, or a stand-in when sign-in is not configured.
 *
 * The restored workspace was written for an app where Google sign-in was mandatory, and it
 * redirects a signed-out visitor to `/sign-in`. With no `AUTH_GOOGLE_*` keys there is
 * nothing to sign in *with*, so that redirect would make the whole workspace unreachable —
 * which breaks the template's one hard promise, that a fresh clone works with no keys.
 *
 * So: a configured deployment behaves exactly as before. An unconfigured one hands out a
 * fixed anonymous identity instead, and the app runs. The id is a real uuid so it can be
 * stored against the uuid columns the schema uses.
 */
export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Demo visitor",
  email: null,
  image: null,
} as const;

export async function currentUserOrDemo() {
  const user = await currentUser();
  if (user) return user;
  return authConfigured() ? null : { ...DEMO_USER };
}

/**
 * The id to store against a `user_id` column, or null.
 *
 * The demo identity exists for the UI's benefit only — there is no row for it in `users`,
 * so writing it to any column that references `users.id` fails the foreign key. That is
 * exactly what happened: `save_memory` threw on every turn and the failure was visible in
 * the assistant's own answer. Anything persisting a user id goes through this.
 */
export function persistableUserId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id === DEMO_USER.id ? null : id;
}
