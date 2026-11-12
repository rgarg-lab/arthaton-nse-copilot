/**
 * Sign-in URL helpers. Kept apart from authz.ts, which pulls in Auth.js and the database:
 * client components link to the sign-in page and must not bundle either.
 */

export function signInUrl(returnTo: string): string {
  return `/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`;
}

/** Where an unusable or hostile callback URL lands. `/learn` is retired (§7.1). */
export const DEFAULT_RETURN_TO = "/signals";

/**
 * Only same-origin paths are honoured as a return address.
 *
 * The three rejected shapes are the open-redirect ones: a bare host, a protocol-relative
 * `//evil.com`, and `/\evil.com`, which some browsers normalise to the protocol-relative
 * form. Anything that is not an unambiguous same-origin path goes to the default.
 */
export function safeCallbackUrl(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_RETURN_TO;
  }
  return raw;
}
