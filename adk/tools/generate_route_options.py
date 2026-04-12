"""Three route alternatives — mirrors ``routeOptions.ts`` / SQLite lane labels."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def _short_label(label: str | None, fallback: str) -> str:
    if not label:
        return fallback
    return label.split(",")[0].strip()


@tool()
def generate_route_options(shipment_id: str, scenario: str) -> str:
    """Build three deterministic route options (fast / cheap / balanced) for exception handling.

    Logic matches the War Room UI: blizzard lanes favor hub relay; port strike favors
    inland relay vs air/rail.

    Args:
        shipment_id: Load id in the database.
        scenario: One of ``blizzard``, ``port_strike``, or ``idle`` (idle is treated as blizzard).

    Returns:
        str: JSON with ``title``, ``subtitle``, ``rows`` (A/B/C), and ``riskBanner``.
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

    kind = (scenario or "blizzard").strip().lower()
    if kind == "idle":
        kind = "blizzard"

    oid = _short_label(ship.get("originLabel"), str(ship.get("routeFrom", "Origin")))
    did = _short_label(ship.get("destLabel"), str(ship.get("routeTo", "Dest")))
    load_id = str(ship.get("id", sid))

    title = "Suggested routes"
    risk_prefix = "Summary — "

    if kind == "port_strike":
        subtitle = f"For load {load_id} · {oid} to {did} (port disruption)"
        rows = [
            {
                "option": "A",
                "label": "A — Cheapest",
                "description": "Rail to Chicago — lowest cost, longest ETA window.",
                "eta": "+32 h",
                "cost": "$890",
                "slaPenalty": "$6,000",
                "approved": False,
            },
            {
                "option": "B",
                "label": "B — Fastest",
                "description": "Air freight uplift — premium spend vs penalty.",
                "eta": "+8 h",
                "cost": "$9,200",
                "slaPenalty": "$6,000",
                "approved": False,
            },
            {
                "option": "C",
                "label": "C — Balanced",
                "description": "Philly truck + Columbus hub relay — SLA-safe.",
                "eta": "+18 h",
                "cost": "$2,100",
                "slaPenalty": "$6,000",
                "approved": True,
            },
        ]
        risk_banner = (
            f"{risk_prefix}The port situation rules out the coastal plan. Option C’s cost "
            f"($2.1k) is still below the late fee we modeled — flying everything wasn’t worth it."
        )
    else:
        subtitle = f"For load {load_id} · {oid} to {did}"
        rows = [
            {
                "option": "A",
                "label": "A — Fastest",
                "description": "Air uplift + truck — minimizes ETA, highest premium.",
                "eta": "+14 h",
                "cost": "$4,800",
                "slaPenalty": "$4,000",
                "approved": False,
            },
            {
                "option": "B",
                "label": "B — Cheapest",
                "description": "Ground-only — lowest cost, misses SLA window.",
                "eta": "+38 h",
                "cost": "$640",
                "slaPenalty": "$4,000",
                "approved": False,
            },
            {
                "option": "C",
                "label": "C — Balanced",
                "description": "Hub relay via Columbus — best penalty vs premium tradeoff.",
                "eta": "+22 h",
                "cost": "$1,200",
                "slaPenalty": "$4,000",
                "approved": True,
            },
        ]
        risk_banner = (
            f"{risk_prefix}Option C keeps the extra cost ($1.2k) below the late fee we expect "
            f"(~$4k). The fastest air option was set aside unless you override as VIP."
        )

    out = {
        "shipment_id": load_id,
        "scenario": kind,
        "title": title,
        "subtitle": subtitle,
        "rows": rows,
        "riskBanner": risk_banner,
    }
    return json.dumps(out, indent=2)
