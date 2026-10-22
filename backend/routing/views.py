import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .serializers import PlanRequestSerializer, resolve_departure
from .services.clients import UpstreamError, geocode, origin_timezone
from .services.planner import PlanRequest, build_plan

log = logging.getLogger(__name__)


@api_view(["GET"])
def health(request):
    return Response({"ok": True})


@api_view(["GET"])
def geocode_view(request):
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"results": []})
    if len(q) > 120:
        return Response({"error": "Query too long."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        return Response({"results": geocode(q)})
    except UpstreamError as err:
        return Response({"error": f"Place search is unavailable ({err.service}). Try again shortly."}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
def plan_view(request):
    ser = PlanRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data
    origin = (data["origin"]["lon"], data["origin"]["lat"])
    destination = (data["destination"]["lon"], data["destination"]["lat"])
    tz_name = origin_timezone(origin)
    departure = resolve_departure(data.get("departure_local"), tz_name)
    req = PlanRequest(
        origin=origin,
        destination=destination,
        origin_label=data["origin"]["label"],
        destination_label=data["destination"]["label"],
        departure=departure,
        load_lb=data["load_lb"],
        interval_mi=int(data["interval_mi"]),
        timezone_name=tz_name,
    )
    try:
        return Response(build_plan(req))
    except UpstreamError as err:
        log.warning("plan failed: %s", err)
        msg = {
            "OSRM": "The routing service could not build a route between these places.",
            "Open-Meteo": "The weather service is busy or unavailable.",
            "routing": err.message,
        }.get(err.service, f"{err.service} is unavailable.")
        return Response({"error": msg, "detail": err.message, "service": err.service}, status=status.HTTP_502_BAD_GATEWAY)
