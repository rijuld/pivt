"""Cost Pivt guardrails — compare route premiums to modeled SLA penalties."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def evaluate_route_financials(shipment_id: str, scenario: str) -> str:
    """Reject options whose premium exceeds the modeled SLA penalty unless VIP priority.

    Uses the same option matrix as ``generate_route_options`` and shipment ``priority``.

    Args:
        shipment_id: Load id.
        scenario: ``blizzard``, ``port_strike``, or ``idle`` (idle → blizzard).

    Returns:
        str: JSON with per-row decisions and the recommended option letter.
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

    priority = (str(ship.get("priority") or "")).upper()
    vip = "VIP" in priority

    if kind == "port_strike":
        # (option, premium, modeled_penalty)
        rows = [
            ("A", 890, 6000),
            ("B", 9200, 6000),
            ("C", 2100, 6000),
        ]
        fastest = "B"
        balanced = "C"
        narrative = (
            "Contract penalty ~$6k if >24h late. Route C premium $2.1k — within guardrail; "
            "pure air (B) is costly but allowed under VIP."
        )
    else:
        rows = [
            ("A", 4800, 4000),
            ("B", 640, 4000),
            ("C", 1200, 4000),
        ]
        fastest = "A"
        balanced = "C"
        narrative = (
            "SLA penalty ≈ $4k. Rejecting Route A ($4.8k > penalty) for standard loads; "
            "approving balanced Route C ($1.2k < $4k)."
        )

    decisions: list[dict[str, Any]] = []
    for opt, cost, penalty in rows:
        if vip:
            status = "approved_vip_override"
        elif cost <= penalty:
            status = "approved"
        else:
            status = "rejected_over_penalty"
        decisions.append(
            {
                "option": opt,
                "premium_usd": cost,
                "modeled_penalty_usd": penalty,
                "status": status,
            }
        )

    if vip:
        recommended = fastest
    else:
        recommended = balanced

    out = {
        "shipment_id": sid,
        "scenario": kind,
        "vip": vip,
        "decisions": decisions,
        "recommended_option": recommended,
        "narrative": narrative,
    }
    return json.dumps(out, indent=2)
