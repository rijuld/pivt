/**
 * IBM watsonx Orchestrate ADK agent ids — aligned with ``adk/agents/*.yaml`` names.
 */
export type OrchestrateAgentId =
  | "routing_pivt"
  | "facility_pivt"
  | "optimizing_pivt"
  | "driver_pivt"
  | "disaster_management_pivt"
  | "eis_orchestrator";

export interface OrchestrateAgentMeta {
  id: OrchestrateAgentId;
  /** Matches ``ROSTER_AGENTS`` / simulation roles */
  displayName: string;
  role: string;
  accent: string;
  /** What the Run action exercises in the War Room */
  runBlurb: string;
}

export const ORCHESTRATE_AGENTS: OrchestrateAgentMeta[] = [
  {
    id: "routing_pivt",
    displayName: "Routing Pivt",
    role: "Early warning & route triggers",
    accent: "from-violet-500/30 to-purple-600/20",
    runBlurb: "Fleet + NWS intersection — EXCEPTION_TRIGGER summary",
  },
  {
    id: "facility_pivt",
    displayName: "Facility Pivt",
    role: "Inventory & fulfilment brain",
    accent: "from-amber-500/25 to-orange-600/15",
    runBlurb: "Hub vs destination proximity / swap viability",
  },
  {
    id: "optimizing_pivt",
    displayName: "Optimizing Pivt",
    role: "Route options & financial guardrail",
    accent: "from-sky-500/25 to-blue-600/15",
    runBlurb: "Route bundle plus SLA penalty vs premiums",
  },
  {
    id: "driver_pivt",
    displayName: "Driver Pivt",
    role: "Driver & customer voice",
    accent: "from-rose-500/25 to-pink-600/15",
    runBlurb: "CRM contacts + customer notice draft",
  },
  {
    id: "disaster_management_pivt",
    displayName: "Disaster Management Pivt",
    role: "EM & continuity overlay",
    accent: "from-red-500/20 to-orange-600/15",
    runBlurb: "ICS-style staging, continuity, escalation framing",
  },
  {
    id: "eis_orchestrator",
    displayName: "EIS Orchestrator",
    role: "Full exception pipeline",
    accent: "from-slate-500/30 to-zinc-600/20",
    runBlurb: "Runs all steps in order with one report",
  },
];

export function isOrchestrateAgentId(s: string): s is OrchestrateAgentId {
  return ORCHESTRATE_AGENTS.some((a) => a.id === s);
}
