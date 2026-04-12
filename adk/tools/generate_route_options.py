"""Route alternatives backed by the app's Google-Maps cost engine (``/api/route-options``)."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def generate_route_options(shipment_id: str) -> str:
    """Compute cost-ordered route alternatives for a shipment using Google Maps Directions.

    The backend calls Google Maps Directions API for up to three routes (direct,
    via-hub, avoid-highways), models fuel/toll/time costs, and returns them
    cheapest-first.  Falls back to a static matrix when the API key is missing.

    Args:
        shipment_id: Load id in the database (e.g. ``IL-2301``).

    Returns:
        str: JSON with ``source`` (``google_maps`` | ``fallback``), ``rows`` (ordered
             cheapest → most expensive), ``computed`` (detailed per-route metrics when
             source is ``google_maps``), and ``riskBanner``.
    """
    url = f"{_base_url()}/api/route-options"
    params: dict[str, str] = {"shipmentId": shipment_id.strip()}
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    return json.dumps(payload, indent=2)
