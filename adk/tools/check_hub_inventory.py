"""Facility / hub inventory probe — uses shipment row hub vs destination."""

from __future__ import annotations

import json
import math
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


@tool()
def check_hub_inventory(shipment_id: str) -> str:
    """Check whether a registered hub could shorten fulfilment vs the current lane endpoints.

    Uses hub latitude/longitude and labels from the SQLite-backed shipment row.

    Args:
        shipment_id: Active load id in the War Room database.

    Returns:
        str: JSON with ``hub_viable``, ``hub_label``, distances in km, and a short narrative.
    """
    url = f"{_base_url()}/api/ships"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    ships: list[dict[str, Any]] = payload.get("ships") or []
    ship = next((s for s in ships if s.get("id") == shipment_id.strip()), None)
    if not ship:
        return json.dumps(
            {"error": f"Shipment not found: {shipment_id}", "hub_viable": False},
            indent=2,
        )

    olng, olat = float(ship["originLng"]), float(ship["originLat"])
    dlng, dlat = float(ship["destLng"]), float(ship["destLat"])
    hub_lng = ship.get("hubLng")
    hub_lat = ship.get("hubLat")
    hub_label = ship.get("hubLabel") or "Hub"

    if hub_lng is None or hub_lat is None:
        return json.dumps(
            {
                "shipment_id": shipment_id,
                "hub_viable": False,
                "reason": "No hub coordinates on file for this load.",
            },
            indent=2,
        )

    hlng, hlat = float(hub_lng), float(hub_lat)
    dist_origin_dest = _haversine_km(olng, olat, dlng, dlat)
    dist_hub_dest = _haversine_km(hlng, hlat, dlng, dlat)
    # "Closer to consignee" — hub should reduce remaining distance vs going direct endpoint-to-endpoint truck path heuristic
    closer = dist_hub_dest < dist_origin_dest * 0.95

    narrative = (
        f"Hub '{hub_label}' is ~{dist_hub_dest:.0f} km from destination vs "
        f"~{dist_origin_dest:.0f} km full lane span (origin–dest great circle)."
    )
    cargo = ship.get("cargo") or "SKU"

    out = {
        "shipment_id": shipment_id,
        "hub_viable": bool(closer),
        "hub_label": hub_label,
        "cargo": cargo,
        "dist_origin_to_dest_km": round(dist_origin_dest, 1),
        "dist_hub_to_dest_km": round(dist_hub_dest, 1),
        "narrative": narrative
        + (
            " Identical SKU assumed at hub for demo — fulfilment swap may apply."
            if closer
            else " Hub not clearly closer; recommend reroute evaluation instead of swap."
        ),
    }
    return json.dumps(out, indent=2)
