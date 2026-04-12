import {
  getDriverRouteNoticeAck,
  setDriverRouteNoticeAck,
  type DriverRouteNoticeAck,
} from "@/lib/db/ships-db";
import {
  redisMirrorDriverRouteAck,
  redisReadDriverRouteAck,
} from "@/lib/redis-driver-memory";

/**
 * Prefer SQLite (UI / API); fall back to Redis for cross-process memory (e.g. MCP agent-memory).
 */
export async function getDriverRouteAckMemory(
  shipId: string,
): Promise<DriverRouteNoticeAck | null> {
  const local = getDriverRouteNoticeAck(shipId);
  if (local) return local;
  return redisReadDriverRouteAck(shipId);
}

export async function recordDriverRouteNoticeAck(
  shipId: string,
  fingerprint: string,
): Promise<DriverRouteNoticeAck> {
  const row = setDriverRouteNoticeAck(shipId, fingerprint);
  await redisMirrorDriverRouteAck(shipId, row.fingerprint, row.acknowledgedAt);
  return row;
}
