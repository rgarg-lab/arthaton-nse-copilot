"""Target construction.

One canonical unit: **`y_ret` is a fraction**, everywhere, for the whole build.
0.0123 means +1.23%. The ×100 / ÷100 scaling that moved between `models.py` and
`fusion.py` in my earlier project was self-consistent but unreadable, and
unreadable unit handling is how a sign error survives review. Percent exists only
at the display edge, in the UI.

The horizon is configurable but defaults to one session, and the last `horizon`
rows per ticker necessarily have no label — those are the rows we *predict on*,
so they are kept, flagged, and excluded from training rather than dropped.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import HORIZON_SESSIONS


def add_labels(panel: pd.DataFrame, horizon: int = HORIZON_SESSIONS) -> pd.DataFrame:
    """Adds `y_ret` and `y_dir`.

    `y_ret[t] = close[t+horizon] / close[t] - 1`, computed per ticker so it never
    reaches across names. This is the *only* forward-looking operation in the
    whole feature/label pipeline — `tests/test_leakage.py` asserts that no
    feature column shares information with it.

    `y_dir` is 1 for a strictly positive return and 0 otherwise. A flat close
    counts as "not up": the product makes a directional call, and "exactly zero"
    is not a third option it can act on. Exact zeros are rare (~0.1% of rows) and
    the alternative — dropping them — would quietly remove the lowest-volatility
    sessions from the evaluation.
    """
    out = panel.sort_values(["ticker", "date"]).copy()

    fwd = out.groupby("ticker", sort=False)["close"].shift(-horizon)
    out["y_ret"] = fwd / out["close"] - 1.0
    out["y_dir"] = np.where(out["y_ret"].isna(), np.nan, (out["y_ret"] > 0).astype(float))

    return out.sort_values(["date", "ticker"]).reset_index(drop=True)


def labelled(panel: pd.DataFrame) -> pd.DataFrame:
    """Rows usable for training or scoring a metric."""
    return panel[panel["y_ret"].notna()].copy()


def unlabelled_tail(panel: pd.DataFrame) -> pd.DataFrame:
    """The most recent rows, which have features but no outcome yet. These are
    the live prediction targets — `signals.py` scores exactly these."""
    return panel[panel["y_ret"].isna()].copy()


def label_summary(panel: pd.DataFrame) -> dict[str, object]:
    lab = labelled(panel)
    return {
        "horizon_sessions": HORIZON_SESSIONS,
        "labelled_rows": int(len(lab)),
        "unlabelled_rows": int(len(panel) - len(lab)),
        "up_rate": round(float(lab["y_dir"].mean()), 6) if len(lab) else None,
        "mean_abs_return": round(float(lab["y_ret"].abs().mean()), 6) if len(lab) else None,
    }
