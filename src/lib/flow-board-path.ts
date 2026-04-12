import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { ActiveShipment } from "@/lib/shipments";
import { loadStatusLabel, main } from "@/lib/ui-copy";

export type FlowBoardPathOptions = {
  /** True when this shipment’s route intersects an NWS alert (same computation as Weather events). */
  routeIntersectsNwsAlert?: boolean;
};

/**
 * Labels for the Response flow CRM “Path status” column: corridor / scenario path
 * plus the load’s operational status from SQLite. Weather intersection takes precedence.
 */
export function flowBoardPathStatus(
  ship: ActiveShipment,
  phase: MapPhase,
  scenario: ScenarioKind,
  options?: FlowBoardPathOptions,
): { pathLine: string; loadLine: string } {
  if (options?.routeIntersectsNwsAlert) {
    return {
      pathLine: main.flowBoardPathWeatherIntersect,
      loadLine: main.flowBoardPathAttentionNeeded,
    };
  }

  const loadLine = loadStatusLabel[ship.status];

  if (scenario === "idle") {
    return { pathLine: "Standard path", loadLine };
  }

  if (scenario === "blizzard") {
    if (phase === "resolved") {
      return { pathLine: "Recovery / detour locked", loadLine };
    }
    if (phase === "nominal") {
      return { pathLine: "Blizzard watch", loadLine };
    }
    return { pathLine: "Weather reroute in play", loadLine };
  }

  if (scenario === "port_strike") {
    if (phase === "resolved") {
      return { pathLine: "Alternate gateway locked", loadLine };
    }
    if (phase === "nominal") {
      return { pathLine: "Port lane nominal", loadLine };
    }
    return { pathLine: "Port contingency path", loadLine };
  }

  return { pathLine: "—", loadLine };
}
