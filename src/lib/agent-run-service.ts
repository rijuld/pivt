/**
 * Server-only: executes the same logical “agent” steps the ADK tools perform,
 * using SQLite + NWS + in-app route/CRM helpers (no external Orchestrate HTTP call).
 */
import type { ScenarioKind } from "@/lib/constants";
import { getDriverCrmForActiveShipment } from "@/lib/driver-crm";
import {
  getCompanyProfile,
  getScenarioSettings,
  listShips,
} from "@/lib/db/ships-db";
import { fetchNwsActiveAlerts, summarizeNwsAlert } from "@/lib/nws-alerts";
import { routeOptionsForScenario } from "@/lib/routeOptions";
import { resolutionForShipment } from "@/lib/simulation";
import {
  primaryShipment,
  type ActiveShipment,
} from "@/lib/shipments";
import { intersectRoutesWithAlertFeatures } from "@/lib/weather-route-intersection";
import type { OrchestrateAgentId } from "@/lib/orchestrate-agents";

export interface AgentRunResult {
  agentId: OrchestrateAgentId;
  displayName: string;
  ranAt: string;
  summary: string;
  details: Record<string, unknown>;
}

function effectiveRouteScenario(scenario: ScenarioKind): Exclude<ScenarioKind, "idle"> {
  return scenario === "idle" ? "blizzard" : scenario;
}

function pickShip(
  fleet: ActiveShipment[],
  shipmentId: string | null,
): ActiveShipment | null {
  if (shipmentId) {
    return fleet.find((s) => s.id === shipmentId) ?? null;
  }
  return primaryShipment(fleet);
}

function haversineKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function runFacilityCore(ship: ActiveShipment) {
  const olng = ship.originLng;
  const olat = ship.originLat;
  const dlng = ship.destLng;
  const dlat = ship.destLat;
  const hubLng = ship.hubLng;
  const hubLat = ship.hubLat;
  const hubLabel = ship.hubLabel ?? "Hub";

  if (hubLng == null || hubLat == null) {
    return {
      hub_viable: false,
      reason: "No hub coordinates on file for this load.",
      hub_label: hubLabel,
    };
  }

  const distOriginDest = haversineKm(olng, olat, dlng, dlat);
  const distHubDest = haversineKm(hubLng, hubLat, dlng, dlat);
  const closer = distHubDest < distOriginDest * 0.95;

  return {
    hub_viable: closer,
    hub_label: hubLabel,
    cargo: ship.cargo ?? "—",
    dist_origin_to_dest_km: Math.round(distOriginDest * 10) / 10,
    dist_hub_to_dest_km: Math.round(distHubDest * 10) / 10,
    narrative: closer
      ? `Hub “${hubLabel}” is closer to consignee than full lane span — swap may apply.`
      : "Hub not clearly closer — prefer reroute evaluation over swap.",
  };
}

function runCostCore(
  ship: ActiveShipment,
  kind: "blizzard" | "port_strike",
): Record<string, unknown> {
  const priority = (ship.priority ?? "").toUpperCase();
  const vip = priority.includes("VIP");
  if (kind === "port_strike") {
    const rows = [
      { option: "A", premium: 890, penalty: 6000 },
      { option: "B", premium: 9200, penalty: 6000 },
      { option: "C", premium: 2100, penalty: 6000 },
    ];
    const fastest = "B";
    const balanced = "C";
    const recommended = vip ? fastest : balanced;
    return {
      scenario: kind,
      vip,
      recommended_option: recommended,
      decisions: rows.map((r) => ({
        ...r,
        status: vip
          ? "approved_vip_override"
          : r.premium <= r.penalty
            ? "approved"
            : "rejected_over_penalty",
      })),
      narrative:
        "Contract penalty ~$6k; Route C premium $2.1k within guardrail unless VIP chooses fastest (B).",
    };
  }
  const rows = [
    { option: "A", premium: 4800, penalty: 4000 },
    { option: "B", premium: 640, penalty: 4000 },
    { option: "C", premium: 1200, penalty: 4000 },
  ];
  const fastest = "A";
  const balanced = "C";
  const recommended = vip ? fastest : balanced;
  return {
    scenario: kind,
    vip,
    recommended_option: recommended,
    decisions: rows.map((r) => ({
      ...r,
      status: vip
        ? "approved_vip_override"
        : r.premium <= r.penalty
          ? "approved"
          : "rejected_over_penalty",
    })),
    narrative:
      "SLA ~$4k; standard loads favor balanced Route C; VIP may take fastest (A).",
  };
}

export async function runAgentJob(input: {
  agentId: OrchestrateAgentId;
  shipmentId: string | null;
  scenario: ScenarioKind;
}): Promise<AgentRunResult> {
  const { agentId, shipmentId, scenario } = input;
  const fleet = listShips();
  const ship = pickShip(fleet, shipmentId);
  const routeKind = effectiveRouteScenario(scenario);
  const meta = {
    ranAt: new Date().toISOString(),
    focusedShipmentId: ship?.id ?? null,
    scenario,
    routeScenario: routeKind,
  };

  switch (agentId) {
    case "routing_pivt": {
      const collection = await fetchNwsActiveAlerts();
      const { hits: allHits, totalFeatures } = intersectRoutesWithAlertFeatures(
        fleet,
        collection,
        summarizeNwsAlert,
      );
      const target = ship ?? primaryShipment(fleet);
      const relevant = target
        ? allHits.filter((h) => h.shipmentId === target.id)
        : allHits;
      const eventCount = relevant.reduce(
        (n, h) => n + (h.events?.length ?? 0),
        0,
      );
      const trigger = eventCount > 0;
      const summary = trigger
        ? `EXCEPTION_TRIGGER likely — ${eventCount} alert intersection event(s) on focused corridor scope.`
        : "No NWS alert intersection on the modeled scope for this check.";
      return {
        agentId,
        displayName: "Routing Pivt",
        ranAt: meta.ranAt,
        summary,
        details: {
          ...meta,
          totalNwsFeatures: totalFeatures,
          exception_trigger: trigger,
          weather_event_count: eventCount,
          sample_hits: relevant.slice(0, 5),
        },
      };
    }

    case "facility_pivt": {
      if (!ship) {
        return {
          agentId,
          displayName: "Facility Pivt",
          ranAt: meta.ranAt,
          summary: "No shipment selected — choose a load in the sidebar.",
          details: { ...meta, error: "no_shipment" },
        };
      }
      const core = runFacilityCore(ship);
      return {
        agentId,
        displayName: "Facility Pivt",
        ranAt: meta.ranAt,
        summary:
          typeof core.narrative === "string"
            ? core.narrative
            : JSON.stringify(core),
        details: { ...meta, facility: core, shipmentId: ship.id },
      };
    }

    case "optimizing_pivt": {
      const primary = primaryShipment(fleet);
      const bundle = routeOptionsForScenario(routeKind, 0, primary);
      return {
        agentId,
        displayName: "Optimizing Pivt",
        ranAt: meta.ranAt,
        summary: `${bundle.title} — ${bundle.subtitle}. Balanced track: ${bundle.rows.find((r) => r.approved)?.label ?? "—"}.`,
        details: {
          ...meta,
          bundle,
        },
      };
    }

    case "cost_pivt": {
      const primary = primaryShipment(fleet);
      const focus = primary ?? ship ?? fleet[0] ?? null;
      if (!focus) {
        return {
          agentId,
          displayName: "Cost Pivt",
          ranAt: meta.ranAt,
          summary: "No loads in the fleet — add a load to evaluate financials.",
          details: { ...meta, error: "empty_fleet" },
        };
      }
      const cost = runCostCore(
        focus,
        routeKind === "port_strike" ? "port_strike" : "blizzard",
      );
      return {
        agentId,
        displayName: "Cost Pivt",
        ranAt: meta.ranAt,
        summary: `Recommended option ${String(cost.recommended_option)} — ${String(cost.narrative)}`,
        details: { ...meta, financial: cost, shipmentId: focus.id },
      };
    }

    case "driver_pivt": {
      if (!ship) {
        return {
          agentId,
          displayName: "Driver Pivt",
          ranAt: meta.ranAt,
          summary: "No shipment selected — choose a load in the sidebar.",
          details: { ...meta, error: "no_shipment" },
        };
      }
      const crm = getDriverCrmForActiveShipment(ship);
      const res =
        scenario === "idle"
          ? null
          : resolutionForShipment(scenario, ship.id);
      const profile = getCompanyProfile();
      return {
        agentId,
        displayName: "Driver Pivt",
        ranAt: meta.ranAt,
        summary: res
          ? `Draft notice ready for ${ship.id} (${scenario}). Contacts: ${crm.driver.name}, ${crm.dispatcher.name}.`
          : `CRM loaded for ${ship.id}. Pick a non-idle scenario in the footer to draft a resolution notice.`,
        details: {
          ...meta,
          crm,
          resolutionDraft: res,
          company: profile.companyName,
        },
      };
    }

    case "eis_orchestrator": {
      const steps: AgentRunResult[] = [];
      const r1 = await runAgentJob({
        agentId: "routing_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r1);
      const r2 = await runAgentJob({
        agentId: "facility_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r2);
      const r3 = await runAgentJob({
        agentId: "optimizing_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r3);
      const r4 = await runAgentJob({
        agentId: "cost_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r4);
      const r5 = await runAgentJob({
        agentId: "driver_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r5);

      const scenarioSettings = getScenarioSettings();
      return {
        agentId,
        displayName: "EIS Orchestrator",
        ranAt: meta.ranAt,
        summary: `Pipeline complete: ${steps.map((s) => s.displayName).join(" → ")}. Open each card above to inspect step output.`,
        details: {
          ...meta,
          portStrikeEpicenter: scenarioSettings.portStrikeEpicenter,
          pipeline: steps.map((s) => ({
            id: s.agentId,
            summary: s.summary,
            details: s.details,
          })),
        },
      };
    }

    default: {
      const _exhaustive: never = agentId;
      return _exhaustive;
    }
  }
}
