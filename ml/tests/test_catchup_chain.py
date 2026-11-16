"""The scheduled catch-up must never retrain or re-evaluate.

A daily job that ran `refresh` would refit a model BUILD_SPEC.md §6.5 freezes and append a
second *authoritative* read to the holdout ledger — at which point the headline accuracy is
no longer out-of-sample and the project's central claim is gone. Overnight. Silently.

These tests exist because that is a one-word edit away (`CATCHUP_CHAIN = REFRESH_CHAIN`)
and the damage would not be visible until someone checked the ledger.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

import tasks  # noqa: E402


def test_catchup_never_trains_or_evaluates() -> None:
    forbidden = {"train", "eval"}
    assert not forbidden & set(tasks.CATCHUP_CHAIN), (
        f"catchup runs {sorted(forbidden & set(tasks.CATCHUP_CHAIN))}, which would break the "
        "frozen model and consume the holdout"
    )


def test_catchup_is_not_an_alias_for_refresh() -> None:
    assert tasks.CATCHUP_CHAIN != tasks.REFRESH_CHAIN


def test_catchup_does_what_it_claims() -> None:
    """Top up the prices, then rewrite the signals — in that order."""
    assert tasks.CATCHUP_CHAIN == ["data", "signals"]


def test_catchup_is_a_registered_target() -> None:
    assert "catchup" in tasks.TARGETS
    doc, cmd = tasks.TARGETS["catchup"]
    assert cmd is None, "catchup is composite; it must be expanded by main(), not run directly"
    assert "retrain" in doc.lower() or "never" in doc.lower()


def test_refresh_still_includes_the_full_pipeline() -> None:
    """The manual target is unchanged — this is about what runs *unattended*."""
    assert tasks.REFRESH_CHAIN == ["data", "train", "eval", "signals"]


@pytest.mark.parametrize("name", ["data", "signals"])
def test_every_catchup_step_exists(name: str) -> None:
    assert name in tasks.TARGETS


def test_the_scheduler_script_calls_catchup_and_not_refresh() -> None:
    """The Windows task must invoke the safe chain."""
    script = ROOT / "scripts" / "schedule-catchup.ps1"
    if not script.exists():
        pytest.skip("scheduler script not present")
    text = script.read_text(encoding="utf-8")
    assert "tasks.py catchup" in text
    assert "tasks.py refresh" not in text, "the scheduled task must never run refresh"
