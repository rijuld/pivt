import { createHash } from "node:crypto";
import type { ActiveShipment } from "@/lib/shipments";

/** Stable hash of route-driving fields so we can detect duplicate driver notices. */
export function driverRouteFingerprint(ship: ActiveShipment): string {
  const payload = JSON.stringify({
    d: ship.dropOffsJson ?? null,
    r: ship.optimizingSelectedRoute ?? null,
    o: ship.optimizingRouteOptOut,
  });
  return createHash("sha256").update(payload).digest("hex");
}
