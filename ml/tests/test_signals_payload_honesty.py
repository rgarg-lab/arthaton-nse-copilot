"""The signals payload must not invite a false statement about coverage or dates.

Both assertions here come from a real answer the assistant gave a user: it reported that
the model had abstained on "all 18 large-cap stocks" when the panel carried 17, and it
announced "tomorrow's trading session (2026-11-11)" — a date in the past. Neither was the
model inventing things; it read the payload correctly and the payload was misleading.
"""

from __future__ import annotations

import json

import pytest

from copilot.config import SIGNALS_PATH, UNIVERSE


@pytest.fixture(scope="module")
def payload() -> dict:
    if not SIGNALS_PATH.exists():
        pytest.skip("no signals artifact in this checkout")
    return json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))


def test_universe_size_is_what_was_actually_scored(payload: dict) -> None:
    """Not the configured count. This is the field that produced "all 18"."""
    assert payload["universe_size"] == len(payload["signals"])


def test_the_configured_count_is_still_available(payload: dict) -> None:
    """The gap should be visible, not hidden — just not mistakable for coverage."""
    assert payload["universe_configured"] == len(UNIVERSE)


def test_missing_names_are_named(payload: dict) -> None:
    missing = payload["universe_missing"]
    assert isinstance(missing, list)
    assert len(missing) == payload["universe_configured"] - payload["universe_size"]
    for ticker in missing:
        assert ticker in UNIVERSE


def test_every_signal_says_which_session_it_predicts_in_words(payload: dict) -> None:
    """`predicts` cannot be mistaken for a target date the way a bare date was."""
    for s in payload["signals"]:
        assert "predicts" in s, f"{s['ticker']} has no `predicts`"
        assert s["as_of_session"] in s["predicts"]
        assert "after" in s["predicts"].lower()


def test_the_date_fields_are_the_last_completed_session(payload: dict) -> None:
    """Both date fields are historical. Nothing in the payload is a future date.

    If a future date ever appears here it is a guess about the NSE holiday calendar, which
    this project does not carry.
    """
    last = payload["data"]["last_session"]
    for s in payload["signals"]:
        assert s["as_of_session"] <= last
        assert s["predicts_session_after"] <= last
