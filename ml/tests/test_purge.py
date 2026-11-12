"""The purge / overlap tests — §6.4's "write a test asserting train and
validation indices never overlap after purging"."""

from __future__ import annotations

import numpy as np
import pandas as pd

from copilot.config import EMBARGO_SESSIONS, HOLDOUT_START, WALK_FORWARD_FOLDS
from copilot.features import Preprocessor, feature_columns
from copilot.validation import holdout_split, purged_walk_forward, session_index


def test_all_four_folds_are_produced(panel):
    folds = purged_walk_forward(panel["date"])
    assert len(folds) == len(WALK_FORWARD_FOLDS)
    for f in folds:
        assert len(f.train_idx) > 0
        assert len(f.val_idx) > 0


def test_train_and_validation_indices_never_overlap(panel):
    folds = purged_walk_forward(panel["date"])
    for f in folds:
        overlap = np.intersect1d(f.train_idx, f.val_idx)
        assert overlap.size == 0, f"{f.name}: {overlap.size} rows are in both sides"


def test_no_date_appears_on_both_sides(panel):
    """The row-level check above is not sufficient on a pooled panel: 18 tickers
    share each date, so a date could be split across names without any single
    row being duplicated. This is the check that actually matters here."""
    dates = pd.to_datetime(panel["date"]).reset_index(drop=True)
    for f in purged_walk_forward(panel["date"]):
        train_dates = set(dates.iloc[f.train_idx].unique())
        val_dates = set(dates.iloc[f.val_idx].unique())
        shared = train_dates & val_dates
        assert not shared, f"{f.name}: {len(shared)} dates appear in both train and validation"


def test_embargo_gap_is_at_least_the_configured_size(panel):
    """At least EMBARGO_SESSIONS trading sessions must separate the last training
    date from the first validation date. This is the property that stops the last
    training row's *outcome* from being the first validation session's *move*."""
    sessions = session_index(panel["date"])
    for f in purged_walk_forward(panel["date"]):
        gap = int(((sessions > f.train_end) & (sessions < f.val_start)).sum())
        assert gap >= EMBARGO_SESSIONS, (
            f"{f.name}: only {gap} sessions purged between "
            f"{f.train_end.date()} and {f.val_start.date()}, need {EMBARGO_SESSIONS}"
        )


def test_training_is_always_strictly_before_validation(panel):
    for f in purged_walk_forward(panel["date"]):
        assert f.train_end < f.val_start


def test_folds_expand(panel):
    """Expanding window, not rolling: each fold trains on everything the previous
    one did, plus more."""
    folds = purged_walk_forward(panel["date"])
    sizes = [len(f.train_idx) for f in folds]
    assert sizes == sorted(sizes)
    assert sizes[-1] > sizes[0]


def test_holdout_is_purged_and_disjoint(panel):
    train_idx, hold_idx = holdout_split(panel["date"])
    assert np.intersect1d(train_idx, hold_idx).size == 0

    dates = pd.to_datetime(panel["date"]).reset_index(drop=True)
    assert set(dates.iloc[train_idx].unique()).isdisjoint(set(dates.iloc[hold_idx].unique()))

    sessions = session_index(panel["date"])
    last_train = dates.iloc[train_idx].max()
    first_hold = dates.iloc[hold_idx].min()
    gap = int(((sessions > last_train) & (sessions < first_hold)).sum())
    assert gap >= EMBARGO_SESSIONS

    assert first_hold >= pd.Timestamp(HOLDOUT_START)


def test_holdout_does_not_leak_into_any_validation_fold(panel):
    """No walk-forward fold may validate on a holdout date.

    The folds exist to choose hyperparameters and the abstention threshold. If any
    of them could see holdout rows, the headline number stops being out-of-sample
    and §9.1's freeze is meaningless.
    """
    dates = pd.to_datetime(panel["date"]).reset_index(drop=True)
    holdout_dates = set(dates[dates >= pd.Timestamp(HOLDOUT_START)].unique())
    for f in purged_walk_forward(panel["date"]):
        used = set(dates.iloc[f.train_idx].unique()) | set(dates.iloc[f.val_idx].unique())
        assert not (used & holdout_dates), f"{f.name} touches holdout dates"


def test_preprocessor_is_fit_on_training_rows_only(panel):
    """The VIX terciles and the imputation medians must come from the training
    slice. Fitting them on the whole panel is the quiet kind of leakage: it does
    not produce a suspicious accuracy, it just inflates every fold a little."""
    folds = purged_walk_forward(panel["date"])
    cols = feature_columns(panel)
    f = folds[0]

    train = panel.iloc[f.train_idx]
    pre_train_only = Preprocessor().fit(train, cols)
    pre_whole_panel = Preprocessor().fit(panel, cols)

    assert pre_train_only.vix_cuts is not None
    # If these came out identical, the fit is not actually using only the slice.
    assert pre_train_only.vix_cuts != pre_whole_panel.vix_cuts

    # And the fitted object must be usable on unseen rows without refitting.
    X = pre_train_only.transform(panel.iloc[f.val_idx])
    assert list(X.columns) == pre_train_only.model_columns
    assert not X.isna().to_numpy().any(), "transform left NaNs in the model matrix"
    assert set(X["vix_regime"].unique()) <= {-1, 0, 1, 2}
