/**
 * Server startup hook.
 *
 * The embedded database is Postgres compiled to WASM, and it boots — and migrates itself —
 * on the first connection. That work used to land on whoever loaded the first page: the
 * landing took 24 seconds once and was then instant, which is the worst possible
 * distribution, because the one slow request is a judge's first click.
 *
 * Warming it here moves that cost into `npm start`, before anything is being served.
 *
 * Deliberately not awaited and deliberately swallowing errors: a server that cannot reach
 * its database should still boot and serve the landing page, and `/preflight` is where
 * that problem gets reported.
 */
export async function register() {
  // Only the Node runtime has a database; the edge runtime would fail the import.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  void (async () => {
    const started = Date.now();
    try {
      const { db } = await import("@/db");
      await db();
      console.log(`[startup] database ready in ${Date.now() - started}ms`);
    } catch (err) {
      console.warn("[startup] database not ready; /preflight will say why:", (err as Error).message);
    }
  })();
}
