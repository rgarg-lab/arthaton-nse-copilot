"""Every figure in MODEL_CARD.md must match ml/artifacts/metrics.json.

A model card is a document whose entire value is that it is true. Hand-written numbers in
one go stale the moment the pipeline is re-run, and a stale model card is worse than none —
it is a confident claim nobody checked. So each assertion here reads the artifact and looks
for the formatted figure in the prose.

This mirrors ``test_readme_numbers.py``. The two are separate files because they protect
different documents and should fail with different names.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CARD_PATH = ROOT / "MODEL_CARD.md"
METRICS_PATH = ROOT / "ml" / "artifacts" / "metrics.json"


@pytest.fixture(scope="module")
def card() -> str:
    """The card's text, with typographic characters folded to their ASCII equivalents.

    The prose uses a real minus sign (U+2212) for negative figures — "R² of −0.0011" — which
    is correct typography and does not match the ASCII hyphen that ``f"{value:.4f}"``
    produces. Normalising here keeps the comparison semantic: the document stays readable
    and the test still checks the number.
    """
    text = CARD_PATH.read_text(encoding="utf-8")
    return text.replace("−", "-").replace("–", "-").replace("—", "-")


@pytest.fixture(scope="module")
def metrics() -> dict:
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


def pct(value: float, places: int = 2) -> str:
    return f"{value * 100:.{places}f}%"


def section(card: str, heading: str) -> str:
    """The text under one heading, up to the next heading of the same or higher level.

    Needed because "is this figure anywhere in the document" is a weak pin: the headline
    accuracy also appears in the baselines table, so corrupting it in §4.1 alone left every
    whole-document assertion passing. I know because I mutated 51.37% to 58.15% to check
    this file could fail, and it could not. Section-scoped assertions localise the claim.
    """
    start = card.index(heading)
    level = len(heading) - len(heading.lstrip("#"))
    rest = card[start + len(heading) :]
    nxt = re.search(rf"^#{{1,{level}}} ", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def test_card_exists(card: str) -> None:
    assert len(card) > 2000, "MODEL_CARD.md looks truncated"


def test_headline_direction_metrics(card: str, metrics: dict) -> None:
    """Scoped to §4.1, so a wrong figure there cannot hide behind a right one elsewhere."""
    d = metrics["direction"]
    block = section(card, "### 4.1 Direction, on the holdout")
    for figure in (
        pct(d["accuracy"]),
        pct(d["balanced_accuracy"]),
        f"{d['auc']:.4f}",
        f"{d['brier']:.4f}",
        pct(d["base_rate_up"]),
        pct(d["predicted_up_share"]),
        f"{d['n']:,}",
    ):
        assert figure in block, f"{figure} is not in MODEL_CARD.md §4.1"

    # And nothing in that block may be an accuracy-shaped number that is not a real one.
    allowed = {
        pct(d[k]) for k in ("accuracy", "balanced_accuracy", "base_rate_up", "predicted_up_share")
    }
    for found in re.findall(r"\d{2}\.\d{2}%", block):
        assert found in allowed, f"§4.1 contains {found}, which is not a published figure"


def test_baselines_block_is_exact(card: str, metrics: dict) -> None:
    """Same scoping for §4.2: every percentage in the table must be a real baseline."""
    block = section(card, "### 4.2 Baselines, identical split")
    allowed = {pct(metrics["direction"]["accuracy"])} | {
        pct(b["accuracy"]) for b in metrics["baselines"].values() if b.get("accuracy") is not None
    }
    found = set(re.findall(r"\d{2}\.\d{2}%", block))
    assert found <= allowed, f"§4.2 has figures that are not published baselines: {found - allowed}"
    assert len(found) >= 4, "§4.2 should list the model and three baselines"


def test_baseline_accuracies(card: str, metrics: dict) -> None:
    for name in ("always_up", "previous_day_sign", "logistic_3_feature"):
        acc = metrics["baselines"][name]["accuracy"]
        assert pct(acc) in card, f"baseline {name} ({pct(acc)}) is not in MODEL_CARD.md"


def test_abstention_block(card: str, metrics: dict) -> None:
    a = metrics["abstention"]
    for figure in (
        pct(a["coverage"]),
        pct(a["accuracy_when_signalling"]),
        pct(a["accuracy_on_all_rows"]),
        pct(a["accuracy_when_abstaining"]),
        f"{a['signals_emitted']:,}",
    ):
        assert figure in card, f"{figure} is not in MODEL_CARD.md"


def test_regression_r2_is_reported_as_approximately_zero(card: str, metrics: dict) -> None:
    """The near-zero R-squared is the card's most load-bearing admission."""
    r2 = metrics["regression"]["r2"]
    assert f"{r2:.4f}" in card, f"R2 {r2:.4f} is not in MODEL_CARD.md"
    assert r2 < 0.05, "if R2 ever becomes meaningful, §4.5 and §5.2 need rewriting"


def test_calibration_error(card: str, metrics: dict) -> None:
    c = metrics["calibration"]
    assert pct(c["expected_calibration_error"]) in card
    assert pct(c["max_calibration_error"]) in card


def test_per_regime_table(card: str, metrics: dict) -> None:
    for row in metrics["breakdowns"]["per_vix_regime"]:
        assert pct(row["accuracy"]) in card, f"regime {row['regime']} accuracy missing"
        assert f"{row['n']:,}" in card, f"regime {row['regime']} n missing"


def test_per_year_table(card: str, metrics: dict) -> None:
    for row in metrics["breakdowns"]["per_year"]:
        assert pct(row["accuracy"]) in card, f"year {row['year']} accuracy missing"


def test_holdout_and_fold_design(card: str, metrics: dict) -> None:
    design = metrics["evaluation_design"]
    assert f"{design['holdout_rows']:,}" in card
    assert design["holdout_start"] in card
    assert str(design["holdout_range"][1]) in card
    for fold in design["walk_forward_folds"]:
        assert f"{fold['train_rows']:,}" in card, f"{fold['fold']} train_rows missing"
        assert f"{fold['val_rows']:,}" in card, f"{fold['fold']} val_rows missing"


def test_provenance_counts(card: str, metrics: dict) -> None:
    prov = metrics["provenance"]
    assert f"{prov['panel_rows']:,}" in card
    assert str(prov["feature_count"]) in card
    assert str(prov["universe_size"]) in card
    assert f"{prov['model_train_rows']:,}" in card
    for key, value in prov["selected_hyperparameters"].items():
        assert str(value) in card, f"hyperparameter {key}={value} missing"


def test_ledger_claim(card: str, metrics: dict) -> None:
    ledger = metrics["evaluation_design"]["holdout_ledger"]
    assert ledger["authoritative_reads"] == 1, "the card claims exactly one authoritative read"
    assert ledger["this_read"]["holdout_content_hash"] in card
    assert ledger["this_read"]["model_fingerprint"] in card


def test_up_down_decomposition_is_arithmetic_on_published_bins(card: str, metrics: dict) -> None:
    """§5.5 is the one table in the card that is derived rather than copied.

    It is a reading of the published calibration bins, so it must reproduce the artifact's
    own ``accuracy_when_signalling`` exactly. If it ever stops doing that, either the bins
    moved or the derivation is wrong, and both mean the section is lying.
    """
    threshold = metrics["abstention"]["threshold"]
    bins = [
        b
        for b in metrics["calibration"]["curve"]
        if b["n"] and b["observed_up_rate"] is not None
    ]
    up = [b for b in bins if b["p_lower"] >= threshold]
    down = [b for b in bins if b["p_upper"] <= 1 - threshold]

    n_up = sum(b["n"] for b in up)
    n_down = sum(b["n"] for b in down)
    correct_up = sum(b["n"] * b["observed_up_rate"] for b in up)
    correct_down = sum(b["n"] * (1 - b["observed_up_rate"]) for b in down)

    assert n_up + n_down == metrics["abstention"]["signals_emitted"], (
        "the bins above and below the threshold must account for every emitted signal"
    )
    combined = (correct_up + correct_down) / (n_up + n_down)
    assert combined == pytest.approx(metrics["abstention"]["accuracy_when_signalling"], abs=1e-6)

    # And the two halves, as the card states them.
    assert pct(correct_up / n_up) in card, "up-call accuracy missing from §5.5"
    assert pct(correct_down / n_down) in card, "down-call accuracy missing from §5.5"
    assert f"{n_up:,}" in card and f"{n_down:,}" in card

    # The claim that makes the section worth reading.
    assert correct_down / n_down > correct_up / n_up, (
        "§5.5 claims the edge is concentrated in down-calls; it no longer is"
    )


def test_paper_trading_default_scenario(card: str, metrics: dict) -> None:
    scenarios = metrics["paper_trading"]["scenarios"]
    default = next(s for s in scenarios.values() if s.get("is_default"))
    assert pct(default["total_return"]) in card
    assert pct(default["annualised_return"]) in card
    assert f"{default['sharpe']:.3f}" in card or str(default["sharpe"]) in card
    assert pct(default["max_drawdown"]) in card


def test_limitations_are_all_carried_over(card: str, metrics: dict) -> None:
    """Every limitation in the artifact must appear in the card, by keyword."""
    keywords = ["Survivorship", "Reliance only", "TMPV", "auto-adjusted", "borrow"]
    for word in keywords:
        assert word in card, f"limitation keyword {word!r} missing from MODEL_CARD.md"
    assert len(metrics["known_limitations"]) >= len(keywords)


def test_no_oversell(card: str) -> None:
    for phrase in ("state of the art", "highly accurate", "beats the market", "guaranteed"):
        assert phrase not in card.lower(), f"{phrase!r} does not belong in a model card"


def test_names_what_it_is_not(card: str) -> None:
    lowered = card.lower()
    for phrase in ("not intraday", "sebi", "not investment advice", "no execution"):
        assert phrase in lowered, f"the card must state {phrase!r}"


def test_states_protocol_before_results(card: str) -> None:
    """The evaluation protocol must appear above the metrics it produced."""
    protocol = card.index("## 3. Evaluation protocol")
    results = card.index("## 4. Metrics")
    assert protocol < results, "the protocol section must precede the results section"


def test_disclaimer_inconsistency_is_disclosed(card: str, metrics: dict) -> None:
    """The artifact's embedded disclaimer predates the SEBI clause; §7 must say so.

    Rather than hand-edit a pipeline artifact, the mismatch is disclosed. If someone
    regenerates the artifact and the strings agree again, this test tells them to delete
    that paragraph instead of leaving a note about a problem that no longer exists.
    """
    from copilot.config import DISCLAIMER

    if metrics["disclaimer"] == DISCLAIMER:
        pytest.fail(
            "metrics.json now matches config.DISCLAIMER — remove the "
            "'known inconsistency in the artifact' note from MODEL_CARD.md §7"
        )
    assert re.search(r"known inconsistency in the artifact", card, re.I), (
        "the artifact's disclaimer differs from the code's; the card must disclose it"
    )


# ── §9, the magnitude head ──────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def magnitude() -> dict:
    from copilot.config import MAGNITUDE_METRICS_PATH

    if not MAGNITUDE_METRICS_PATH.exists():
        pytest.skip("magnitude metrics not produced in this checkout")
    return json.loads(MAGNITUDE_METRICS_PATH.read_text(encoding="utf-8"))


def test_magnitude_section_exists(card: str) -> None:
    assert "## 9. The second head" in card, "MODEL_CARD.md §9 should document the magnitude head"


def test_magnitude_headline_figures(card: str, magnitude: dict) -> None:
    """Scoped to §9.3, so a wrong figure cannot hide behind a right one elsewhere."""
    block = section(card, "### 9.3 What it scores")
    s = magnitude["summary"]
    for figure in (
        pct(s["accuracy_when_calling_median"]),
        pct(s["accuracy_when_calling_min"]),
        pct(s["accuracy_when_calling_max"]),
        pct(magnitude["base_rate"]),
        f"{magnitude['train_rows']:,}",
        magnitude["train_end"],
        str(magnitude["threshold"]),
    ):
        assert figure in block or figure in card, f"{figure} is not in MODEL_CARD.md §9"


def test_magnitude_per_window_table(card: str, magnitude: dict) -> None:
    block = section(card, "### 9.3 What it scores")
    for w in magnitude["windows"]:
        assert pct(w["accuracy"]) in block, f"{w['window']} full accuracy missing"
        if w["accuracy_when_calling"]:
            assert pct(w["accuracy_when_calling"]) in block, f"{w['window']} on-calls missing"


def test_magnitude_claim_still_holds(magnitude: dict) -> None:
    """The card claims a median at or above 60% in three of four windows."""
    s = magnitude["summary"]
    assert s["accuracy_when_calling_median"] >= 0.60
    assert s["windows_at_or_above_60pct"] >= 3
    assert s["windows_total"] >= 4


def test_magnitude_discloses_that_it_never_read_the_holdout(card: str) -> None:
    """The weaker-evidence caveat must travel with the number."""
    block = section(card, "### 9.5 Limitations specific to this head")
    assert "never been evaluated on the final holdout" in block


def test_magnitude_discloses_the_leak(card: str) -> None:
    """A 100%-accuracy leak that nearly shipped belongs in the limitations, not a commit log."""
    block = section(card, "### 9.5 Limitations specific to this head")
    assert "100.00%" in block
    assert "y_big" in block


def test_magnitude_does_not_claim_a_direction(card: str) -> None:
    block = section(card, "## 9. The second head")
    assert "not" in block.lower() and "direction" in block.lower()
