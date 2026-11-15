"""Confidence tiers, and the comparison that must never be separated from them.

The tiers are validation figures that run several points above the holdout at the same
gate. Published alone they would be the most misleading artifact in this repository —
worse than an invented number, because they are technically sourced from real data. These
tests exist to make that separation impossible.
"""

from __future__ import annotations

import json

import pytest

from copilot.confidence import BANDS, CONFIDENCE_PATH, OOF_PATH, build
from copilot.config import METRICS_PATH


@pytest.fixture(scope="module")
def tiers() -> dict:
    if not CONFIDENCE_PATH.exists():
        pytest.skip("confidence tiers not produced in this checkout")
    return json.loads(CONFIDENCE_PATH.read_text(encoding="utf-8"))


def test_tiers_are_declared_as_validation(tiers: dict) -> None:
    """A reader must never have to infer which dataset a tier came from."""
    assert tiers["basis"] == "validation"
    assert "holdout" in tiers["source"].lower()


def test_holdout_comparison_is_present_and_complete(tiers: dict) -> None:
    """The guard. Every field the UI needs to show both numbers side by side."""
    h = tiers["holdout_comparison"]
    for key in (
        "gate",
        "validation_accuracy",
        "validation_coverage",
        "holdout_accuracy",
        "holdout_coverage",
        "gap",
    ):
        assert h.get(key) is not None, f"holdout_comparison.{key} is missing"


def test_the_gap_is_real_and_in_the_direction_that_flatters_validation(tiers: dict) -> None:
    """If this ever inverts, the surrounding copy is wrong and must be rewritten."""
    h = tiers["holdout_comparison"]
    assert h["gap"] == pytest.approx(h["validation_accuracy"] - h["holdout_accuracy"], abs=1e-9)
    assert h["gap"] > 0, "validation no longer flatters; the UI's explanation is now false"


def test_holdout_figures_match_the_metrics_artifact(tiers: dict) -> None:
    """The comparison must quote evaluate.py, not a second computation of its own."""
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    h = tiers["holdout_comparison"]
    assert h["holdout_accuracy"] == pytest.approx(
        metrics["abstention"]["accuracy_when_signalling"]
    )
    assert h["holdout_coverage"] == pytest.approx(metrics["abstention"]["coverage"])
    assert h["gate"] == pytest.approx(metrics["abstention"]["threshold"])


def test_tiers_are_recomputable_from_the_committed_predictions(tiers: dict) -> None:
    """The artifact is a reading of oof_predictions.parquet, not a hand-written table."""
    if not OOF_PATH.exists():
        pytest.skip("oof predictions not committed in this checkout")
    rebuilt = build()
    for a, b in zip(tiers["gates"], rebuilt["gates"], strict=True):
        assert a["gate"] == pytest.approx(b["gate"])
        assert a["accuracy"] == pytest.approx(b["accuracy"])
        assert a["n"] == b["n"]


def test_bands_partition_the_conviction_range(tiers: dict) -> None:
    """Bands are what a single prediction falls into; they must not overlap or gap."""
    bands = tiers["bands"]
    assert bands[0]["from"] == pytest.approx(0.5), "conviction cannot be below 0.5"
    for earlier, later in zip(bands, bands[1:], strict=False):
        assert earlier["to"] == pytest.approx(later["from"]), "bands must be contiguous"
    assert bands[-1]["to"] is None, "the last band must be open-ended"
    total = sum(b["coverage"] for b in bands)
    assert total == pytest.approx(1.0, abs=1e-6), "bands must cover every row exactly once"


def test_the_gate_divides_calling_from_abstaining(tiers: dict) -> None:
    """A band marked `calls` must sit entirely at or above the frozen threshold."""
    threshold = tiers["threshold"]
    for band in tiers["bands"]:
        if band["calls"]:
            assert band["from"] >= threshold - 1e-9, f"{band['label']} calls below the gate"
        else:
            assert band["from"] < threshold, f"{band['label']} abstains above the gate"


def test_accuracy_rises_with_conviction(tiers: dict) -> None:
    """The ladder's entire premise. If it stops holding, the feature is meaningless."""
    scored = [g for g in tiers["gates"] if g["accuracy"] is not None]
    accuracies = [g["accuracy"] for g in scored]
    assert accuracies == sorted(accuracies), "accuracy no longer increases with conviction"
    assert scored[0]["coverage"] > scored[-1]["coverage"], "coverage must fall as the gate rises"


def test_small_bands_are_unscored_rather_than_noisy(tiers: dict) -> None:
    """A band too small to measure reports no number instead of sampling noise."""
    for band in tiers["bands"]:
        if band["accuracy"] is None:
            assert band["note"], "an unscored band must say why"


def test_band_definitions_name_the_no_call_cases(tiers: dict) -> None:
    labels = {b[2] for b in BANDS}
    assert "no call" in labels
    assert any(b["calls"] for b in tiers["bands"]), "at least one band must be a call"
    assert any(not b["calls"] for b in tiers["bands"]), "the declining bands must be shown"


# ── the lean, as shipped on every signal ────────────────────────────────────────────


def test_every_signal_carries_a_lean_with_its_band_accuracy() -> None:
    """The lean must never travel without the number that makes it readable.

    "Leaning down" alone reads as a recommendation; "leaning down, this band is right
    52.5% of the time" reads as a coin flip with extra steps. The second figure is the
    entire safety mechanism, so it is required rather than optional.
    """
    import json

    from copilot.config import SIGNALS_PATH

    if not SIGNALS_PATH.exists():
        pytest.skip("no signals artifact in this checkout")
    payload = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    for s in payload["signals"]:
        lean = s.get("lean")
        assert lean, f"{s['ticker']} has no lean"
        assert lean["direction"] in {"up", "down"}
        assert lean["band_accuracy"] is not None, f"{s['ticker']} lean has no band accuracy"
        assert lean["confidence"], f"{s['ticker']} lean has no confidence label"


def test_the_lean_never_replaces_the_direction_invariant() -> None:
    """Adding the lean must not have smuggled a direction onto an abstained signal.

    This is the invariant the rules layer and the e2e test depend on: `direction` means a
    call the model stands behind, and an abstained signal does not get one. The lean is a
    separate, weaker field precisely so this stays true.
    """
    import json

    from copilot.config import SIGNALS_PATH

    if not SIGNALS_PATH.exists():
        pytest.skip("no signals artifact in this checkout")
    payload = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    for s in payload["signals"]:
        if s["abstain"]:
            assert "direction" not in s, f"{s['ticker']} abstains but carries a direction"
            assert s["lean"]["calls"] is False, f"{s['ticker']} abstains but its lean claims a call"


def test_lean_band_matches_the_published_tiers() -> None:
    """A signal's band must be the one its conviction actually falls into."""
    import json

    from copilot.config import SIGNALS_PATH
    from copilot.signals import confidence_band

    if not SIGNALS_PATH.exists() or not CONFIDENCE_PATH.exists():
        pytest.skip("artifacts not present in this checkout")
    payload = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))
    for s in payload["signals"]:
        expected = confidence_band(float(s["conviction"]))
        assert s["lean"]["band"] == expected["band"], f"{s['ticker']} is in the wrong band"
        assert s["lean"]["band_accuracy"] == pytest.approx(expected["band_accuracy"])
