#!/usr/bin/env python3
"""Task runner for the ml/ service.

This is the canonical implementation of every `make` target. The Makefile next to
this file is a thin wrapper that delegates to it, so the two cannot drift and the
pipeline is runnable on a machine with no `make` on PATH (Windows, typically):

    make -C ml data          # POSIX / WSL / mac
    python ml/tasks.py data  # anywhere Python 3.12 runs

Run with no arguments, or with `help`, to list the targets.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
SRC = ML_DIR / "src"

TARGETS: dict[str, tuple[str, list[str]]] = {
    "install": (
        "pip-install the pinned runtime + dev dependencies",
        [sys.executable, "-m", "pip", "install", "-e", ".[dev]"],
    ),
    "install-sentiment": (
        "pip-install the FinBERT extra (torch, ~2.5GB — optional)",
        [sys.executable, "-m", "pip", "install", "-e", ".[sentiment]"],
    ),
    "data": (
        "ingest prices+macro, build features and labels -> data/processed/panel.parquet",
        [sys.executable, "-m", "copilot.pipeline"],
    ),
    "sentiment": (
        "score the news corpus with FinBERT -> data/processed/sentiment_daily.csv",
        [sys.executable, "-m", "copilot.sentiment"],
    ),
    "train": (
        "fit the pooled model + isotonic calibrator on walk-forward folds -> artifacts/",
        [sys.executable, "-m", "copilot.train"],
    ),
    "eval": (
        "evaluate vs 4 baselines on the final holdout -> artifacts/metrics.json",
        [sys.executable, "-m", "copilot.evaluate"],
    ),
    "signals": (
        "regenerate artifacts/latest_signals.json from the committed model",
        [sys.executable, "-m", "copilot.signals"],
    ),
    "refresh": (
        "data -> train -> eval -> signals, in order",
        None,  # composite, see run()
    ),
    "catchup": (
        "daily: top up prices and rewrite today's signals (never retrains)",
        None,  # composite, see run()
    ),
    "serve": (
        "run the FastAPI service on 127.0.0.1:8000",
        [
            sys.executable,
            "-m",
            "uvicorn",
            "copilot.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ],
    ),
    "confidence": (
        "compute accuracy-by-conviction tiers -> artifacts/confidence_tiers.json",
        [sys.executable, "-m", "copilot.confidence"],
    ),
    "magnitude": (
        "train and freeze the magnitude head (will tomorrow be a big move?)",
        [sys.executable, "-m", "copilot.magnitude"],
    ),
    "test": (
        "run the Python test suite (includes the leakage and purge tests)",
        [sys.executable, "-m", "pytest", "-q"],
    ),
    "lint": (
        "ruff check",
        [sys.executable, "-m", "ruff", "check", "src", "tests"],
    ),
    "help": ("list these targets", None),
}

REFRESH_CHAIN = ["data", "train", "eval", "signals"]

# The daily operation, and deliberately NOT `refresh`.
#
# `refresh` retrains and re-evaluates, which would refit a model §6.5 freezes and append a
# second authoritative read to the holdout ledger — turning the headline accuracy from
# out-of-sample into nothing at all. Nothing scheduled may ever do that.
#
# A catch-up only needs the two steps that have no bearing on the frozen artifacts: top the
# price history up to today (incremental, so a handful of rows per symbol), then rewrite
# today's signals from the model that already exists.
CATCHUP_CHAIN = ["data", "signals"]


def print_help() -> int:
    print("NSE Copilot — ml/ targets\n")
    width = max(len(name) for name in TARGETS)
    for name, (doc, _) in TARGETS.items():
        print(f"  {name.ljust(width)}  {doc}")
    print(
        "\nUsage:  make -C ml <target>   |   python ml/tasks.py <target>"
        "\nThe model, calibrator and abstention threshold in artifacts/ are frozen"
        "\n(BUILD_SPEC.md §6.5). `train`/`eval` exist to reproduce them, not to retune."
    )
    return 0


def run_one(name: str) -> int:
    doc_cmd = TARGETS.get(name)
    if doc_cmd is None:
        print(f"ml/tasks.py: unknown target {name!r}\n", file=sys.stderr)
        print_help()
        return 2
    _, cmd = doc_cmd
    if cmd is None:
        return print_help()

    # Every target runs as `<this python> -m <module>`, so a target fails with a bare
    # "No module named pytest" whenever tasks.py was started by an interpreter that does
    # not have the dev extra — most often the system Python rather than ml/.venv. The
    # module name alone does not tell you that, so say which interpreter is in use and
    # which command installs the missing piece.
    if len(cmd) > 2 and cmd[1] == "-m":
        module = cmd[2]
        if importlib.util.find_spec(module) is None:
            # pytest and ruff live in the [dev] extra; transformers/torch in [sentiment];
            # everything else (uvicorn, lightgbm, yfinance) is a core dependency.
            extras = {"pytest": "[dev]", "ruff": "[dev]", "transformers": "[sentiment]"}
            target = f"./ml{extras.get(module, '')}"
            print(
                f"ml/tasks.py: {name!r} needs the {module!r} module, and the interpreter "
                f"running this script does not have it.\n"
                f"  interpreter: {sys.executable}\n"
                f'  install it:  {sys.executable} -m pip install -e "{target}"\n'
                f"  or use the virtualenv: ml/.venv/Scripts/python.exe ml/tasks.py {name}"
                " (Windows)",
                file=sys.stderr,
            )
            return 1

    print(f"==> {name}: {' '.join(cmd)}", flush=True)
    # cwd=ML_DIR so relative data/ and artifacts/ paths resolve the same way the
    # Makefile's `make -C ml` does.
    env_src = str(SRC)
    import os

    env = dict(os.environ)
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = env_src + (os.pathsep + existing if existing else "")
    # The long targets (`data`, `train`) print progress as they go, and a block-
    # buffered child makes a 10-minute run look like a hang.
    env.setdefault("PYTHONUNBUFFERED", "1")
    return subprocess.call(cmd, cwd=ML_DIR, env=env)


def main(argv: list[str]) -> int:
    targets = argv[1:] or ["help"]
    for name in targets:
        if name in ("refresh", "catchup"):
            chain = REFRESH_CHAIN if name == "refresh" else CATCHUP_CHAIN
            for sub in chain:
                code = run_one(sub)
                if code != 0:
                    print(f"ml/tasks.py: {name} stopped — {sub} exited {code}", file=sys.stderr)
                    return code
            continue
        code = run_one(name)
        if code != 0:
            return code
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
