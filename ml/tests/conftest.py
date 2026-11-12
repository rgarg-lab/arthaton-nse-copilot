from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from copilot.config import PANEL_PATH, UNIVERSE
from copilot.features import build_features
from copilot.labels import add_labels


@pytest.fixture(scope="session")
def panel() -> pd.DataFrame:
    """The committed panel.

    Deliberately the real artifact rather than a synthetic frame: the properties
    being asserted — no feature correlates with the future, no date straddles a
    fold — are properties of the thing that was actually trained on. A synthetic
    panel would pass while the committed one leaked.
    """
    if not PANEL_PATH.exists():
        pytest.skip(f"{PANEL_PATH} missing — run `python ml/tasks.py data` first")
    return pd.read_parquet(PANEL_PATH)


@pytest.fixture(scope="session")
def synthetic_panel() -> pd.DataFrame:
    """A small deterministic panel built through the real feature code.

    Used for the tests that need to assert the *pipeline's* behaviour (does the
    sentiment shift happen? does a future price change leak backwards?) where
    being able to inject a known future is the whole point.
    """
    rng = np.random.default_rng(7)
    dates = pd.bdate_range("2020-01-01", periods=420)
    tickers = UNIVERSE[:4]

    rows = []
    for t in tickers:
        price = 100.0
        for d in dates:
            step = float(rng.normal(0, 0.012))
            price *= 1.0 + step
            rows.append(
                {
                    "date": d,
                    "ticker": t,
                    "open": price * (1 + float(rng.normal(0, 0.002))),
                    "high": price * (1 + abs(float(rng.normal(0, 0.004)))),
                    "low": price * (1 - abs(float(rng.normal(0, 0.004)))),
                    "close": price,
                    "volume": float(rng.integers(1_000_000, 9_000_000)),
                }
            )
    prices = pd.DataFrame(rows)

    macro_rows = {"date": dates}
    for key in ("nifty", "niftyenergy", "vix", "brent", "usdinr", "gold", "spx", "ndx"):
        level = 100.0 * np.cumprod(1.0 + rng.normal(0, 0.008, len(dates)))
        macro_rows[f"{key}_close"] = level
    macro = pd.DataFrame(macro_rows)

    empty_sent = pd.DataFrame(columns=["date", "ticker", "sent_raw", "news_count"])
    return add_labels(build_features(prices, macro, empty_sent))
