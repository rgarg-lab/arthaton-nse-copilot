/**
 * Stage 4 acceptance, demonstrated rather than asserted.
 *
 * Two claims are easy to make and easy to get wrong:
 *
 *   1. "the honesty test would catch a hardcoded statistic"  — a test that
 *      never fails is indistinguishable from a test that cannot fail, so this
 *      writes a metric-shaped literal into a scene and checks the suite goes red
 *   2. "changing a number in metrics.json changes the rendered frame" — this
 *      perturbs the artifact, re-renders one frame, and compares the bytes
 *
 * Both mutations are made on a copy and reverted in a `finally`, so the repo is
 * left exactly as found even if the script throws.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const METRICS = join(ROOT, "..", "ml", "artifacts", "metrics.json");
const SCENE = join(ROOT, "src", "scenes", "Evidence.tsx");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

// --- 1. the honesty test actually fails on a planted literal ----------------
{
  const original = readFileSync(SCENE, "utf8");
  try {
    writeFileSync(
      SCENE,
      original.replace(
        "export const Baselines",
        'const PLANTED_BY_VERIFIER = "60.20%";\nexport const Baselines',
      ),
      "utf8",
    );
    let red = false;
    try {
      run(npx, ["vitest", "run", "--config", "vitest.config.mts"]);
    } catch {
      red = true;
    }
    check(
      "honesty test fails when a metric-shaped literal is planted in a scene",
      red,
      red ? "suite went red as it should" : "suite stayed green — the rule is vacuous",
    );
  } finally {
    writeFileSync(SCENE, original, "utf8");
  }

  let green = true;
  try {
    run(npx, ["vitest", "run", "--config", "vitest.config.mts"]);
  } catch {
    green = false;
  }
  check("honesty test is green again after revert", green);
}

// --- 2. changing the artifact changes the rendered frame --------------------
{
  const backup = `${METRICS}.verify-backup`;
  copyFileSync(METRICS, backup);
  const frameA = join(ROOT, "out", "_verify_a.png");
  const frameB = join(ROOT, "out", "_verify_b.png");
  // Frame 8460 = 141 s: beat 6.1, where the holdout accuracy fills the frame.
  const FRAME = "8460";
  try {
    run(npx, ["remotion", "still", "MainComposition", frameA, `--frame=${FRAME}`], {
      stdio: "inherit",
    });

    const metrics = JSON.parse(readFileSync(METRICS, "utf8"));
    const before = metrics.direction.accuracy;
    metrics.direction.accuracy = 0.4242;
    writeFileSync(METRICS, JSON.stringify(metrics, null, 2), "utf8");

    run(npx, ["remotion", "still", "MainComposition", frameB, `--frame=${FRAME}`], {
      stdio: "inherit",
    });

    const a = readFileSync(frameA);
    const b = readFileSync(frameB);
    const differs = a.length !== b.length || !a.equals(b);
    check(
      "perturbing metrics.json changes the rendered frame",
      differs,
      `direction.accuracy ${before} -> 0.4242; ` +
        `frame ${statSync(frameA).size} B vs ${statSync(frameB).size} B`,
    );
  } finally {
    copyFileSync(backup, METRICS);
    rmSync(backup, { force: true });
    rmSync(frameA, { force: true });
    rmSync(frameB, { force: true });
  }

  const restored = JSON.parse(readFileSync(METRICS, "utf8"));
  check(
    "metrics.json restored byte-for-byte",
    restored.direction.accuracy !== 0.4242,
    `direction.accuracy is ${restored.direction.accuracy}`,
  );
}

console.log(failures === 0 ? "\nSTAGE 4 VERIFICATION: PASS" : "\nSTAGE 4 VERIFICATION: FAIL");
process.exit(failures === 0 ? 0 : 1);
