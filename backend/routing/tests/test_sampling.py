import pytest

from routing.services.geo import Track, haversine_mi, sample_checkpoints, simplify

# A straight east-west line along the equator: 1 degree of longitude ≈ 69.09 mi.
LINE = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)]


def make_track(durations=None):
    return Track.build(LINE, durations, total_duration_s=3 * 3600)


def test_haversine_one_degree_at_equator():
    assert haversine_mi((0, 0), (1, 0)) == pytest.approx(69.09, rel=1e-3)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoints_every_interval_including_ends(interval):
    t = make_track()
    s = sample_checkpoints(t, interval)
    miles = [c.mile for c in s]
    assert miles[0] == 0
    assert miles[-1] == pytest.approx(t.length_mi)
    for a, b in zip(miles[:-2], miles[1:-1]):
        assert b - a == pytest.approx(interval)
    assert miles[-1] - miles[-2] <= interval + 1e-9


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_owned_miles_sum_to_route_length(interval):
    t = make_track()
    s = sample_checkpoints(t, interval)
    assert sum(c.segment_mi for c in s) == pytest.approx(t.length_mi)


def test_eta_uses_segment_durations():
    # first edge slow (2 h), the other two fast (0.5 h each)
    t = make_track([7200, 1800, 1800])
    pos, secs = t.locate(t.cum_mi[1])
    assert secs == pytest.approx(7200)
    pos, secs = t.locate(t.cum_mi[1] / 2)
    assert secs == pytest.approx(3600)
    assert pos[0] == pytest.approx(0.5)


def test_eta_proportional_when_no_annotations():
    t = make_track()
    _, secs = t.locate(t.length_mi / 2)
    assert secs == pytest.approx(1.5 * 3600)


def test_position_at_time_clamps():
    t = make_track()
    assert t.position_at_time(-5) == LINE[0]
    assert t.position_at_time(10**9) == LINE[-1]


def test_short_route_gets_origin_and_destination():
    t = Track.build([(0, 0), (0.05, 0)], total_duration_s=300)
    s = sample_checkpoints(t, 50)
    assert len(s) == 2 and s[0].mile == 0 and s[1].mile == pytest.approx(t.length_mi)


def test_invalid_interval():
    with pytest.raises(ValueError):
        sample_checkpoints(make_track(), 0)


def test_simplify_keeps_endpoints_and_drops_collinear():
    pts = [(i * 0.1, 0.0) for i in range(50)]
    out = simplify(pts, 0.001)
    assert out == [pts[0], pts[-1]]
