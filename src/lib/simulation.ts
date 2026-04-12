import type { MapPhase, ScenarioKind } from "./constants";
import type { ActiveShipment } from "./shipments";
import { simulationWelcome } from "./ui-copy";

export type AgentId =
  | "watchman"
  | "node_manager"
  | "negotiator"
  | "diplomat"
  | "system";

export interface SimStep {
  id: string;
  agent: AgentId;
  title: string;
  body: string;
  timestamp: string;
  mapPhase?: MapPhase;
  delayMs: number;
}

export interface ResolutionOutput {
  consensusReached: boolean;
  selectedAction: string;
  financialImpact: {
    estimatedPenaltySaved: number;
    reroutePremium: number;
  };
  customerComms: string;
}

const AGENT_META: Record<
  AgentId,
  { emoji: string; label: string; color: string }
> = {
  watchman: { emoji: "📡", label: "Routing Pivt", color: "#a78bfa" },
  node_manager: { emoji: "🌐", label: "Facility Pivt", color: "#fbbf24" },
  negotiator: { emoji: "🗺️", label: "Optimizing Pivt", color: "#38bdf8" },
  diplomat: { emoji: "✉️", label: "Driver Pivt", color: "#fb7185" },
  system: { emoji: "⚙️", label: "Signal ingest", color: "#94a3b8" },
};

export function getAgentMeta(id: AgentId) {
  return AGENT_META[id];
}

export const BLIZZARD_STEPS: SimStep[] = [
  {
    id: "b1",
    agent: "system",
    title: "Telemetry ingest",
    body: 'weather_alert = "Blizzard Warning — I-80 West". delay_minutes projected > 120.',
    timestamp: "14:02:00",
    mapPhase: "threat",
    delayMs: 0,
  },
  {
    id: "b2",
    agent: "watchman",
    title: "Anomaly detected",
    body: "EXCEPTION_TRIGGER: Severe weather on contracted lane. Halting standard routing; escalating to swarm.",
    timestamp: "14:02:01",
    delayMs: 1200,
  },
  {
    id: "b3",
    agent: "node_manager",
    title: "Inventory probe",
    body: "Identical SKU at Columbus OH hub — 180 mi closer to consignee. Fulfilment window viable.",
    timestamp: "14:02:03",
    delayMs: 1800,
  },
  {
    id: "b4",
    agent: "negotiator",
    title: "Route matrix",
    body: "(A) Air uplift — ETA 14h, $4.8k. (B) Ground only — ETA 38h. (C) Hub relay via Columbus — ETA 22h, $1.2k.",
    timestamp: "14:02:05",
    mapPhase: "thinking",
    delayMs: 2500,
  },
  {
    id: "b5",
    agent: "negotiator",
    title: "Financial guardrail",
    body: "SLA penalty ≈ $4k. Rejecting Route A ($4.8k > penalty, not VIP). Approving Route C: $1.2k < $4k saved.",
    timestamp: "14:02:07",
    delayMs: 2000,
  },
  {
    id: "b6",
    agent: "diplomat",
    title: "Consensus reached",
    body: "Drafting proactive customer update: localized, empathetic, cites weather and hub reroute.",
    timestamp: "14:02:08",
    mapPhase: "resolved",
    delayMs: 1500,
  },
];

export const PORT_STRIKE_STEPS: SimStep[] = [
  {
    id: "p1",
    agent: "system",
    title: "Port feed",
    body: "Port of Newark labor action — container release delayed 36h on booked coastal leg.",
    timestamp: "14:02:00",
    mapPhase: "threat",
    delayMs: 0,
  },
  {
    id: "p2",
    agent: "watchman",
    title: "Exception",
    body: "EXCEPTION_TRIGGER: Port strike invalidates coastal plan. Evaluating inland alternatives.",
    timestamp: "14:02:01",
    delayMs: 1200,
  },
  {
    id: "p3",
    agent: "node_manager",
    title: "Stock reposition",
    body: "Philadelphia cross-dock partial stock; full match requires Chicago hub split shipment.",
    timestamp: "14:02:03",
    delayMs: 1800,
  },
  {
    id: "p4",
    agent: "negotiator",
    title: "Alternatives",
    body: "(A) Rail — cheapest, slow. (B) Air freight — fastest, costly. (C) Philly truck + Columbus hub — balanced.",
    timestamp: "14:02:05",
    mapPhase: "thinking",
    delayMs: 2500,
  },
  {
    id: "p5",
    agent: "negotiator",
    title: "Decision",
    body: "Contract penalty $6k if >24h late. Route C premium $2.1k — within guardrail. Rejecting pure air.",
    timestamp: "14:02:07",
    delayMs: 2000,
  },
  {
    id: "p6",
    agent: "diplomat",
    title: "Customer notice",
    body: "Localized notice: strike context, new inland path, revised ETA. No blame, clear next checkpoint.",
    timestamp: "14:02:08",
    mapPhase: "resolved",
    delayMs: 1500,
  },
];

export function resolutionForScenario(
  kind: ScenarioKind,
): ResolutionOutput | null {
  if (kind === "blizzard") {
    return {
      consensusReached: true,
      selectedAction: "Reroute_via_Columbus_Hub",
      financialImpact: {
        estimatedPenaltySaved: 4000,
        reroutePremium: 1200,
      },
      customerComms:
        "Subject: Update on your shipment NY-8472\n\nBecause of severe weather on I-80 West, we’ve rerouted your medical shipment through our Columbus hub to protect your delivery window. The new ETA reflects the option our team believes balances speed and cost best — nothing else is needed from you right now.",
    };
  }
  if (kind === "port_strike") {
    return {
      consensusReached: true,
      selectedAction: "Philly_Truck_Columbus_Relay",
      financialImpact: {
        estimatedPenaltySaved: 6000,
        reroutePremium: 2100,
      },
      customerComms:
        "Subject: Important update — shipment NY-8472\n\nA port labor action affected our original coastal plan. We’ve moved your freight inland through Philadelphia and Columbus to stay within your timeline. Refreshed tracking should appear within a few minutes.",
    };
  }
  return null;
}

/** Rewrite template copy so customer comms reference the focused load id. */
export function resolutionForShipment(
  kind: ScenarioKind,
  shipmentId: string,
): ResolutionOutput | null {
  const base = resolutionForScenario(kind);
  if (!base) return null;
  return resolutionWithShipmentId(base, shipmentId);
}

export function resolutionWithShipmentId(
  base: ResolutionOutput,
  shipmentId: string,
): ResolutionOutput {
  return {
    ...base,
    customerComms: base.customerComms.replace(/NY-8472/g, shipmentId),
  };
}

export function stepsForScenario(kind: ScenarioKind): SimStep[] {
  if (kind === "blizzard") return BLIZZARD_STEPS;
  if (kind === "port_strike") return PORT_STRIKE_STEPS;
  return [];
}

export function welcomeStepForShipment(ship: ActiveShipment): SimStep {
  const priority =
    ship.priority?.trim() || (ship.isPrimary ? "High" : "Standard");
  const oShort = ship.originLabel?.split(",")[0]?.trim() ?? ship.routeFrom;
  const dShort = ship.destLabel?.split(",")[0]?.trim() ?? ship.routeTo;
  const lane = `Lane ${oShort} → ${dShort}`;
  return {
    id: `welcome-${ship.id}`,
    agent: "system",
    title: simulationWelcome.title,
    body: simulationWelcome.body(ship.id, priority, lane),
    timestamp: "14:01:58",
    delayMs: 0,
  };
}
