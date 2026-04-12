"""Driver / dispatcher CRM slice for a shipment — from SQLite via API."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def get_driver_contacts(shipment_id: str) -> str:
    """Return driver and dispatcher fields and CRM timeline JSON for one load.

    The app stores contacts and optional ``crmTimelineJson`` on the shipment row.

    Args:
        shipment_id: Load id (e.g. ``NY-8472``).

    Returns:
        str: JSON with ``shipmentId``, driver/dispatcher fields, ``crmTimelineJson`` (raw),
        and ``isPrimary``.
    """
    url = f"{_base_url()}/api/ships"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    ships: list[dict[str, Any]] = payload.get("ships") or []
    sid = shipment_id.strip()
    ship = next((s for s in ships if s.get("id") == sid), None)
    if not ship:
        return json.dumps({"error": f"Shipment not found: {sid}"}, indent=2)

    slim = {
        "shipmentId": ship.get("id"),
        "isPrimary": ship.get("isPrimary"),
        "driverName": ship.get("driverName"),
        "driverPhone": ship.get("driverPhone"),
        "driverEmail": ship.get("driverEmail"),
        "driverOrg": ship.get("driverOrg"),
        "dispatcherName": ship.get("dispatcherName"),
        "dispatcherPhone": ship.get("dispatcherPhone"),
        "dispatcherEmail": ship.get("dispatcherEmail"),
        "dispatcherOrg": ship.get("dispatcherOrg"),
        "crmTimelineJson": ship.get("crmTimelineJson"),
        "originLabel": ship.get("originLabel"),
        "destLabel": ship.get("destLabel"),
    }
    return json.dumps(slim, indent=2)
