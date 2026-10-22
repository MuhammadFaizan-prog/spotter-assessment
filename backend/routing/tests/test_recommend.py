from routing.services.recommend import explain, rank, summarize, verdicts
from routing.services.risk import Risk

L, M, H, S, N = (int(r) for r in Risk)


def route(rid, segments, duration_s=36000):
    return summarize(rid, sum(m for m, _ in segments), duration_s, segments)


NAMES = {"a": "Route A", "b": "Route B", "c": "Route C"}


def test_summary_totals_and_average():
    s = route("a", [(10, L), (20, H), (10, S)])
    assert (s.severe_mi, s.high_mi, s.no_travel_mi) == (10, 20, 0)
    assert s.avg_risk == (0 * 10 + 2 * 20 + 3 * 10) / 40
    assert s.max_risk == S


def test_fewest_severe_miles_wins_first():
    a = route("a", [(100, S), (100, L)], 30000)
    b = route("b", [(50, S), (150, H)], 50000)
    assert [s.route_id for s in rank([a, b])] == ["b", "a"]


def test_then_fewest_high_miles():
    a = route("a", [(10, S), (40, H)], 30000)
    b = route("b", [(10, S), (20, H), (100, M)], 50000)
    assert rank([a, b])[0].route_id == "b"


def test_then_lowest_average_risk():
    a = route("a", [(100, M), (100, L)], 30000)
    b = route("b", [(20, M), (180, L)], 50000)
    assert rank([a, b])[0].route_id == "b"


def test_then_shortest_time():
    a = route("a", [(200, L)], 50000)
    b = route("b", [(200, L)], 30000)
    assert rank([a, b])[0].route_id == "b"
    assert "faster" in explain(rank([a, b]), NAMES)


def test_no_travel_is_worse_than_any_severe():
    a = route("a", [(5, N), (195, L)], 30000)
    b = route("b", [(150, S), (50, L)], 60000)
    assert rank([a, b])[0].route_id == "b"


def test_full_order_three_routes():
    a = route("a", [(10, H), (90, L)], 30000)
    b = route("b", [(100, L)], 40000)
    c = route("c", [(10, S), (90, L)], 20000)
    ranked = rank([a, b, c])
    assert [s.route_id for s in ranked] == ["b", "a", "c"]
    v = verdicts(ranked, NAMES)
    assert v["b"].startswith("Recommended")
    assert "High miles" in v["a"]
    assert "Severe miles" in v["c"]


def test_float_noise_does_not_break_ties():
    a = route("a", [(0.1 + 0.2, S), (100, L)], 50000)
    b = route("b", [(0.3, S), (100, L)], 40000)
    assert rank([a, b])[0].route_id == "b"


def test_negligible_average_risk_difference_falls_through_to_time():
    # 10 Moderate miles over 800 mi (avg 0.0125) vs 8 (avg 0.01): both round to 0.01
    a = route("a", [(10, M), (790, L)], 50000)
    b = route("b", [(8, M), (792, L)], 54000)
    assert rank([a, b])[0].route_id == "a"
