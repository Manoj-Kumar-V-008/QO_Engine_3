import pytest

from engine.scoreboard import build_scoreboard, format_scoreboard
from test_greedy import make_scenario


def schedule(method, delivered, used):
    return {
        "method": method,
        "summary": {"gb_delivered": delivered, "overflow_gb": 3000 - delivered - 600,
                    "overflow_events": 5, "passes_used": used},
    }


def test_scoreboard_compares_methods_against_the_baseline():
    board = build_scoreboard(make_scenario(), [schedule("greedy", 600, 20), schedule("optimizer", 650, 22)])
    assert board["generated_gb"] == 3000
    assert board["methods"][0]["share_of_generated_pct"] == pytest.approx(20.0)
    assert board["gain_gb"] == pytest.approx(50)
    assert board["gain_pct"] == pytest.approx(8.3)


def test_scoreboard_text_mentions_both_methods():
    board = build_scoreboard(make_scenario(), [schedule("greedy", 600, 20), schedule("optimizer", 650, 22)])
    text = "\n".join(format_scoreboard(board))
    assert "greedy" in text and "optimizer" in text and "+50 GB" in text