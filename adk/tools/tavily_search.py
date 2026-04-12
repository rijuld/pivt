"""Web search via Tavily API — same behavior as ``mcp/tavily-web-search`` (Bearer auth)."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from ibm_watsonx_orchestrate.agent_builder.tools import tool

TAVILY_URL = "https://api.tavily.com/search"


@tool()
def tavily_search(
    query: str,
    search_depth: str = "advanced",
    max_results: int = 8,
) -> str:
    """Search the public web with Tavily (summarized results + sources).

    Use for current events, industry or lane context. Do not use as a substitute for
    NOAA/NWS or the War Room ``/api/weather-events`` / ``/api/ships`` data.

    Requires ``TAVILY_API_KEY`` in the tool runtime environment (or watsonx Connection).

    Args:
        query: Natural-language search query.
        search_depth: ``basic`` or ``advanced`` (Tavily parameter).
        max_results: Cap on items (1–20).

    Returns:
        str: JSON string with Tavily response or an error object.
    """
    key = (os.environ.get("TAVILY_API_KEY") or "").strip()
    if not key:
        return json.dumps(
            {
                "ok": False,
                "error": "TAVILY_API_KEY is not set in the environment.",
            },
            indent=2,
        )

    depth = search_depth if search_depth in ("basic", "advanced") else "advanced"
    body: dict[str, Any] = {
        "query": query.strip(),
        "search_depth": depth,
        "max_results": max(1, min(max_results, 20)),
    }

    try:
        r = requests.post(
            TAVILY_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            json=body,
            timeout=60,
        )
        text = r.text
        if not r.ok:
            return json.dumps(
                {"ok": False, "status": r.status_code, "body": text[:2000]},
                indent=2,
            )
        try:
            data = r.json()
            if isinstance(data, dict):
                out = {"ok": True, **data}
            else:
                out = {"ok": True, "result": data}
            return json.dumps(out, indent=2)
        except ValueError:
            return json.dumps({"ok": True, "raw": text}, indent=2)
    except requests.RequestException as e:
        return json.dumps({"ok": False, "error": str(e)}, indent=2)
