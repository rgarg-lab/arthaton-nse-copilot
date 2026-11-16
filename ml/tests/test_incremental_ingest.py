"""The incremental price cache: a refresh must ask Yahoo for days, not years.

Every refresh attempt in this project failed because `_cache_path` keyed on the *end* date,
so the filename changed daily, every lookup missed, and the pipeline re-downloaded eleven
years for twenty-five symbols. Yahoo throttles after a few dozen such calls. These tests
pin the fix: the history is keyed on the start alone and is topped up, not re-fetched.
"""

from __future__ import annotations

import pandas as pd
import pytest

from copilot import ingest
from copilot.config import START_DATE


@pytest.fixture
def raw_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "RAW_DIR", tmp_path)
    return tmp_path


def _frame(dates: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.to_datetime(dates),
            "open": 1.0,
            "high": 1.0,
            "low": 1.0,
            "close": 1.0,
            "volume": 100,
        }
    )


def test_history_path_does_not_contain_the_end_date() -> None:
    """The actual bug. A key containing today's date can never hit tomorrow."""
    path = ingest._history_path("RELIANCE.NS", START_DATE)
    assert "history" in path.name
    assert START_DATE in path.name
    # No second date in the filename, which is what made it change daily.
    assert path.name.count("__") == 2


def test_a_covered_request_does_no_network_io(raw_dir, monkeypatch) -> None:
    """If the history already reaches yesterday, nothing is fetched at all."""
    path = ingest._history_path("X.NS", START_DATE)
    _frame(["2026-11-14", "2026-11-15"]).to_parquet(path, index=False)

    def explode(*a, **k):  # pragma: no cover - must not run
        raise AssertionError("fetch_symbol hit the network for a covered request")

    monkeypatch.setitem(
        __import__("sys").modules, "yfinance", type("m", (), {"download": explode})()
    )
    out = ingest.fetch_symbol("X.NS", start=START_DATE, end="2026-11-16")
    assert len(out) == 2


def test_a_stale_history_asks_only_for_the_missing_days(raw_dir, monkeypatch) -> None:
    """The property that makes a refresh survivable: days requested, not years."""
    path = ingest._history_path("X.NS", START_DATE)
    _frame(["2026-11-10", "2026-11-11"]).to_parquet(path, index=False)

    seen: dict[str, str] = {}

    def fake_download(symbol, start=None, end=None, **kwargs):
        seen["start"] = start
        seen["end"] = end
        return _frame(["2026-11-12", "2026-11-13"]).set_index("date")

    fake_mod = type("m", (), {"download": staticmethod(fake_download)})()
    monkeypatch.setitem(__import__("sys").modules, "yfinance", fake_mod)
    out = ingest.fetch_symbol("X.NS", start=START_DATE, end="2026-11-16")

    # Asked only for the day after what it held — not from START_DATE.
    assert seen["start"] == "2026-11-12"
    assert seen["start"] != START_DATE
    # And the history grew rather than being replaced.
    assert len(out) == 4
    assert str(pd.to_datetime(out["date"]).min())[:10] == "2026-11-10"


def test_a_throttled_top_up_keeps_the_existing_history(raw_dir, monkeypatch) -> None:
    """Yahoo refusing a top-up must not cost eleven years of cached prices.

    This is the degradation that matters: the panel stays as fresh as it was, rather than
    the symbol emptying and the pipeline building a hole.
    """
    path = ingest._history_path("X.NS", START_DATE)
    _frame(["2026-11-10", "2026-11-11"]).to_parquet(path, index=False)

    def always_throttled(*a, **k):
        raise RuntimeError("Too Many Requests. Rate limited.")

    monkeypatch.setattr(ingest, "_BACKOFF_SECONDS", ())
    monkeypatch.setattr(ingest, "_MAX_ATTEMPTS", 1)
    throttled_mod = type("m", (), {"download": staticmethod(always_throttled)})()
    monkeypatch.setitem(__import__("sys").modules, "yfinance", throttled_mod)
    out = ingest.fetch_symbol("X.NS", start=START_DATE, end="2026-11-16")
    assert len(out) == 2, "a throttled top-up discarded the cached history"


def test_legacy_fixed_window_files_are_adopted(raw_dir) -> None:
    """The 25 committed cache files hold years Yahoo will not re-serve while throttling."""
    legacy = ingest._cache_path("X.NS", START_DATE, "2026-11-12")
    _frame(["2026-11-10", "2026-11-11"]).to_parquet(legacy, index=False)

    adopted = ingest._adopt_legacy_cache("X.NS", START_DATE)
    assert adopted is not None and len(adopted) == 2


def test_adoption_prefers_the_newest_window(raw_dir) -> None:
    _frame(["2026-11-01"]).to_parquet(
        ingest._cache_path("X.NS", START_DATE, "2026-11-02"), index=False
    )
    _frame(["2026-11-01", "2026-11-11"]).to_parquet(
        ingest._cache_path("X.NS", START_DATE, "2026-11-12"), index=False
    )
    adopted = ingest._adopt_legacy_cache("X.NS", START_DATE)
    assert len(adopted) == 2, "adoption did not take the newest cached window"
