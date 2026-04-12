import type { ScenarioKind } from "@/lib/constants";
import type { ActiveShipment } from "@/lib/shipments";

/** When Google option polylines are unavailable, map uses these driving modes. */
export type FallbackRouteMode =
  | "direct"
  | "via_hub"
  | "via_alt"
  | "avoid_highways";

/**
 * Map static Optimizing letters (from ``routeOptions.ts`` when Google fails) to a
 * driving visualization. ``idle`` uses the same letter semantics as blizzard.
 */
export function staticLetterToFallbackRouteMode(
  scenario: ScenarioKind,
  letter: string,
  ship: ActiveShipment,
): FallbackRouteMode {
  const L = letter.trim().toUpperCase().slice(0, 1) || "C";
  const eff: ScenarioKind = scenario === "idle" ? "blizzard" : scenario;

  if (eff === "port_strike") {
    if (L === "C") {
      if (ship.altWaypointLat != null && ship.altWaypointLng != null) {
        return "via_alt";
      }
      if (ship.hubLat != null && ship.hubLng != null) return "via_hub";
    }
    return "direct";
  }

  if (L === "C" && ship.hubLat != null && ship.hubLng != null) return "via_hub";
  if (L === "B") return "avoid_highways";
  return "direct";
}
