import type { AgentKey } from "@/lib/agents";
import type { RouteOptionRow } from "@/lib/routeOptions";

/** Google-costed stop order candidate from Facility Pivt (serializable). */
export type FacilityStopPermutationRow = {
  name: string;
  stop_order: string[];
  distance_mi: number;
  duration_min: number;
  total_cost_usd: number;
  summary: string;
};

/** Shown in MainWorkspace for Response flow ``/api/agent-run`` — running and completed states. */
export type FlowAgentRunStatusPayload =
  | {
      status: "running";
      shipmentId: string;
      agentName: string;
      agentRole: string;
      /** Trimmed roster detail — what this Pivt is doing. */
      doingLine: string;
    }
  | {
      status: "done";
      shipmentId: string;
      agentName: string;
      agentRole: string;
      doingLine: string;
      /** API summary or error message (trimmed in the board). */
      summary: string;
      ok: boolean;
      /** "orchestrate" when the summary came from IBM watsonx, "local" when using fallback. */
      source?: "orchestrate" | "local";
      /** Roster column key for the agent that finished (when known). */
      rosterAgentKey?: AgentKey;
      /** Google-backed rows from Optimizing Pivt — used in Next steps modal for route commit. */
      routeChoice?: {
        rows: RouteOptionRow[];
        source: string;
        riskBanner: string;
      };
      /** From Facility Pivt ``facility_maps.stop_order_options`` — apply delivery order to the load. */
      facilityStopPermutations?: FacilityStopPermutationRow[];
      /** Label order when the agent ran (for default selection + “current” compare). */
      facilityCurrentStopOrderLabels?: string[];
      /** Coordinates for each stop at run time — used to build ``dropOffsJson`` on apply. */
      facilityDeliveryStopsSnapshot?: Array<{
        label: string;
        lat: number;
        lng: number;
      }>;
    };
