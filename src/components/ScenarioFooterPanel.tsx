"use client";

import type { ScenarioKind } from "@/lib/constants";
import { sidebar } from "@/lib/ui-copy";

function slaRiskForScenario(scenario: ScenarioKind): number {
  if (scenario === "idle") return 0;
  if (scenario === "blizzard") return 4500;
  return 6000;
}

export interface ScenarioFooterPanelProps {
  scenario: ScenarioKind;
  /** Sidebar-selected shipment; drives KPI context. */
  shipmentId: string | null;
  className?: string;
}

export function ScenarioFooterPanel({
  scenario,
  shipmentId,
  className = "",
}: ScenarioFooterPanelProps) {
  const slaRisk = slaRiskForScenario(scenario);
  return (
    <div
      className={`shrink-0 border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 ${className}`}
    >
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div className="border border-[var(--border)] bg-[var(--surface-card)] px-2.5 py-1.5">
          <p className="leading-tight text-[var(--muted)]">{sidebar.estLateFee}</p>
          <p className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--foreground)]">
            {slaRisk > 0 ? `$${slaRisk.toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="border border-[var(--border)] bg-[var(--surface-card)] px-2.5 py-1.5">
          <p className="leading-tight text-[var(--muted)]">{sidebar.focusedLoad}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] font-semibold text-[var(--accent)]">
            {shipmentId ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
