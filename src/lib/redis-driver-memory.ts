/**
 * Optional Redis mirror for driver route-ack state (works with Agent Memory / multi-process setups).
 * When ``REDIS_URL`` is unset, all operations are no-ops; SQLite remains the source of truth.
 */
import Redis from "ioredis";

let client: Redis | null | undefined;

function getClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (client === undefined) {
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
    } catch {
      client = null;
    }
  }
  return client;
}

const PREFIX = "eis:driver_route_ack:";

export async function redisMirrorDriverRouteAck(
  shipId: string,
  fingerprint: string,
  acknowledgedAtIso: string,
): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    await r.set(
      `${PREFIX}${shipId}`,
      JSON.stringify({ fingerprint, acknowledgedAt: acknowledgedAtIso }),
      "EX",
      60 * 60 * 24 * 120,
    );
  } catch {
    /* ignore — SQLite still authoritative */
  }
}

export async function redisReadDriverRouteAck(shipId: string): Promise<{
  fingerprint: string;
  acknowledgedAt: string;
} | null> {
  const r = getClient();
  if (!r) return null;
  try {
    const raw = await r.get(`${PREFIX}${shipId}`);
    if (!raw) return null;
    const o = JSON.parse(raw) as { fingerprint?: string; acknowledgedAt?: string };
    if (typeof o.fingerprint !== "string") return null;
    return {
      fingerprint: o.fingerprint,
      acknowledgedAt:
        typeof o.acknowledgedAt === "string" ? o.acknowledgedAt : "",
    };
  } catch {
    return null;
  }
}
