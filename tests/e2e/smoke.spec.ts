import { expect, test } from "@playwright/test";

/**
 * The journey that must never break, through the restored UI: landing → the session picker
 * → the workspace → ask the assistant → real tool calls in the trace → approve → the
 * outbox.
 *
 * Runs with no API keys, no DATABASE_URL and mock mode asserted, against the embedded
 * database — the configuration a fresh clone gets, and the one the demo falls back to if a
 * provider dies mid-presentation.
 *
 * Selectors avoid idea copy on purpose. Every user-facing string now comes from
 * `idea.config.ts`, so matching on wording would make this suite break the moment the idea
 * is swapped — which it did, twice, before these were changed to hrefs and roles.
 */

test.describe.configure({ mode: "serial" });

test("the restored demo path works with no keys", async ({ page }) => {
  test.setTimeout(300_000);

  // ── landing ─────────────────────────────────────────────────────────────────
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The hero and the closing CTA both link here; the wording of either is config-driven.
  await expect(page.locator('a[href="/learn"]').first()).toBeVisible();
  // Seed content, not an empty shell: the skill stream renders catalogue items.
  await expect(page.locator("body")).toContainText(/Core Concepts/i);

  /**
   * The hero's right column must show the assistant immediately, not a loading cover.
   *
   * The 3D scene slot ships empty, and "no scene configured" was being treated as a
   * stalled load: the opaque loader sat there for the full 8s timeout on every visit, and
   * server-rendered nothing at all. A timeout-based assertion cannot catch that, because
   * every expect timeout here is longer than 8s and would simply wait it out.
   *
   * So this reads the raw response instead of the live DOM — `page.request` runs no
   * JavaScript, so a timer provably has not fired. The marker is the CSS-module class
   * rather than the preview's wording, for the reason given at the top of this file
   * (production CSS-module names are `<file>-module__<hash>__<local>`).
   */
  const ssr = await page.request.get("/");
  const html = await ssr.text();
  expect(html, "the bot preview must be server-rendered, not revealed by a timer").toMatch(
    /botPreview-module__\w+__card/,
  );
  expect(html, "the hero must not ship a loading cover when no scene is configured").not.toMatch(
    /hero-module__\w+__loader/,
  );

  // The page must have settled before a Link click navigates.
  await page.waitForLoadState("networkidle");
  await page.locator('a[href="/learn"]').first().click();
  // Either the picker, or straight through to a session when there is only one.
  await expect(page).toHaveURL(/\/learn(\/|$)/, { timeout: 90_000 });

  // ── picker ──────────────────────────────────────────────────────────────
  // The picker redirects straight into a session when only one exists, which raced an
  // assertion on the URL: `/learn` matches before the redirect resolves. Asking the API
  // for a session id and navigating to it is deterministic, and still exercises the page.
  const sessions = await page.request.get("/api/learners");
  expect(sessions.ok(), "the session list endpoint should answer").toBe(true);
  const { learners } = (await sessions.json()) as { learners: { id: string }[] };
  expect(learners.length, "the seed must supply at least one session").toBeGreaterThan(0);

  // A fresh session, not whichever one happens to be first. Sessions carry a per-session
  // tool budget, so reusing one across runs eventually exhausts it and every turn after
  // that takes the fallback path with no tool calls — which is exactly how this test
  // failed before: a thin answer and an empty approval tray, with nothing obviously wrong.
  const created = await page.request.post("/api/learners", {
    data: { displayName: `Smoke ${Date.now()}` },
  });
  expect(created.ok(), "creating a session should succeed").toBe(true);
  const { id: sessionId } = (await created.json()) as { id: string };
  await page.goto(`/learn/${sessionId}`);
  await expect(page).toHaveURL(/\/learn\/[0-9a-f-]{36}/, { timeout: 90_000 });

  // ── the workspace, with its original tabs plus the new one ─────────
  // Tabs are role="tab", as the restored shell renders them.
  for (const tab of [/path/i, /skill graph/i, /dashboard/i, /agent/i]) {
    await expect(page.getByRole("tab", { name: tab }).first()).toBeVisible({ timeout: 60_000 });
  }

  // ── ask the assistant ───────────────────────────────────────────────────────
  // The app exposes the composer for tests; the accessible node is the wrapper, so a
  // role lookup resolves to something that cannot be typed into.
  const composer = page.getByTestId("chat-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  // Deliberately not clicked. The rotating suggestion sits over the composer and is itself
  // a button — that is the original design, you either click the suggestion or just type —
  // so a click on the textarea is intercepted and retries forever. `fill` only needs the
  // field to be editable, which is the interaction a typist actually performs.
  await composer.fill("Create a task to review the forecast, due in two weeks.");
  await expect(composer).toHaveValue(/review the forecast/);
  await composer.press("Enter");

  // The answer streams into the panel.
  await expect(page.locator("body")).toContainText(/mock mode/i, { timeout: 120_000 });

  // ── the trace shows real tool calls ─────────────────────────────────────────
  await page.getByRole("tab", { name: /agent/i }).first().click();
  const agentPane = page.getByTestId("agent-section");
  await expect(agentPane).toBeVisible({ timeout: 60_000 });
  const trace = agentPane.getByRole("region", { name: /agent trace/i });
  await expect(trace).toContainText(/tool call/i, { timeout: 90_000 });
  await expect(trace).toContainText(/\d+ tool calls?/i);

  // ── approve, and it lands in the outbox ─────────────────────────────────────
  const tray = agentPane.getByRole("region", { name: /awaiting approval/i });
  await expect(tray).toBeVisible({ timeout: 90_000 });
  const preview = (await tray.locator("pre").first().innerText()).trim();
  expect(preview.length).toBeGreaterThan(0);

  // Keyboard activation: hold-to-confirm is a pointer affordance, and the button takes
  // Enter precisely so it stays reachable without one.
  await tray.getByRole("button", { name: /hold to approve/i }).first().press("Enter");
  await expect(tray).toBeHidden({ timeout: 90_000 });

  const firstLine = preview.split("\n")[0].slice(0, 40);
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/outbox");
        if (!res.ok()) return `HTTP ${res.status()}`;
        const body = (await res.json()) as { rows: { body: string; status: string }[] };
        return body.rows.find((r) => r.body.includes(firstLine))?.status ?? "not found";
      },
      { timeout: 60_000, message: "the approved action should reach the outbox" },
    )
    .toBe("delivered");

  await page.goto("/outbox");
  await expect(page.locator("main")).toContainText(firstLine, { timeout: 60_000 });
});

test("every restored page renders with seed data", async ({ page }) => {
  test.setTimeout(240_000);
  const pages: [string, RegExp][] = [
    ["/", /Core Concepts/i],
    // /learn redirects into a session when only one exists, so assert on either screen.
    ["/learn", /Demo One|Pick a|Skill Graph/i],
    ["/learn/new", /.+/],
    ["/sign-in", /.+/],
  ];
  for (const [path, probe] of pages) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should return 200`).toBe(200);
    await expect(page.locator("body"), `${path} should render content`).toContainText(probe);
  }
});

test("the extra pages still work alongside the restored UI", async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of ["/workspace", "/dashboard", "/memory", "/outbox", "/preflight"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should return 200`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("preflight reports readiness with no keys", async ({ page }) => {
  await page.goto("/preflight");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/preflight/i);
  // Warnings are expected with nothing configured; a failure is not.
  await expect(page.locator("main")).not.toContainText(/not ready/i);
});

test("the landing works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page should not scroll horizontally at 390px").toBeLessThanOrEqual(1);
});
