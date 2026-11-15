"""The magnitude head: label integrity, no leakage, and the claim it makes.

The first version of this model reported 100.00% accuracy on all five candidate algorithms
because `feature_columns()` discovers columns by pattern and returned `y_big` — the label —
into the feature matrix. These tests exist so that cannot happen again silently.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from copilot.config import (
    HOLDOUT_START,
    MAGNITUDE_METRICS_PATH,
    MAGNITUDE_MODEL_PATH,
    MAGNITUDE_THRESHOLD,
    MAGNITUDE_WINDOW,
    PANEL_PATH,
)
from copilot.labels import labelled
from copilot.magnitude import LABEL_COLUMNS, add_magnitude_label, drop_label_columns


@pytest.fixture(scope="module")
def panel() -> pd.DataFrame:
    return add_magnitude_label(labelled(pd.read_parquet(PANEL_PATH)))


def test_label_is_a_median_split_so_accuracy_is_comparable(panel: pd.DataFrame) -> None:
    """Base rate near 0.5 by construction. A 70% base rate would make 70% meaningless."""
    assert 0.45 < float(panel["y_big"].mean()) < 0.55


def test_label_threshold_uses_only_past_sessions(panel: pd.DataFrame) -> None:
    """`typical_move` is a trailing median, so it must never depend on the labelled return.

    Checked by recomputing it from the trailing window directly and comparing.
    """
    sample = panel[panel["ticker"] == panel["ticker"].iloc[0]].sort_values("date")
    recomputed = (
        sample["ret_1"].abs().rolling(MAGNITUDE_WINDOW, min_periods=MAGNITUDE_WINDOW).median()
    )
    aligned = recomputed.dropna()
    assert np.allclose(
        sample.loc[aligned.index, "typical_move"].to_numpy(), aligned.to_numpy(), equal_nan=True
    )


def test_label_matches_its_definition(panel: pd.DataFrame) -> None:
    expected = (panel["y_ret"].abs() > panel["typical_move"]).astype(float)
    assert (panel["y_big"].to_numpy() == expected.to_numpy()).all()


def test_drop_label_columns_removes_every_label() -> None:
    """The guard that the 100%-accuracy leak needed."""
    dirty = ["ret_1", "rv_20", "y_big", "y_dir", "y_ret", "typical_move", "y_anything"]
    clean = drop_label_columns(dirty)
    assert clean == ["ret_1", "rv_20"]
    for bad in LABEL_COLUMNS:
        assert bad not in clean


def test_frozen_model_has_no_label_in_its_feature_list() -> None:
    """The shipped bundle, loaded from disk, must not list a label among its columns."""
    if not MAGNITUDE_MODEL_PATH.exists():
        pytest.skip("magnitude model not trained in this checkout")
    import joblib

    bundle = joblib.load(MAGNITUDE_MODEL_PATH)
    for col in bundle.columns:
        assert not col.startswith("y_"), f"{col} is a label and is in the feature list"
        assert col not in LABEL_COLUMNS


def test_frozen_model_predicts_and_is_not_degenerate(panel: pd.DataFrame) -> None:
    """It must produce varied probabilities, not one constant.

    A constant output would still score ~50% and look plausible in aggregate while being
    useless per name, which is exactly the failure the signals board was accused of.
    """
    if not MAGNITUDE_MODEL_PATH.exists():
        pytest.skip("magnitude model not trained in this checkout")
    import joblib

    bundle = joblib.load(MAGNITUDE_MODEL_PATH)
    latest = panel.sort_values("date").groupby("ticker", as_index=False).tail(1)
    p = bundle.probability_big(latest)
    assert len(p) == len(latest)
    assert ((p >= 0) & (p <= 1)).all()
    assert len(set(np.round(p, 6))) > len(latest) // 2, "predictions are suspiciously uniform"


def test_metrics_never_read_the_holdout() -> None:
    if not MAGNITUDE_METRICS_PATH.exists():
        pytest.skip("magnitude metrics not produced in this checkout")
    metrics = json.loads(MAGNITUDE_METRICS_PATH.read_text(encoding="utf-8"))
    assert metrics["train_end"] < HOLDOUT_START, "the magnitude head trained past the boundary"
    assert "holdout" in metrics["holdout_note"].lower()


def test_reported_claim_is_what_was_measured() -> None:
    """Guards the number the UI quotes: median accuracy on called sessions."""
    if not MAGNITUDE_METRICS_PATH.exists():
        pytest.skip("magnitude metrics not produced in this checkout")
    metrics = json.loads(MAGNITUDE_METRICS_PATH.read_text(encoding="utf-8"))
    s = metrics["summary"]
    on_calls = [
        w["accuracy_when_calling"] for w in metrics["windows"] if w["accuracy_when_calling"]
    ]
    assert s["accuracy_when_calling_median"] == pytest.approx(float(np.median(on_calls)))
    assert s["accuracy_when_calling_min"] == pytest.approx(min(on_calls))
    assert s["accuracy_when_calling_max"] == pytest.approx(max(on_calls))
    # The claim made on screen and in the model card.
    assert s["accuracy_when_calling_median"] >= 0.60, (
        "the UI claims a median at or above 60% on called sessions; it no longer holds"
    )
    assert s["windows_total"] >= 4, "the stability claim needs at least four windows"
    assert metrics["threshold"] == MAGNITUDE_THRESHOLD


def test_threshold_is_symmetric_in_the_api_contract() -> None:
    """Conviction is distance from 0.5, so the gate must cut both tails.

    A one-sided gate would make this a volatility-only bias dressed as caution — the same
    defect the direction model's two-sided conviction bar exists to prevent.
    """
    assert 0.5 < MAGNITUDE_THRESHOLD < 1.0
