"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { AgentKey, RosterAgent } from "@/lib/agents";
import {
  ROSTER_AGENTS,
  agentHasActiveWork,
  orchestrateAgentIdForRosterKey,
  rosterStatus,
} from "@/lib/agents";
import type { ActiveShipment } from "@/lib/shipments";
import { formatShipmentRoute } from "@/lib/shipments";
import { main } from "@/lib/ui-copy";
import { AgentDetailModal } from "./AgentDetailModal";

type CellGrid = Record<string, Record<AgentKey, string>>;

const DND_MIME = "application/x-eis-flow-cell";

function buildCellGrid(
  fleet: ActiveShipment[],
  phase: MapPhase,
  scenario: ScenarioKind,
  isRunning: boolean,
): CellGrid {
  const grid: CellGrid = {};
  for (const ship of fleet) {
    const row: Record<AgentKey, string> = {} as Record<AgentKey, string>;
    for (const agent of ROSTER_AGENTS) {
      const st = rosterStatus(agent.key, phase, scenario, isRunning);
      const star = ship.isPrimary ? "★ " : "";
      row[agent.key] = agentHasActiveWork(
        agent.key,
        phase,
        scenario,
        isRunning,
      )
        ? `${star}${ship.id} · ${st.label}`
        : "";
    }
    grid[ship.id] = row;
  }
  return grid;
}

interface ResponseFlowCrmBoardProps {
  fleet: ActiveShipment[];
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
}

export function ResponseFlowCrmBoard({
  fleet,
  phase,
  scenario,
  isRunning,
}: ResponseFlowCrmBoardProps) {
  const [cells, setCells] = useState<CellGrid>(() =>
    buildCellGrid(fleet, phase, scenario, isRunning),
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, shipmentId: string, agentKey: AgentKey) => {
      e.dataTransfer.setData(
        DND_MIME,
        JSON.stringify({ shipmentId, agentKey } satisfies {
          shipmentId: string;
          agentKey: AgentKey;
        }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hoverTip, setHoverTip] = useState<{
    agent: RosterAgent;
    left: number;
    top: number;
  } | null>(null);

  const [detailAgent, setDetailAgent] = useState<RosterAgent | null>(null);

  /** `${shipmentId}:${agentKey}` → last run result for compact display */
  const [runFeedback, setRunFeedback] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});
  const [loadingCellKey, setLoadingCellKey] = useState<string | null>(null);

  const cancelHideTip = useCallback(() => {
    if (hideTipTimer.current !== null) {
      clearTimeout(hideTipTimer.current);
      hideTipTimer.current = null;
    }
  }, []);

  const scheduleHideTip = useCallback(() => {
    cancelHideTip();
    hideTipTimer.current = setTimeout(() => {
      setHoverTip(null);
      hideTipTimer.current = null;
    }, 220);
  }, [cancelHideTip]);

  const showAgentTip = useCallback(
    (agent: RosterAgent, el: HTMLElement) => {
      cancelHideTip();
      const r = el.getBoundingClientRect();
      setHoverTip({
        agent,
        left: r.left + r.width / 2,
        top: r.bottom + 8,
      });
    },
    [cancelHideTip],
  );

  useEffect(() => {
    return () => {
      if (hideTipTimer.current !== null) clearTimeout(hideTipTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hoverTip) return;
    const el = scrollRef.current;
    const hide = () => setHoverTip(null);
    el?.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => {
      el?.removeEventListener("scroll", hide);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, [hoverTip]);

  const runAgentForCell = useCallback(
    async (shipmentId: string, agentKey: AgentKey) => {
      const cellKey = `${shipmentId}:${agentKey}`;
      setLoadingCellKey(cellKey);
      setRunFeedback((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
      try {
        const res = await fetch("/api/agent-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: orchestrateAgentIdForRosterKey(agentKey),
            shipmentId,
            scenario,
          }),
        });
        const data = (await res.json()) as {
          summary?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Request failed",
          );
        }
        const raw = data.summary?.trim() ?? "Done";
        const text =
          raw.length > 140 ? `${raw.slice(0, 137).trim()}…` : raw;
        setRunFeedback((prev) => ({
          ...prev,
          [cellKey]: { ok: true, text },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Run failed";
        setRunFeedback((prev) => ({
          ...prev,
          [cellKey]: { ok: false, text: msg },
        }));
      } finally {
        setLoadingCellKey(null);
      }
    },
    [scenario],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, toShipmentId: string, toAgentKey: AgentKey) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(DND_MIME);
      if (!raw) return;
      let from: { shipmentId: string; agentKey: AgentKey };
      try {
        from = JSON.parse(raw) as { shipmentId: string; agentKey: AgentKey };
      } catch {
        return;
      }
      if (from.shipmentId === toShipmentId && from.agentKey === toAgentKey) {
        return;
      }
      setCells((prev) => {
        const a = prev[from.shipmentId]?.[from.agentKey] ?? "";
        const b = prev[toShipmentId]?.[toAgentKey] ?? "";
        if (
          prev[from.shipmentId] === undefined ||
          prev[toShipmentId] === undefined
        ) {
          return prev;
        }
        return {
          ...prev,
          [from.shipmentId]: {
            ...prev[from.shipmentId],
            [from.agentKey]: b,
          },
          [toShipmentId]: {
            ...prev[toShipmentId],
            [toAgentKey]: a,
          },
        };
      });
    },
    [],
  );

  if (fleet.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        No shipments loaded — add loads from the sidebar or refresh the fleet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-[13px] font-semibold uppercase tracking-tight text-[var(--foreground)]">
          {main.flowBoardTitle}
        </h4>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted)]">
          {main.flowBoardHint}
        </p>
      </div>

      <div
        ref={scrollRef}
        className="thin-scrollbar overflow-x-auto border border-[var(--border)] bg-[var(--surface)]"
      >
        <table className="w-full min-w-[640px] border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-card)]">
              <th className="sticky left-0 z-10 min-w-[120px] border-r border-[var(--border)] bg-[var(--surface-card)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Shipment
              </th>
              {ROSTER_AGENTS.map((a) => (
                <th
                  key={a.key}
                  scope="col"
                  tabIndex={0}
                  className="min-w-[108px] cursor-pointer px-1.5 py-2 align-top font-semibold text-[var(--foreground)] outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  onMouseEnter={(e) => showAgentTip(a, e.currentTarget)}
                  onMouseLeave={scheduleHideTip}
                  onClick={() => {
                    cancelHideTip();
                    setHoverTip(null);
                    setDetailAgent(a);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailAgent(a);
                    }
                  }}
                >
                  <span className="block w-fit max-w-[104px] border-b border-dotted border-[var(--muted)]/45 pb-0.5 text-[10px] leading-tight">
                    {a.name}
                  </span>
                  <span className="mt-0.5 block text-[8px] font-normal leading-tight text-[var(--muted)]">
                    {a.role}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fleet.map((ship) => (
              <tr
                key={ship.id}
                className="border-b border-[var(--border)]/80 last:border-0"
              >
                <td className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 align-top">
                  <p className="font-mono text-[11px] font-semibold text-[var(--foreground)]">
                    {ship.id}
                  </p>
                  <p className="text-[9px] leading-tight text-[var(--muted)]">
                    {formatShipmentRoute(ship)}
                  </p>
                </td>
                {ROSTER_AGENTS.map((a) => {
                  const value = cells[ship.id]?.[a.key] ?? "";
                  const hasValue = value.trim().length > 0;
                  const cellKey = `${ship.id}:${a.key}`;
                  const feedback = runFeedback[cellKey];
                  const loading = loadingCellKey === cellKey;
                  return (
                    <td key={a.key} className="px-1 py-1 align-top">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={(e) =>
                            handleDragStart(e, ship.id, a.key)
                          }
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, ship.id, a.key)}
                          className={`min-h-[2.5rem] border px-1.5 py-1 text-[9px] leading-snug shadow-sm transition active:cursor-grabbing ${
                            hasValue
                              ? "cursor-grab border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] hover:border-[var(--accent)]/35"
                              : "cursor-default border-dashed border-[var(--border)]/70 bg-[var(--surface)]/40 text-[var(--muted)] hover:border-[var(--accent)]/25"
                          }`}
                        >
                          {hasValue ? (
                            value
                          ) : (
                            <span className="select-none text-[9px] text-[var(--text-tertiary)]">
                              —
                            </span>
                          )}
                        </div>
                        {feedback ? (
                          <p
                            className={`select-none text-[8px] leading-snug ${
                              feedback.ok
                                ? "text-emerald-400/90"
                                : "text-rose-300/90"
                            }`}
                          >
                            {feedback.text}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            void runAgentForCell(ship.id, a.key);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loading
                            ? main.flowCellRunning
                            : main.flowCellRun}
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {typeof document !== "undefined" &&
        hoverTip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-auto fixed z-[200] max-h-[min(280px,42vh)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[10px] leading-relaxed text-[var(--muted)] shadow-xl"
            style={{
              left: hoverTip.left,
              top: hoverTip.top,
              transform: "translateX(-50%)",
            }}
            onMouseEnter={cancelHideTip}
            onMouseLeave={scheduleHideTip}
          >
            <p className="font-semibold text-[var(--foreground)]">
              {hoverTip.agent.name}
            </p>
            <p className="mt-1">{hoverTip.agent.detail}</p>
            <p className="mt-2 border-t border-[var(--border)] pt-2 text-[9px] text-[var(--text-tertiary)]">
              Click the column header for the full panel.
            </p>
          </div>,
          document.body,
        )}

      <AgentDetailModal
        open={detailAgent !== null}
        agent={detailAgent}
        phase={phase}
        scenario={scenario}
        isRunning={isRunning}
        onClose={() => setDetailAgent(null)}
      />
    </div>
  );
}
