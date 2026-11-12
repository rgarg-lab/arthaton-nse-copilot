"""The leakage tests.

§4.7 says that if validation accuracy exceeds ~60% I should assume leakage and go
find it. These tests are the cheaper version of that: they look for leakage
directly, in the places it actually comes from, so that a good-looking number is
either real or explained by something these tests do not cover — and the list of
what they do not cover is at the bottom of this file, explicitly.

The old project's defects that each test is aimed at are named in the test.
"""

from __future__ import annotations

import ast
import inspect

import numpy as np
import pandas as pd
import pytest

from copilot import features as features_mod
from copilot.features import ID_COLUMNS, LABEL_COLUMNS, feature_columns
from copilot.labels import add_labels, labelled


def _negative_shift_calls(module) -> list[str]:
    """Every `.shift(n)` / `.pct_change(n)` call in `module` with a negative n.

    Parsed rather than grepped. A substring search over the source also matches
    the prose in a docstring that *describes* the rule, which is how the first
    version of this test failed on the very docstring asserting the property.
    """
    tree = ast.parse(inspect.getsource(module))
    found: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr not in {"shift", "pct_change", "diff"}:
            continue
        args = [*node.args, *(kw.value for kw in node.keywords if kw.arg in {"periods", "freq"})]
        for arg in args:
            # `shift(-1)` parses as a UnaryOp(USub) over a constant, not as a
            # negative literal.
            if isinstance(arg, ast.UnaryOp) and isinstance(arg.op, ast.USub):
                found.append(f"line {node.lineno}: .{node.func.attr}(-...)")
            elif isinstance(arg, ast.Constant) and isinstance(arg.value, int | float) and arg.value < 0:
                found.append(f"line {node.lineno}: .{node.func.attr}({arg.value})")
    return found


def test_no_backward_shift_in_feature_code():
    """No feature may be built with a negative shift.

    This is the mechanical version of "no look-ahead": a negative shift is the
    only way a pandas column can read its own future. `labels.py` is allowed
    exactly one — the target — and `features.py` none at all.

    It is a crude check, but it catches the single most common way this bug gets
    reintroduced, which is someone adding a "next day's open" feature because it
    appeared to be available in the frame. And it keeps catching it after I have
    stopped paying attention, which is the point.
    """
    offenders = _negative_shift_calls(features_mod)
    assert not offenders, "features.py reads the future: " + "; ".join(offenders)


def test_labels_has_exactly_one_forward_shift():
    """The target is allowed to look forward. Nothing else in `labels.py` is, and
    if a second one ever appears it is far more likely to be a bug than a second
    legitimate target."""
    from copilot import labels as labels_mod

    offenders = _negative_shift_calls(labels_mod)
    assert len(offenders) == 1, f"expected exactly one forward shift in labels.py, got {offenders}"


def test_feature_matrix_excludes_identity_and_labels(panel):
    cols = feature_columns(panel)
    for forbidden in (*ID_COLUMNS, *LABEL_COLUMNS):
        assert forbidden not in cols, f"{forbidden} must not be a model feature"
    # Ticker identity is not a feature (§6.2): the model is a claim about market
    # states, not about which 18 names were picked.
    assert "ticker" not in cols
    # And no raw price level survives, under any spelling.
    for col in cols:
        assert not col.startswith("close"), f"{col} looks like a raw price level"
        assert "lag" not in col.lower(), f"{col} looks like a raw close lag"


def test_no_feature_is_a_near_perfect_predictor(panel):
    """No single feature may correlate with the target above |0.30|.

    The signature of target leakage in a pooled daily-returns panel is one
    feature with a suspiciously high correlation to `y_ret`. Genuine next-session
    predictors in this asset class sit around |0.02–0.08|; anything past 0.30 is
    a copy of the answer, not a signal. (`improved_model_v4.py` in the earlier
    project had exactly this, via a target column built before the split.)
    """
    lab = labelled(panel)
    cols = feature_columns(panel)
    X = lab[cols].astype(float)
    y = lab["y_ret"].astype(float)

    worst_col, worst_val = None, 0.0
    for c in cols:
        v = X[c]
        if v.std(skipna=True) == 0 or v.notna().sum() < 1000:
            continue
        r = float(np.abs(v.corr(y)))
        if np.isfinite(r) and r > worst_val:
            worst_col, worst_val = c, r

    assert worst_val < 0.30, f"{worst_col} correlates {worst_val:.3f} with y_ret — suspect leakage"


def test_label_is_strictly_forward(synthetic_panel):
    """`y_ret[t]` must equal the realised next-session return, and nothing else.

    Checked against a directly recomputed value rather than against itself.
    """
    p = synthetic_panel.sort_values(["ticker", "date"]).reset_index(drop=True)
    for _, g in p.groupby("ticker", sort=False):
        close = g["close"].to_numpy(dtype=float)
        expected = np.full(len(close), np.nan)
        expected[:-1] = close[1:] / close[:-1] - 1.0
        got = g["y_ret"].to_numpy(dtype=float)
        both = np.isfinite(expected) & np.isfinite(got)
        assert np.allclose(expected[both], got[both], atol=1e-12)
        # The final row per ticker has no outcome yet, and is kept, not dropped.
        assert not np.isfinite(got[-1])


def test_future_price_shock_does_not_change_past_features(synthetic_panel):
    """Mutate the last 30 sessions' prices; no earlier feature row may move.

    This is the strongest statement available about look-ahead, because it does
    not depend on knowing which columns are suspicious. If any feature at time
    *t* reads a price from after *t*, perturbing the future changes the past and
    this test fails.
    """
    from copilot.features import build_features

    rng = np.random.default_rng(11)
    dates = pd.DatetimeIndex(sorted(synthetic_panel["date"].unique()))
    cutoff = dates[-30]

    base_prices = (
        synthetic_panel[["date", "ticker", "close"]]
        .assign(
            open=lambda d: d["close"],
            high=lambda d: d["close"] * 1.004,
            low=lambda d: d["close"] * 0.996,
            volume=5_000_000.0,
        )
        .copy()
    )
    shocked = base_prices.copy()
    tail = shocked["date"] >= cutoff
    shocked.loc[tail, "close"] = shocked.loc[tail, "close"] * (
        1.0 + rng.normal(0, 0.25, int(tail.sum()))
    )
    shocked.loc[tail, "open"] = shocked.loc[tail, "close"]
    shocked.loc[tail, "high"] = shocked.loc[tail, "close"] * 1.004
    shocked.loc[tail, "low"] = shocked.loc[tail, "close"] * 0.996

    macro = pd.DataFrame({"date": dates})
    level = 100.0 * np.cumprod(1.0 + rng.normal(0, 0.006, len(dates)))
    for key in ("nifty", "niftyenergy", "vix", "brent", "usdinr", "gold", "spx", "ndx"):
        macro[f"{key}_close"] = level
    empty_sent = pd.DataFrame(columns=["date", "ticker", "sent_raw", "news_count"])

    a = build_features(base_prices, macro, empty_sent)
    b = build_features(shocked, macro, empty_sent)

    cols = feature_columns(add_labels(a))
    past_a = a[a["date"] < cutoff][cols].astype(float).to_numpy()
    past_b = b[b["date"] < cutoff][cols].astype(float).to_numpy()

    both = np.isfinite(past_a) & np.isfinite(past_b)
    assert np.allclose(past_a[both], past_b[both], atol=1e-9), (
        "a future price shock changed a past feature row — there is look-ahead in features.py"
    )


def test_sentiment_is_shifted_by_one_session():
    """A score published on session *t* must land on row *t+1*, per ticker.

    This is the ported mechanism from `add_new_rows_decay2.py`, and the reason it
    matters is that without the shift the feature is partly a same-day price echo,
    which inflates accuracy for a reason that would not survive live trading.
    """
    from copilot.features import build_features

    dates = pd.bdate_range("2021-01-04", periods=40)
    prices = pd.DataFrame(
        [
            {
                "date": d,
                "ticker": "RELIANCE.NS",
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 100.0,
                "volume": 1_000_000.0,
            }
            for d in dates
        ]
    )
    macro = pd.DataFrame({"date": dates})
    for key in ("nifty", "niftyenergy", "vix", "brent", "usdinr", "gold", "spx", "ndx"):
        macro[f"{key}_close"] = 100.0

    news_day = dates[10]
    sent = pd.DataFrame([{"date": news_day, "ticker": "RELIANCE.NS", "sent_raw": 0.8, "news_count": 1}])

    out = build_features(prices, macro, sent).sort_values("date").reset_index(drop=True)
    i = int(out.index[out["date"] == news_day][0])

    assert out.loc[i, "news_available"] == 0.0, "news flag appears on the publication day itself"
    assert out.loc[i + 1, "news_available"] == 1.0, "news flag did not land on the next session"
    assert out.loc[i + 1, "sent_score"] == pytest.approx(0.8)
    # And then it decays rather than being dropped to zero.
    assert out.loc[i + 2, "sent_decay"] == pytest.approx(0.8 * 0.9)
    assert out.loc[i + 3, "sent_decay"] == pytest.approx(0.8 * 0.9 * 0.9)
    assert out.loc[i + 2, "news_available"] == 0.0


def test_feature_count_within_ceiling(panel):
    from copilot.config import MAX_FEATURES

    cols = feature_columns(panel)
    # +1 for vix_regime, which Preprocessor substitutes in for the raw vix level.
    assert len(cols) + 1 <= MAX_FEATURES, f"{len(cols) + 1} model features exceeds {MAX_FEATURES}"


# ─── what these tests do NOT cover ───────────────────────────────────────────
#
# Stated rather than implied, because an untrue sense of coverage is worse than
# none:
#
# - **Survivorship bias.** The universe is today's large-caps. No test can detect
#   that from the data; it needs a point-in-time constituent history, which is not
#   freely available. Named in the README.
# - **yfinance's own adjustments.** `auto_adjust=True` means splits and dividends
#   are applied retroactively by the vendor. If Yahoo restates a historical
#   adjustment, the panel changes. Not detectable here.
# - **The news corpus's provenance.** FinBERT's scoring of it is real; the
#   statements were written for my earlier project and are not wire headlines.
#   `sentiment.py` says so at the top.
# - **Preprocessing leakage across folds** is covered by `test_purge.py`, not here.
