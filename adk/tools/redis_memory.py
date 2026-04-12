"""Redis agent memory — same key layout as ``mcp/redis-agent-memory`` (stdio MCP server)."""

from __future__ import annotations

import json
import os
import re
import redis
from ibm_watsonx_orchestrate.agent_builder.tools import tool

_client: redis.Redis | None = None


def _r() -> redis.Redis:
    global _client
    if _client is None:
        url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379").strip()
        _client = redis.Redis.from_url(url, decode_responses=True)
    return _client


def _ns() -> str:
    return (os.environ.get("MEMORY_NAMESPACE") or "eis").strip() or "eis"


def _sanitize(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", s)[:200]


def _memory_key(namespace: str, agent_id: str, session_id: str, key: str) -> str:
    sess = session_id.strip() if session_id else "global"
    return f"{_sanitize(namespace)}:agent:{_sanitize(agent_id)}:{_sanitize(sess)}:{_sanitize(key)}"


def _pattern_agent(namespace: str, agent_id: str) -> str:
    return f"{_sanitize(namespace)}:agent:{_sanitize(agent_id)}:*"


@tool()
def redis_memory_get(agent_id: str, key: str, session_id: str | None = None) -> str:
    """Read UTF-8 agent memory from Redis (shared with MCP server key layout).

    Args:
        agent_id: Pivt agent id, e.g. routing_pivt, eis_orchestrator.
        key: Logical key (e.g. last_resolution).
        session_id: Thread scope; omit or use "global" for default.

    Returns:
        str: JSON with redis_key, value (or null).
    """
    k = _memory_key(_ns(), agent_id, session_id or "global", key)
    v = _r().get(k)
    return json.dumps({"ok": True, "redis_key": k, "value": v}, indent=2)


@tool()
def redis_memory_set(
    agent_id: str,
    key: str,
    value: str,
    session_id: str | None = None,
    ttl_seconds: int | None = None,
) -> str:
    """Write agent memory to Redis.

    Args:
        agent_id: Pivt agent id.
        key: Logical key.
        value: String payload (often JSON).
        session_id: Thread scope.
        ttl_seconds: Optional expiry.

    Returns:
        str: JSON confirmation with redis_key.
    """
    k = _memory_key(_ns(), agent_id, session_id or "global", key)
    r = _r()
    if ttl_seconds is not None and ttl_seconds > 0:
        r.setex(k, ttl_seconds, value)
    else:
        r.set(k, value)
    return json.dumps({"ok": True, "redis_key": k}, indent=2)


@tool()
def redis_memory_delete(agent_id: str, key: str, session_id: str | None = None) -> str:
    """Delete one agent memory key."""
    k = _memory_key(_ns(), agent_id, session_id or "global", key)
    n = _r().delete(k)
    return json.dumps({"ok": True, "redis_key": k, "deleted": n}, indent=2)


@tool()
def redis_memory_list_keys(agent_id: str, limit: int = 100) -> str:
    """Scan keys for an agent (all sessions), up to limit."""
    pat = _pattern_agent(_ns(), agent_id)
    r = _r()
    keys: list[str] = []
    for k in r.scan_iter(match=pat, count=50):
        keys.append(k)
        if len(keys) >= min(limit, 500):
            break
    return json.dumps({"ok": True, "pattern": pat, "keys": keys}, indent=2)


@tool()
def redis_memory_append_event(
    agent_id: str,
    stream_key: str,
    event_json: str,
    session_id: str | None = None,
    max_len: int = 50,
) -> str:
    """Push JSON event to a capped list (LPUSH + LTRIM), same as MCP memory_append_event."""
    lk = _memory_key(_ns(), agent_id, session_id or "global", f"list:{stream_key}")
    r = _r()
    r.lpush(lk, event_json)
    r.ltrim(lk, 0, max(1, min(max_len, 1000)) - 1)
    return json.dumps({"ok": True, "redis_key": lk, "max_len": max_len}, indent=2)


@tool()
def redis_memory_list_events(
    agent_id: str,
    stream_key: str,
    session_id: str | None = None,
    count: int = 20,
) -> str:
    """Read recent events from the capped list."""
    lk = _memory_key(_ns(), agent_id, session_id or "global", f"list:{stream_key}")
    items = _r().lrange(lk, 0, max(1, min(count, 200)) - 1)
    return json.dumps({"ok": True, "redis_key": lk, "events": items}, indent=2)
