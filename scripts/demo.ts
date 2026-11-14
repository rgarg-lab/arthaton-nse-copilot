/**
 * `npm run demo` — boot the whole app with one command.
 *
 * ## Why this exists
 *
 * The app is two processes: a Python model service and a Next server. Getting them both up
 * meant reading SETUP.md, opening two terminals, knowing that the Python one has to be the
 * *right* interpreter, and knowing that `next dev` is the wrong choice for anything you are
 * judging. That is four pieces of knowledge standing between a reviewer and a working app,
 * and a reviewer who gets it wrong concludes the project is broken rather than that they
 * missed a step.
 *
 * ## What it does differently from two terminals
 *
 * - **Picks the Python that actually has the dependencies.** `ml/.venv` first, then
 *   `$PYTHON`, then `python`. Guessing wrong is the single most common failure here, and
 *   `ml/tasks.py` can only report it after the fact.
 * - **Waits for the model service to answer `/health` before starting Next**, so the first
 *   page render does not race a service that is still loading a 49k-row parquet. Without
 *   this the landing's first paint can show the service-down state for a few seconds, which
 *   looks exactly like a bug.
 * - **Production build by default.** `next dev` recompiles the landing's six heavy client
 *   components on first hit, which is a 20–30 second first paint that is compilation rather
 *   than the page. `--dev` opts back in.
 * - **One Ctrl-C kills both.** Orphaned servers holding port 3000 are how I lost time
 *   today: a stale `npm start` kept serving an old build while I was reading its output and
 *   concluding my change had not worked.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:process";

// `process.cwd()`, not `import.meta.dirname`: tsx compiles these scripts to CJS (there is
// no `"type": "module"` in package.json), where `import.meta` is unavailable. npm always
// runs a script from the package root, which is what this needs.
const ROOT = process.cwd();
const ML_PORT = 8000;
const WEB_PORT = Number(process.env.PORT ?? 3000);
const DEV = process.argv.includes("--dev");

const children: ChildProcess[] = [];
let shuttingDown = false;

function log(scope: string, message: string): void {
  process.stdout.write(`\x1b[2m[${scope}]\x1b[0m ${message}\n`);
}

/**
 * The interpreter that has the project's dependencies.
 *
 * `ml/.venv` is checked first and deliberately: SETUP.md recommends creating it, so when it
 * exists it is almost certainly the one that was installed into. Falling through to a bare
 * `python` is a last resort that will fail loudly in `waitForMl` rather than silently.
 */
function pythonExecutable(): string {
  const venv =
    platform === "win32"
      ? join(ROOT, "ml", ".venv", "Scripts", "python.exe")
      : join(ROOT, "ml", ".venv", "bin", "python");
  if (existsSync(venv)) return venv;
  if (process.env.PYTHON) return process.env.PYTHON;
  return platform === "win32" ? "python" : "python3";
}

/**
 * How to invoke npm, which differs from how to invoke Python.
 *
 * On Windows npm is `npm.cmd`, and since Node 20 `spawn` refuses to run a `.cmd` without a
 * shell (the CVE-2024-27980 fix) — it fails with `EINVAL`. So npm gets `shell: true`, which
 * is safe here because none of its arguments contain a space.
 *
 * Python must *not* go through a shell: its path is `…/Riyan Garg/…/python.exe`, and a shell
 * would split that on the space. Hence two different launch modes rather than one.
 */
function npmLaunch(): { command: string; shell: boolean } {
  return platform === "win32" ? { command: "npm.cmd", shell: true } : { command: "npm", shell: false };
}

/**
 * @param transient processes expected to finish on their own — the production build. Without
 * this flag the exit handler below treats a *successful* build as a dead service and takes
 * the whole demo down with it, which is a trap I walked into writing this.
 */
function run(
  scope: string,
  command: string,
  args: string[],
  { transient = false, shell = false }: { transient?: boolean; shell?: boolean } = {},
): ChildProcess {
  const child = spawn(command, args, {
    cwd: ROOT,
    shell,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  const relay = (buffer: Buffer) => {
    for (const line of buffer.toString().split("\n")) {
      if (line.trim()) log(scope, line.trimEnd());
    }
  };
  child.stdout?.on("data", relay);
  child.stderr?.on("data", relay);

  child.on("exit", (code) => {
    if (shuttingDown || transient) return;
    log(scope, `exited with code ${code}`);
    // One long-running process dying makes the app non-functional, so take the other down
    // rather than leaving a half-running demo that reports a confusing error in the browser.
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

async function waitForMl(timeoutMs = 120_000): Promise<boolean> {
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${ML_PORT}/health`, {
        signal: AbortSignal.timeout(4_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { status?: string; artifacts?: Record<string, boolean> };
        const missing = Object.entries(body.artifacts ?? {})
          .filter(([, present]) => !present)
          .map(([name]) => name);
        if (missing.length > 0) log("ml", `warning: missing artifacts — ${missing.join(", ")}`);
        return true;
      }
    } catch {
      if (!announced) {
        log("demo", "waiting for the model service to load its artifacts…");
        announced = true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

function shutdown(code = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("demo", "shutting down both services");
    shutdown(0);
  });
}

// An async `main`, matching the other scripts in this directory. Top-level await is not
// available under the CJS output tsx produces here.
async function main(): Promise<void> {
  const python = pythonExecutable();
  log("demo", `python: ${python}`);
  run("ml", python, [join("ml", "tasks.py"), "serve"]);

  if (!(await waitForMl())) {
    log("demo", `the model service never answered on :${ML_PORT}.`);
    log("demo", `install its dependencies with: ${python} -m pip install -e "./ml"`);
    shutdown(1);
  }
  log("demo", `model service ready on :${ML_PORT}`);

  if (DEV) {
    log("demo", "starting next dev — expect a slow first paint while routes compile");
    const npm = npmLaunch();
    run("web", npm.command, ["run", "dev"], { shell: npm.shell });
  } else {
    log("demo", "building for production (use --dev to skip)");
    const npm = npmLaunch();
    const build = run("build", npm.command, ["run", "build"], {
      transient: true,
      shell: npm.shell,
    });
    const code = await new Promise<number>((resolve) =>
      build.on("exit", (exitCode) => resolve(exitCode ?? 1)),
    );
    if (code !== 0) {
      log("demo", "the build failed; not starting the web server");
      shutdown(code);
    }
    run("web", npm.command, ["start"], { shell: npm.shell });
  }

  log("demo", `open http://localhost:${WEB_PORT} — Ctrl-C stops both services`);
}

main().catch((err) => {
  log("demo", String(err));
  shutdown(1);
});
