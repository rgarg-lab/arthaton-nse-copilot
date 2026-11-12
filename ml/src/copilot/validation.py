"""Purged walk-forward splitting with an embargo.

Per §6.4 this is the highest-value work in the build, and it is worth being
explicit about *why*, because an ordinary `TimeSeriesSplit` looks like it already
does this job.

It does not, for two reasons:

**Overlapping labels.** The label for row *t* is the *t → t+1* return. A plain
chronological split puts the last training session immediately before the first
validation session, so the final training row's *outcome* is the first validation
session's *move*. The model is trained on information from inside the validation
window. At a 1-session horizon that is one row per ticker — small. At any longer
horizon, or once rolling features that span the boundary are involved, it is not,
and a pipeline that is only correct at horizon 1 is a trap. So the last
`EMBARGO_SESSIONS` sessions before each validation window are **purged** from
training.

**Pooling across tickers.** 18 tickers share each date, so a split that is not
done on *dates* leaves the same session in both sides through a different name —
and cross-sectional rank features make those rows directly informative about each
other. Every split here is a split on the date axis, applied to all tickers at
once.

The expanding window (train on everything up to a boundary, validate on the next
year) rather than a rolling one is deliberate: a market regime model wants all
the history it can get, and the thing being measured is "would this have worked
if I had fit it at the end of 2022", which is an expanding-window question.

`tests/test_purge.py` asserts the two properties that matter mechanically: no
date appears in both sides of a fold, and the gap between the last training date
and the first validation date is at least the embargo.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import EMBARGO_SESSIONS, HOLDOUT_START, WALK_FORWARD_FOLDS


@dataclass(frozen=True)
class Fold:
    name: str
    train_idx: np.ndarray
    val_idx: np.ndarray
    train_end: pd.Timestamp
    val_start: pd.Timestamp
    val_end: pd.Timestamp
    embargo_start: pd.Timestamp | None

    def summary(self) -> dict[str, object]:
        return {
            "fold": self.name,
            "train_rows": int(len(self.train_idx)),
            "val_rows": int(len(self.val_idx)),
            "train_end": self.train_end.date().isoformat(),
            "val_start": self.val_start.date().isoformat(),
            "val_end": self.val_end.date().isoformat(),
            "embargoed_sessions": EMBARGO_SESSIONS,
        }


def session_index(dates: pd.Series) -> pd.DatetimeIndex:
    """The ordered unique trading sessions in the panel.

    The embargo is counted in *sessions*, not calendar days — five calendar days
    across a long weekend is two sessions, and the whole point is to drop five
    sessions' worth of label overlap.
    """
    return pd.DatetimeIndex(sorted(pd.to_datetime(dates).unique()))


def _fold_name(i: int, val_start: pd.Timestamp, val_end: pd.Timestamp) -> str:
    """`fold4_val2025H1` — the half-year suffix appears only for a part-year
    window, so the names read the way §6.4 writes them."""
    label = str(val_start.year)
    if val_start.year == val_end.year and (val_end.month - val_start.month) < 11:
        label += "H1" if val_end.month <= 6 else "H2"
    return f"fold{i}_val{label}"


def purged_walk_forward(
    dates: pd.Series,
    folds: tuple[tuple[str, str, str], ...] = WALK_FORWARD_FOLDS,
    embargo: int = EMBARGO_SESSIONS,
) -> list[Fold]:
    """Expanding-window folds with `embargo` sessions purged before each
    validation window.

    `dates` is the panel's date column, one entry per row (so repeated across
    tickers). Returned indices are positional into that column.
    """
    d = pd.to_datetime(pd.Series(dates).reset_index(drop=True))
    sessions = session_index(d)
    out: list[Fold] = []

    for i, (train_end_s, val_start_s, val_end_s) in enumerate(folds, start=1):
        train_end = pd.Timestamp(train_end_s)
        val_start = pd.Timestamp(val_start_s)
        val_end = pd.Timestamp(val_end_s)

        # Purge: step back `embargo` sessions from the first validation session
        # and train only strictly before that point.
        before = sessions[sessions < val_start]
        if len(before) == 0:
            continue
        cut = before[-embargo] if len(before) >= embargo else before[0]
        effective_train_end = min(train_end, cut)

        train_mask = d < effective_train_end
        val_mask = (d >= val_start) & (d <= val_end)

        if train_mask.sum() == 0 or val_mask.sum() == 0:
            continue

        out.append(
            Fold(
                name=_fold_name(i, val_start, val_end),
                train_idx=np.flatnonzero(train_mask.to_numpy()),
                val_idx=np.flatnonzero(val_mask.to_numpy()),
                train_end=pd.Timestamp(d[train_mask].max()),
                val_start=pd.Timestamp(d[val_mask].min()),
                val_end=pd.Timestamp(d[val_mask].max()),
                embargo_start=effective_train_end,
            )
        )

    return out


def holdout_split(
    dates: pd.Series,
    holdout_start: str = HOLDOUT_START,
    embargo: int = EMBARGO_SESSIONS,
) -> tuple[np.ndarray, np.ndarray]:
    """`(train_idx, holdout_idx)` for the final, once-only evaluation.

    The same purge applies: training stops `embargo` sessions before the holdout
    begins. This is the split that produces the headline number, and it is
    evaluated **exactly once, ever** (§6.4, §9.1). Nothing selects a
    hyperparameter or a threshold from it.
    """
    d = pd.to_datetime(pd.Series(dates).reset_index(drop=True))
    sessions = session_index(d)
    start = pd.Timestamp(holdout_start)

    before = sessions[sessions < start]
    if len(before) == 0:
        raise ValueError(f"no sessions before the holdout start {holdout_start}")
    cut = before[-embargo] if len(before) >= embargo else before[0]

    train_idx = np.flatnonzero((d < cut).to_numpy())
    holdout_idx = np.flatnonzero((d >= start).to_numpy())
    return train_idx, holdout_idx
