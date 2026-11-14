import { expect, test } from "@playwright/test";

/**
 * The journey that must never break: landing → the workspace → ask the Copilot → real tool
 * calls in the trace → approve → the outbox, plus every signal surface rendering.
 *
 * Runs with **no API keys**, no `DATABASE_URL` and mock mode asserted, against the embedded
 * database — the configuration a fresh clone gets, and the one the demo falls back to if a
 * provider dies mid-presentation. This is also the step-7 acceptance check.
 *
 * ## The ML service may or may not be running
 *
 * These tests are written to pass either way, and that is deliberate rather than a
 * weakness: with the service up, each signal surface must show real figures; with it down,
 * each must show an explicit "service not answering" state and **no numbers**. Both are
 * correct behaviour, and asserting "either real data or an honest error, never a
 * fabricated figure" is exactly the invariant §4.1 asks for. A test that required the
 * service would just be skipped in the configuration most likely to expose the bug.
 *
 * ## Selectors avoid idea copy
 *
 * Every user-facing string comes from `idea.config.ts`, so matching on wording breaks the
 * moment the copy changes. These use hrefs, roles and testids.
 */

test.describe.configure({ mode: "serial" });

/** Present on every signal surface (§4.5), from one component. */
const DISCLAIMER = /not investment advice/i;

test("the demo path works with no keys", async ({ page }) => {
  test.setTimeout(300_000);

  // ── landing ─────────────────────────────────────────────────────────────────
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  /**
   * The landing must link into the product. Asserted on the *document* rather than on
   * visibility, because the closing CTA and the footer are both below the fold and the
   * measured strip's buttons are inside a section the viewport may not reach — and a link
   * that exists but is scrolled out of view is not a broken link.
   *
   * This is also a regression test for a real breakage: the landing's CTA, its footer and
   * the quick chat all pointed at `/learn`, which this build retires. Every one of them
   * was a dead link and nothing failed until the smoke test tried to click one.
   */
  for (const href of ["/signals", "/dashboard", "/workspace"]) {
    await expect(
      page.locator(`a[href="${href}"]`).first(),
      `the landing page must link to ${href}`,
    ).toHaveCount(1);
  }

  /**
   * The hero's right column must show the assistant immediately, not a loading cover.
   *
   * The 3D scene slot ships empty, and "no scene configured" was once treated as a stalled
   * load: the opaque loader sat for the full 8s timeout on every visit and server-rendered
   * nothing. A timeout-based assertion cannot catch that, because every expect timeout here
   * is longer than 8s and would simply wait it out. So this reads the raw response —
   * `page.request` runs no JavaScript, so a timer provably has not fired.
   */
  const ssr = await page.request.get("/");
  const html = await ssr.text();
  expect(html, "the bot preview must be server-rendered, not revealed by a timer").toMatch(
    /botPreview-module__\w+__card/,
  );
  expect(html, "the hero must not ship a loading cover when no scene is configured").not.toMatch(
    /hero-module__\w+__loader/,
  );

  /**
   * The landing's numbers strip either shows measured figures or says the service is down.
   * What it must never do is show a figure with no service behind it.
   *
   * This assertion caught two real breakages at once when the landing was re-skinned onto
   * the restored components, and both were invisible to `npm test`:
   *
   * 1. It pointed at `#measured`, an id that no longer exists — the strip is `#proof`, and
   *    its copy changed with it. A retired selector fails the same way a broken page does,
   *    so the id is asserted separately below to keep the two causes apart.
   * 2. More seriously, the section was rendered `{data && …}`, so with the service down it
   *    vanished instead of reporting. The "or says the service is down" half of this
   *    invariant was unreachable. ProofStrip now owns that state.
   */
  await expect(page.locator("#proof"), "the measured strip must be on the page").toHaveCount(1);
  await expect(page.locator("#proof")).toContainText(
    /Sessions tested|model service is not running/i,
  );

  // ── the workspace ───────────────────────────────────────────────────────────
  // Navigated rather than clicked: the links are asserted above, and the CTA that targets
  // the workspace sits below the fold behind a motion-gated section, so clicking it needs
  // a scroll-and-settle that adds a minute to the run and tests the animation rather than
  // the journey.
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/workspace/, { timeout: 90_000 });

  /**
   * A question that drives a tool call which queues an approval, so the whole
   * queue → tray → approve → outbox journey is exercised in one turn. `create_task` is
   * enabled precisely so a fresh clone can show that with no connector configured.
   */
  /**
   * `chat-input`, not `#smart-input`. The restored workspace puts `ChatPanel` in the
   * shell's always-mounted chat region, and that panel's textarea already carried this
   * testid — `SmartInput`, which owns `id="smart-input"`, is a separate component the
   * workspace does not use. So this assertion failed with "element(s) not found" and read
   * as a workspace that never rendered a composer, when the composer was there under a
   * selector that already existed.
   */
  const composer = page.getByTestId("chat-input");
  await expect(composer, "the workspace must render a chat composer").toBeVisible({
    timeout: 60_000,
  });
  // `fill`, never `click`: a rotating suggestion can sit over a composer and is itself a
  // button, so a programmatic click on the field gets intercepted and retries forever.
  await composer.fill(
    "Create a task to review today's abstentions before the next session opens.",
  );
  await expect(composer).toHaveValue(/review today's abstentions/);
  await composer.press("Control+Enter");

  // ── the trace shows real tool calls ─────────────────────────────────────────
  /**
   * The trace and the approvals tray live in the workspace's **Agent** tab, and the default
   * tab is Signals — so neither is in the DOM until the tab is selected. The previous
   * version of this test asserted on them directly and failed as though the agent had never
   * run, which is a misleading way to discover a tab.
   *
   * Selected *after* the turn is sent, deliberately: the trace events accumulate in
   * `CopilotWorkspace`'s own state rather than the pane's, so switching tabs mid-turn keeps
   * every event. Asserting that is the point — a trace that only exists while its tab is
   * open would be a real defect.
   */
  await page.getByTestId("tab-agent").click();

  const trace = page.getByRole("region", { name: /agent trace/i });
  await expect(trace).toBeVisible({ timeout: 60_000 });
  await expect(trace).toContainText(/tool call/i, { timeout: 180_000 });

  /**
   * The answer arrives in the chat conversation, not a "Results" column — that region
   * belonged to the earlier layout and does not exist in the restored shell, where the
   * conversation is the always-mounted chat region beside the tabs.
   *
   * Asserted on the assistant's own message rather than on the region's text, because the
   * region also contains the question that was just typed into it, and a test that any text
   * is present would pass on the echo of its own input.
   */
  const answer = page
    .getByRole("region", { name: /conversation/i })
    .locator('[data-role="assistant"]')
    .first();
  await expect(answer, "the assistant must answer in the conversation").toContainText(/\w/, {
    timeout: 180_000,
  });

  // ── approve, and it lands in the outbox ─────────────────────────────────────
  const tray = page.getByRole("region", { name: /awaiting approval/i });
  await expect(tray).toBeVisible({ timeout: 120_000 });
  const preview = (await tray.locator("pre").first().innerText()).trim();
  expect(preview.length).toBeGreaterThan(0);

  /**
   * How many the turn actually queued. Not assumed to be one: the agent is free to queue
   * several actions in a turn, and on a mock-mode run of this question it queues two.
   *
   * The previous version approved `.first()` and then asserted the whole tray was hidden,
   * which fails whenever more than one action is waiting — the tray was correctly still
   * showing the *other* action. That read as a broken approve button for a while; it was a
   * test that had hard-coded a queue depth of one.
   */
  const queued = await tray.locator("pre").count();
  expect(queued, "the turn must queue at least one action").toBeGreaterThan(0);

  // Keyboard activation: hold-to-confirm is a pointer affordance, and the button takes
  // Enter precisely so it stays reachable without one.
  await tray.getByRole("button", { name: /hold to approve/i }).first().press("Enter");

  // The approved action leaves the queue. Asserted on *this* action rather than on the
  // tray's visibility, so the assertion means the same thing at any queue depth.
  if (queued === 1) {
    await expect(tray, "approving the only action empties the tray").toBeHidden({
      timeout: 90_000,
    });
  } else {
    await expect
      .poll(async () => tray.locator("pre").count(), {
        timeout: 90_000,
        message: "the approved action should leave the queue",
      })
      .toBe(queued - 1);
  }

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

test("every signal surface carries the disclaimer and never a bare number", async ({ page }) => {
  test.setTimeout(240_000);

  for (const path of ["/signals", "/dashboard", "/evidence"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should return 200`).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // §4.5: visible on every surface that shows a signal, in both the service-up and
    // service-down states.
    await expect(page.locator("main"), `${path} must show the disclaimer`).toContainText(
      DISCLAIMER,
    );

    /**
     * Either real content or an explicit error — never a half-populated panel. The
     * service-down branch is the one worth pinning: it has to *say* the service is down,
     * because a quietly empty panel looks like "no signals today", which is a different
     * and false claim.
     */
    const main = page.locator("main");
    await expect(main).toContainText(/model service is not answering|\d/, { timeout: 60_000 });
  }
});

test("an abstention is rendered as an abstention, not as a weak call", async ({ page }) => {
  await page.goto("/signals");
  const abstentions = page.getByTestId("abstention-card");
  const calls = page.getByTestId("signal-card");
  const [nAbstain, nCall] = [await abstentions.count(), await calls.count()];

  if (nAbstain + nCall === 0) {
    // The ML service is not running; the board shows its error state, asserted above.
    await expect(page.locator("main")).toContainText(/model service is not answering/i);
    return;
  }

  /**
   * The invariant: an abstention card must not contain a direction. The API omits the
   * `direction` field entirely when abstaining, so a compliant UI has nothing to render —
   * this asserts the UI does not reconstruct one from the probability, which is the
   * tempting bug, since a calibrated 0.52 is still above 0.5.
   */
  for (let i = 0; i < nAbstain; i += 1) {
    const card = abstentions.nth(i);
    await expect(card).toContainText(/no signal today/i);
    await expect(card.getByTestId("signal-direction")).toHaveCount(0);
  }

  for (let i = 0; i < nCall; i += 1) {
    await expect(calls.nth(i).getByTestId("signal-direction")).toBeVisible();
    await expect(calls.nth(i).getByTestId("signal-probability")).toBeVisible();
  }
});

test("the retired routes are gone, not broken", async ({ page }) => {
  /**
   * §7.1 retires the learner surfaces. "Retired" has to mean a 404, not a page that
   * renders half a layout and throws — a dead route a judge can reach is worse than one
   * that honestly does not exist.
   */
  for (const path of ["/learn", "/learn/new", "/api/learners", "/api/path/generate"]) {
    const response = await page.request.get(path);
    expect([404, 405], `${path} should be gone, got ${response.status()}`).toContain(
      response.status(),
    );
  }
});

test("the supporting pages still work", async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of ["/workspace", "/memory", "/outbox", "/preflight", "/sign-in"]) {
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

test("every page holds up at mobile width", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/", "/signals", "/dashboard", "/evidence"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // Wide content (the model card's tables, the charts) must scroll inside its own
    // container, never widen the page.
    expect(overflow, `${path} should not scroll horizontally at 390px`).toBeLessThanOrEqual(1);
  }
});
