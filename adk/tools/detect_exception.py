"""Exception trigger analysis — combines fleet + weather API responses."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def detect_exception(shipment_id: str | None = None) -> str:
    """Decide whether Routing Pivt should fire EXCEPTION_TRIGGER for the fleet or one load.

    Calls ``/api/ships`` and ``/api/weather-events``, then summarizes intersections.

    Args:
        shipment_id: Optional load id (e.g. ``NY-8472``). If omitted, evaluates the
            primary load from the database.

    Returns:
        str: JSON with ``exception_trigger`` (bool), ``reason``, ``shipment_id``,
            ``weather_hits`` (count), and ``details``.
    """
    ships_url = f"{_base_url()}/api/ships"
    wx_url = f"{_base_url()}/api/weather-events"

    r_ships = requests.get(ships_url, timeout=30)
    r_ships.raise_for_status()
    fleet_payload: dict[str, Any] = r_ships.json()
    ships: list[dict[str, Any]] = fleet_payload.get("ships") or []

    primary = next((s for s in ships if s.get("isPrimary")), None)
    target_id = (shipment_id or "").strip() or (
        primary.get("id") if primary else ""
    )

    r_wx = requests.get(wx_url, timeout=90)
    r_wx.raise_for_status()
    wx: dict[str, Any] = r_wx.json()
    hits: list[dict[str, Any]] = wx.get("hits") or []

    relevant = (
        [h for h in hits if h.get("shipmentId") == target_id]
        if target_id
        else hits
    )
    event_count = sum(len(h.get("events") or []) for h in relevant)
    trigger = event_count > 0

    ship = next((s for s in ships if s.get("id") == target_id), primary)

    reason_parts: list[str] = []
    if trigger:
        reason_parts.append(
            "Severe weather or hazard geometry intersects the modeled route corridor."
        )
    else:
        reason_parts.append("No NWS alert intersection for the selected scope.")

    corridor = ship.get("blizzardCorridor") if ship else None
    if corridor:
        reason_parts.append(f"Declared corridor watch: {corridor}")

    out: dict[str, Any] = {
        "exception_trigger": trigger,
        "reason": " ".join(reason_parts),
        "shipment_id": target_id or None,
        "weather_hits": event_count,
        "routes_with_alerts": wx.get("routesWithAlerts"),
        "details": relevant[:5] if relevant else [],
    }
    return json.dumps(out, indent=2)
