import pytest

from routing.services.risk import Risk, assess, classify_rain, classify_snow, classify_wind, continuous_score, load_rule


@pytest.mark.parametrize(
    "mph,expected",
    [(0, Risk.LOW), (24.9, Risk.LOW), (25, Risk.MODERATE), (34.9, Risk.MODERATE), (35, Risk.HIGH),
     (44.9, Risk.HIGH), (45, Risk.SEVERE), (54.9, Risk.SEVERE), (55, Risk.NO_TRAVEL), (80, Risk.NO_TRAVEL)],
)
def test_wind_bands(mph, expected):
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    "inch,expected",
    [(0, Risk.LOW), (0.099, Risk.LOW), (0.10, Risk.MODERATE), (0.249, Risk.MODERATE), (0.25, Risk.HIGH),
     (0.499, Risk.HIGH), (0.50, Risk.SEVERE), (1.00, Risk.SEVERE), (1.001, Risk.NO_TRAVEL)],
)
def test_rain_bands(inch, expected):
    assert classify_rain(inch) == expected


@pytest.mark.parametrize(
    "inch,expected",
    [(0, Risk.LOW), (0.49, Risk.LOW), (0.5, Risk.MODERATE), (0.99, Risk.MODERATE), (1.0, Risk.HIGH),
     (1.99, Risk.HIGH), (2.0, Risk.SEVERE), (3.0, Risk.SEVERE), (3.01, Risk.NO_TRAVEL)],
)
def test_snow_bands(inch, expected):
    assert classify_snow(inch) == expected


class TestLoadRules:
    def test_55_mph_is_no_travel_for_any_load(self):
        assert load_rule(55, 0)[0] == Risk.NO_TRAVEL
        assert assess(60, 0, 0, 1_000).level == Risk.NO_TRAVEL

    def test_45_to_54_over_30k_is_no_travel(self):
        assert assess(45, 0, 0, 30_001).level == Risk.NO_TRAVEL
        assert assess(54.9, 0, 0, 42_000).level == Risk.NO_TRAVEL

    def test_45_to_54_at_or_under_30k_stays_severe(self):
        assert assess(50, 0, 0, 30_000).level == Risk.SEVERE
        assert assess(50, 0, 0, 10_000).level == Risk.SEVERE

    def test_35_to_44_over_40k_is_severe(self):
        a = assess(40, 0, 0, 40_001)
        assert a.level == Risk.SEVERE
        assert a.drivers == ("load",)
        assert "40,000" in a.load_rule

    def test_35_to_44_at_or_under_40k_stays_high(self):
        assert assess(40, 0, 0, 40_000).level == Risk.HIGH

    def test_rule_does_not_apply_below_35(self):
        assert assess(34.9, 0, 0, 80_000).level == Risk.MODERATE


class TestCombined:
    def test_final_is_max_of_factors(self):
        a = assess(10, 0.3, 0.6, 20_000)  # Low wind, High rain, Moderate snow
        assert a.level == Risk.HIGH
        assert a.drivers == ("rain",)

    def test_all_low(self):
        a = assess(5, 0, 0, 42_000)
        assert a.level == Risk.LOW and a.drivers == () and a.load_rule is None

    def test_snow_beats_wind(self):
        assert assess(30, 0, 2.5, 0).level == Risk.SEVERE

    def test_ties_list_every_driver(self):
        assert assess(36, 0.3, 0, 0).drivers == ("wind", "rain")


def test_continuous_score_matches_discrete_class():
    cases = [(0, 0, 0, 0), (30, 0, 0, 0), (40, 0, 0, 45_000), (50, 0, 0, 35_000), (10, 0.7, 0, 0), (0, 0, 3.5, 0), (20, 1.0, 0, 0)]
    for w, r, s, load in cases:
        assert int(continuous_score(w, r, s, load)) == int(assess(w, r, s, load).level)
