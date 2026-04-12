"""NWS weather vs fleet routes — calls the EIS War Room Next.js API."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def check_weather_alerts() -> str:
    """Fetch NOAA NWS active alerts intersected with each fleet route from the app.

    The Next.js server loads SQLite shipments, builds route geometry, and intersects
    with NWS GeoJSON. May take up to ~60s.

    Returns:
        str: JSON with ``hits`` (per-shipment alert summaries), ``usMapDisplay``, metadata.
    """
    url = f"{_base_url()}/api/weather-events"
    resp = requests.get(url, timeout=90)
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return json.dumps(data, indent=2)
