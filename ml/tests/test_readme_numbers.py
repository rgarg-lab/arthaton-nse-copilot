"""The README's numbers must equal the artifact's numbers.

§4.2 says every number rendered in the UI must trace to a generated artifact, and
`tests/honesty.test.ts` enforces that for the application. **The README is the
other surface a judge reads, and it is the one most likely to drift**: it is
written once, by hand, from a model that is then retrained.

So every figure quoted in the README's headline tables is checked against
`metrics.json` here. If the model is re-run and the numbers move, this fails and
says exactly which claim is now false — which is a far better outcome than a
submission whose README quietly disagrees with its own evaluation.

The check is deliberately literal: it looks for the *formatted string* in the
README text. That is what a reader sees, so that is what has to be true.
"""

from __future__ import annotations

import json

import pytest

from copilot.config import ARTIFACTS_DIR, METRICS_PATH

README = ARTIFACTS_DIR.parents[1] / "README.md"


@pytest.fixture(scope="module")
def metrics() -> dict:
    if not METRICS_PATH.exists():
        pytest.skip("metrics.json missing — run `python ml/tasks.py eval`")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def readme() -> str:
    if not README.exists():
        pytest.skip("README.md missing")
    return README.read_text(encoding="utf-8")


def pct(value: float, places: int = 2) -> str:
    return f"{value * 100:.{places}f}%"


def claims(m: dict) -> dict[str, str]:
    """Every figure the README quotes, rendered the way the README renders it."""
    regimes = {r["regime"]: r for r in m["breakdowns"]["per_vix_regime"]}
    years = {r["year"]: r for r in m["breakdowns"]["per_year"]}
    paper = m["paper_trading"]["scenarios"]
    bh = m["baselines"]["buy_and_hold"]

    return {
        # headline
        "accuracy": pct(m["direction"]["accuracy"]),
        "auc": f"{m['direction']['auc']:.4f}",
        "brier": f"{m['direction']['brier']:.4f}",
        "holdout rows": f"{m['direction']['n']:,}",
        # baselines
        "always-up": pct(m["baselines"]["always_up"]["accuracy"]),
        "previous-day sign": pct(m["baselines"]["previous_day_sign"]["accuracy"]),
        "logistic": pct(m["baselines"]["logistic_3_feature"]["accuracy"]),
        # abstention
        "threshold": f"{m['abstention']['threshold'] * 100:.1f}%",
        "coverage": f"{m['abstention']['coverage'] * 100:.1f}%",
        "accuracy when signalling": pct(m["abstention"]["accuracy_when_signalling"]),
        "signals emitted": f"{m['abstention']['signals_emitted']:,}",
        # the unflattering ones
        "r2": f"{m['regression']['r2']:.4f}",
        "expected calibration error": pct(m["calibration"]["expected_calibration_error"]),
        "max calibration error": pct(m["calibration"]["max_calibration_error"]),
        # regimes — the table where my expectation was wrong
        "calm": pct(regimes["calm"]["accuracy"]),
        "normal": pct(regimes["normal"]["accuracy"]),
        "stressed": pct(regimes["stressed"]["accuracy"]),
        # per-year
        "2025 accuracy": pct(years[2025]["accuracy"]),
        "2026 accuracy": pct(years[2026]["accuracy"]),
        # paper trading and the economic baseline
        "paper realistic": f"+{paper['realistic']['total_return'] * 100:.2f}%",
        "paper optimistic": f"+{paper['optimistic']['total_return'] * 100:.2f}%",
        "buy and hold": f"+{bh['total_return'] * 100:.2f}%",
    }


def normalise(text: str) -> str:
    """Make typography irrelevant to the comparison.

    Prose legitimately uses a typographic minus (U+2212) where `f"{x:.4f}"` emits an
    ASCII hyphen, and a non-breaking space where the formatter emits a normal one. Those
    are rendering choices, not different numbers, and a test that failed on them would
    teach the author to stop writing properly rather than to keep the figures true.
    """
    return text.replace("−", "-").replace(" ", " ").replace(" ", " ")


def test_every_readme_figure_matches_the_artifact(metrics, readme):
    text = normalise(readme)
    missing = {
        name: value for name, value in claims(metrics).items() if normalise(value) not in text
    }
    assert not missing, (
        "the README quotes figures that no longer match ml/artifacts/metrics.json.\n"
        "Each line is what the artifact now says and the README does not contain:\n  "
        + "\n  ".join(f"{name}: {value}" for name, value in missing.items())
    )


def test_readme_does_not_claim_a_suspicious_accuracy(metrics, readme):
    """§4.7: above 60% means leakage, not skill.

    Checked against the README's own prose too, because a number can be correct in
    the artifact and still be oversold in the text around it.
    """
    assert metrics["direction"]["accuracy"] < 0.60
    for forbidden in ("highly accurate", "state of the art", "outperforms the market"):
        assert forbidden not in readme.lower(), f"the README oversells with {forbidden!r}"


def test_readme_states_the_limitations(readme):
    """The limitations are not optional garnish — §2 scores named limitations."""
    for required in ("Survivorship bias", "not investment advice", "Known limitations"):
        assert required.lower() in readme.lower(), f"the README must mention {required!r}"


def test_readme_credits_the_libraries(readme):
    """An explicit Arthaton rule: open-source libraries and AI APIs must be credited."""
    for library in ("LightGBM", "scikit-learn", "yfinance", "FastAPI", "Next.js", "Recharts"):
        assert library in readme, f"{library} is used but not credited"
    for ai in ("Gemini", "finbert"):
        assert ai.lower() in readme.lower(), f"{ai} is an AI dependency and must be credited"


def test_readme_reports_the_universe_gap(readme, metrics):
    """If the panel is short of the specified universe, the README has to say so.

    The dishonest version of this build reports metrics over 17 names while
    describing an 18-name universe. This test makes that impossible to do quietly:
    whenever the panel is short, the README must carry the explanation.
    """
    from copilot.config import PANEL_PATH, UNIVERSE

    if not PANEL_PATH.exists():
        pytest.skip("panel.parquet missing")
    import pandas as pd

    present = set(pd.read_parquet(PANEL_PATH, columns=["ticker"])["ticker"].unique())
    missing = set(UNIVERSE) - present

    if not missing:
        return  # nothing to disclose

    assert "17" in readme, "the panel is short of the universe and the README does not say so"
    for ticker in missing:
        bare = ticker.replace(".NS", "")
        assert bare in readme, f"{ticker} is missing from the panel and unexplained in the README"
