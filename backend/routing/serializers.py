from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers

MIN_LOAD_LB = 0
MAX_LOAD_LB = 80_000  # US federal gross vehicle weight limit without permits
MAX_DAYS_AHEAD = 7


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=200)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    # Wall-clock time at the origin, e.g. "2026-10-23T08:00". Omit to depart now.
    departure_local = serializers.DateTimeField(required=False, allow_null=True, input_formats=["%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"])
    load_lb = serializers.FloatField(min_value=MIN_LOAD_LB, max_value=MAX_LOAD_LB)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50])

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if abs(o["lat"] - d["lat"]) < 1e-4 and abs(o["lon"] - d["lon"]) < 1e-4:
            raise serializers.ValidationError({"destination": "Destination must differ from origin."})
        return attrs


def resolve_departure(departure_local, tz_name: str) -> datetime:
    """Interpret a naive local time in the origin's time zone; validate window."""
    now = datetime.now(timezone.utc)
    if departure_local is None:
        return now
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = timezone.utc
    naive = departure_local.replace(tzinfo=None)
    aware = naive.replace(tzinfo=tz).astimezone(timezone.utc)
    if aware < now - timedelta(hours=1):
        raise serializers.ValidationError({"departure_local": "Departure is in the past. Pick a time from now up to 7 days ahead."})
    if aware > now + timedelta(days=MAX_DAYS_AHEAD):
        raise serializers.ValidationError({"departure_local": "Forecasts are only reliable up to 7 days ahead."})
    return aware
