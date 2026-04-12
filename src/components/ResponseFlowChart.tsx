"use client";

import { useMemo } from "react";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { ActiveShipment } from "@/lib/shipments";
import { ResponseFlowCrmBoard } from "./ResponseFlowCrmBoard";

interface ResponseFlowChartProps {
  fleet: ActiveShipment[];
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
}

export function ResponseFlowChart({
  fleet,
  phase,
  scenario,
  isRunning,
}: ResponseFlowChartProps) {
  const boardKey = useMemo(
    () =>
      [...fleet]
        .map((s) => s.id)
        .sort()
        .join("|") +
      `-${phase}-${scenario}-${isRunning ? "1" : "0"}`,
    [fleet, phase, scenario, isRunning],
  );

  return (
    <ResponseFlowCrmBoard
      key={boardKey}
      fleet={fleet}
      phase={phase}
      scenario={scenario}
      isRunning={isRunning}
    />
  );
}
