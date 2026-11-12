import { z } from "zod";

/** The signed-in Google user as the app sees it (§19): what Auth.js puts on the session. */
export const SessionUserSchema = z.object({
  /**
   * A plain string, not a uuid: with database sessions it is the `users.id` uuid, but with
   * JWT sessions (the embedded-database path) it is the provider's subject claim. Anything
   * storing it in a uuid column must check `isUuid` first.
   */
  id: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** True when `id` can be stored in a uuid column, i.e. it came from the database adapter. */
export function isUuid(id: string): boolean {
  return z.uuid().safeParse(id).success;
}
