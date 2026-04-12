"""Fleet status tool — calls the EIS War Room Next.js API."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def fetch_fleet_status() -> str:
    """Return all active shipments and scenario settings from the War Room SQLite database.

    Use this to see load IDs, lanes, priority, hub/stall coordinates, and which load is primary.

    Returns:
        str: JSON string with keys ``ships`` (array) and ``scenario`` (object).
    """
    url = f"{_base_url()}/api/ships"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return json.dumps(data, indent=2)
