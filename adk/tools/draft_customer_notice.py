"""Driver Pivt — localized customer update text for the selected resolution path."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def draft_customer_notice(
    shipment_id: str,
    scenario: str,
    selected_action: str,
) -> str:
    """Draft a proactive email-style notice for the end customer (empathetic, localized).

    Mirrors the app's ``resolutionForScenario`` / simulation copy, substituting the real load id.

    Args:
        shipment_id: Load id (replaces template placeholders).
        scenario: ``blizzard`` or ``port_strike`` (``idle`` → blizzard).
        selected_action: Short label, e.g. ``Reroute_via_Columbus_Hub`` or ``Philly_Truck_Columbus_Relay``.

    Returns:
        str: JSON with ``subject``, ``body``, and ``tone_notes``.
    """
    kind = (scenario or "blizzard").strip().lower()
    if kind == "idle":
        kind = "blizzard"

    sid = shipment_id.strip()

    if kind == "port_strike":
        body = (
            f"Subject: Important update — shipment {sid}\n\n"
            "A port labor action affected our original coastal plan. "
            "We’ve moved your freight inland through Philadelphia and Columbus "
            "to stay within your timeline. Refreshed tracking should appear within a few minutes."
        )
        subject = f"Important update — shipment {sid}"
    else:
        body = (
            f"Subject: Update on your shipment {sid}\n\n"
            "Because of severe weather on I-80 West, we’ve rerouted your medical shipment "
            "through our Columbus hub to protect your delivery window. The new ETA reflects "
            "the option our team believes balances speed and cost best — nothing else is needed "
            "from you right now."
        )
        subject = f"Update on your shipment {sid}"

    # Light company context if API is up
    company_name = ""
    try:
        r = requests.get(f"{_base_url()}/api/profile", timeout=15)
        if r.ok:
            data = r.json()
            prof = (data.get("profile") or {}) if isinstance(data, dict) else {}
            company_name = str(prof.get("companyName") or "").strip()
    except OSError:
        pass

    out: dict[str, Any] = {
        "shipment_id": sid,
        "scenario": kind,
        "selected_action": selected_action.strip(),
        "subject": subject,
        "body": body,
        "tone_notes": (
            "Empathetic, no blame, cite weather or port context; offer single clear next step. "
            + (f"Sign as {company_name} operations." if company_name else "Sign as operations team.")
        ),
    }
    return json.dumps(out, indent=2)
