"use client";

import { useMemo } from "react";
import type { AgentKey } from "@/lib/agents";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { FlowAgentRunStatusPayload } from "@/lib/flow-agent-run-status";
import type { ActiveShipment } from "@/lib/shipments";
import { ResponseFlowCrmBoard } from "./ResponseFlowCrmBoard";

interface ResponseFlowChartProps {
  fleet: ActiveShipment[];
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
  weatherAttentionShipmentIds: string[];
  attentionFlowResolvedShipmentIds: string[];
  onAttentionFlowResolved?: (shipmentId: string) => void;
  onAgentRunStatusChange?: (status: FlowAgentRunStatusPayload | null) => void;
  onRegisterFlowAgentRunner?: (
    runner: ((shipmentId: string, agentKey: import("@/lib/agents").AgentKey) => Promise<void>) | null,
  ) => void;
}

export function ResponseFlowChart({
  fleet,
  phase,
  scenario,
  isRunning,
  weatherAttentionShipmentIds,
  attentionFlowResolvedShipmentIds,
  onAttentionFlowResolved,
  onAgentRunStatusChange,
  onRegisterFlowAgentRunner,
}: ResponseFlowChartProps) {
  const attentionKey = useMemo(
    () => [...weatherAttentionShipmentIds].sort().join(","),
    [weatherAttentionShipmentIds],
  );
  const boardKey = useMemo(
    () =>
      [...fleet]
        .map((s) => s.id)
        .sort()
        .join("|") +
      `-${phase}-${scenario}-${isRunning ? "1" : "0"}-${attentionKey}`,
    [fleet, phase, scenario, isRunning, attentionKey],
  );

  return (
    <ResponseFlowCrmBoard
      key={boardKey}
      fleet={fleet}
      phase={phase}
      scenario={scenario}
      isRunning={isRunning}
      weatherAttentionShipmentIds={weatherAttentionShipmentIds}
      attentionFlowResolvedShipmentIds={attentionFlowResolvedShipmentIds}
      onAttentionFlowResolved={onAttentionFlowResolved}
      onAgentRunStatusChange={onAgentRunStatusChange}
      onRegisterFlowAgentRunner={onRegisterFlowAgentRunner}
    />
  );
}
