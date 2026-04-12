"""Company profile — calls the EIS War Room Next.js API."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


@tool()
def get_company_profile() -> str:
    """Load the demo company profile (name, HQ, contact) used for customer-facing copy.

    Returns:
        str: JSON string with a ``profile`` object.
    """
    url = f"{_base_url()}/api/profile"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return json.dumps(data, indent=2)
