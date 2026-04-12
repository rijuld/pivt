import type { MapPhase, ScenarioKind } from "./constants";
import type { OrchestrateAgentId } from "./orchestrate-agents";

export type AgentKey =
  | "watchman"
  | "node_manager"
  | "negotiator"
  | "cfo"
  | "diplomat";

export type StatusVariant = "danger" | "warning" | "success" | "neutral" | "info";

export interface RosterAgent {
  key: AgentKey;
  initials: string;
  name: string;
  role: string;
  /** Longer description for the detail panel. */
  detail: string;
  accent: string;
}

export const ROSTER_AGENTS: RosterAgent[] = [
  {
    key: "watchman",
    initials: "RP",
    name: "Routing Pivt",
    role: "Early warning & route triggers",
    detail:
      "Routing Pivt is the system’s early warning layer. It continuously parses incoming JSON telemetry from every active shipment, watching for conditions that fall outside acceptable bounds — specifically a delay exceeding 120 minutes or a severe weather flag. When either condition is met, it halts the standard routing pipeline and fires an EXCEPTION_TRIGGER that kicks off the entire exception workflow downstream.",
    accent: "from-violet-500/30 to-purple-600/20",
  },
  {
    key: "node_manager",
    initials: "FP",
    name: "Facility Pivt",
    role: "Inventory & fulfilment brain",
    detail:
      "Facility Pivt is the inventory and fulfilment brain. When an exception lands, it immediately queries the warehouse database to answer one question: is there an identical item sitting in a facility that's closer to the customer than the current truck? If yes, it can short-circuit the problem with a fulfilment swap rather than a reroute. If no closer stock exists — as with SHP-1041 — it passes a reroute recommendation forward.",
    accent: "from-amber-500/25 to-orange-600/15",
  },
  {
    key: "negotiator",
    initials: "OP",
    name: "Optimizing Pivt",
    role: "Route options engine",
    detail:
      "Optimizing Pivt is the routing engine. It calls the external routing API and generates exactly three alternative route options for every exception: the fastest possible path, the cheapest possible path, and a balanced option that sits between the two. Each route is returned as an array of ETA delta and cost, giving the next agent clean data to evaluate.",
    accent: "from-sky-500/25 to-blue-600/15",
  },
  {
    key: "cfo",
    initials: "CP",
    name: "Cost Pivt",
    role: "Financial guardrail",
    detail:
      "Cost Pivt is the financial guardrail. It takes the route array from Optimizing Pivt and compares each option's cost against the contract SLA penalty for late delivery. Any route whose premium exceeds the penalty gets rejected — because it would cost more to fix the problem than to absorb the fine. The one exception is shipments flagged as VIP, which trigger an unconditional override that approves any route regardless of cost.",
    accent: "from-emerald-500/25 to-teal-600/15",
  },
  {
    key: "diplomat",
    initials: "DP",
    name: "Driver Pivt",
    role: "Driver & customer voice",
    detail:
      "Driver Pivt is the customer-facing voice of the whole pipeline. Once a route is approved and selected, it ingests the full exception context and composes a localised, empathetic message to the end customer explaining that the team has proactively rerouted their shipment. It handles tone, language, and personalisation — so the customer receives a human-sounding update rather than a system alert.",
    accent: "from-rose-500/25 to-pink-600/15",
  },
];

export function rosterStatus(
  key: AgentKey,
  phase: MapPhase,
  scenario: ScenarioKind,
  isRunning: boolean,
): { label: string; variant: StatusVariant } {
  if (scenario === "idle" && phase === "nominal") {
    return { label: "Ready", variant: "neutral" };
  }

  if (phase === "nominal" && isRunning) {
    return { label: "Listening", variant: "info" };
  }

  switch (key) {
    case "watchman":
      if (phase === "nominal") return { label: "Ready", variant: "neutral" };
      return { label: "Heads up", variant: "danger" };
    case "node_manager":
      if (phase === "threat" || (isRunning && phase === "nominal"))
        return { label: "Checking", variant: "warning" };
      if (phase === "thinking" || phase === "resolved")
        return { label: "Confirmed", variant: "success" };
      return { label: "Ready", variant: "neutral" };
    case "negotiator":
      if (phase === "thinking" || phase === "resolved")
        return { label: "3 options", variant: "success" };
      if (phase === "threat") return { label: "Waiting", variant: "warning" };
      return { label: "Ready", variant: "neutral" };
    case "cfo":
      if (phase === "resolved") return { label: "Approved", variant: "success" };
      if (phase === "thinking") return { label: "Reviewing", variant: "warning" };
      return { label: "Ready", variant: "neutral" };
    case "diplomat":
      if (phase === "resolved") return { label: "Sent", variant: "success" };
      if (phase === "thinking") return { label: "Writing", variant: "info" };
      return { label: "Ready", variant: "neutral" };
    default:
      return { label: "Ready", variant: "neutral" };
  }
}

/** Labels that mean the agent is idle / queued — hide on the flow CRM board. */
const NOT_WORKING_LABELS = new Set(["Ready", "Waiting"]);

/**
 * Whether this agent should show a status cell for the shipment grid (active work only).
 * "Listening" applies only to Routing Pivt (watchman); other agents stay blank while nominal.
 */
export function agentHasActiveWork(
  key: AgentKey,
  phase: MapPhase,
  scenario: ScenarioKind,
  isRunning: boolean,
): boolean {
  const { label } = rosterStatus(key, phase, scenario, isRunning);
  if (NOT_WORKING_LABELS.has(label)) return false;
  if (label === "Listening" && key !== "watchman") return false;
  return true;
}

/** ADK / watsonx Orchestrate agent id for API ``/api/agent-run`` (roster column → backend). */
const ROSTER_KEY_TO_ORCHESTRATE_ID: Record<
  AgentKey,
  Exclude<OrchestrateAgentId, "eis_orchestrator">
> = {
  watchman: "routing_pivt",
  node_manager: "facility_pivt",
  negotiator: "optimizing_pivt",
  cfo: "cost_pivt",
  diplomat: "driver_pivt",
};

export function orchestrateAgentIdForRosterKey(
  key: AgentKey,
): Exclude<OrchestrateAgentId, "eis_orchestrator"> {
  return ROSTER_KEY_TO_ORCHESTRATE_ID[key];
}
