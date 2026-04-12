"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { AgentKey, RosterAgent } from "@/lib/agents";
import {
  FLOW_BOARD_AGENTS,
  ROSTER_AGENTS,
  orchestrateAgentIdForRosterKey,
} from "@/lib/agents";
import { flowBoardPathStatus } from "@/lib/flow-board-path";
import type { ActiveShipment } from "@/lib/shipments";
import {
  formatShipmentRoute,
  sortFleetByWeatherAttention,
} from "@/lib/shipments";
import { orderedDeliveryStops } from "@/lib/drop-offs";
import type {
  FacilityStopPermutationRow,
  FlowAgentRunStatusPayload,
} from "@/lib/flow-agent-run-status";
import type { RouteOptionRow } from "@/lib/routeOptions";
import { main } from "@/lib/ui-copy";
import type { ShipmentDriverCrm } from "@/lib/driver-crm";
import { agentSummaryOneLiner } from "@/lib/agent-json-summary";
import {
  driverMessageToSend,
  parseDriverPivtPayloadLoose,
} from "@/lib/driver-pivt-parse";
import { AgentDetailModal } from "./AgentDetailModal";
import { DriverPivtCommsModal } from "./DriverPivtCommsModal";

function trimAgentDoingLine(detail: string, max = 220): string {
  const t = detail.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

interface ResponseFlowCrmBoardProps {
  fleet: ActiveShipment[];
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
  /** From SQLite-backed ``/api/weather-snapshot`` (same ``hits`` as Weather events). */
  weatherAttentionShipmentIds: string[];
  attentionFlowResolvedShipmentIds: string[];
  onAttentionFlowResolved?: (shipmentId: string) => void;
  onAgentRunStatusChange?: (status: FlowAgentRunStatusPayload | null) => void;
  /** Exposes ``Run agent`` execution for the floating Next steps panel (e.g. Facility after opt-out). */
  onRegisterFlowAgentRunner?: (
    runner: ((shipmentId: string, agentKey: AgentKey) => Promise<void>) | null,
  ) => void;
}

export function ResponseFlowCrmBoard({
  fleet,
  phase,
  scenario,
  isRunning,
  weatherAttentionShipmentIds,
  attentionFlowResolvedShipmentIds,
  onAttentionFlowResolved,
  onAgentRunStatusChange,
  onRegisterFlowAgentRunner,
}: ResponseFlowCrmBoardProps) {
  const orderedFleet = useMemo(
    () => sortFleetByWeatherAttention(fleet, weatherAttentionShipmentIds),
    [fleet, weatherAttentionShipmentIds],
  );

  const nwsAlertShipmentIds = useMemo(
    () => new Set(weatherAttentionShipmentIds),
    [weatherAttentionShipmentIds],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hoverTip, setHoverTip] = useState<{
    agent: RosterAgent;
    left: number;
    top: number;
  } | null>(null);

  const [detailAgent, setDetailAgent] = useState<RosterAgent | null>(null);

  const [driverCommsModal, setDriverCommsModal] = useState<{
    shipmentId: string;
    driverName: string;
    driverPhone: string;
    message: string;
  } | null>(null);

  /** `${shipmentId}:${agentKey}` → last run result for compact display */
  const [runFeedback, setRunFeedback] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});
  const [loadingCellKey, setLoadingCellKey] = useState<string | null>(null);

  /** Route options returned by Optimizing Pivt, keyed by shipmentId. */
  const [routeOptionsMap, setRouteOptionsMap] = useState<
    Record<string, { rows: RouteOptionRow[]; source: string; riskBanner: string }>
  >({});
  /** Selected route per shipmentId. */
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, string>>({});
  /** Confirmed route per shipmentId. */
  const [confirmedRoutes, setConfirmedRoutes] = useState<Record<string, string>>({});

  /** Prevents duplicate ``onAttentionFlowResolved`` before parent state updates (e.g. Strict Mode). */
  const attentionResolvedDispatchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const allowed = new Set(weatherAttentionShipmentIds);
    for (const id of [...attentionResolvedDispatchRef.current]) {
      if (!allowed.has(id)) attentionResolvedDispatchRef.current.delete(id);
    }
  }, [weatherAttentionShipmentIds]);

  useEffect(() => {
    for (const id of attentionFlowResolvedShipmentIds) {
      attentionResolvedDispatchRef.current.add(id);
    }
  }, [attentionFlowResolvedShipmentIds]);

  useEffect(() => {
    if (!onAttentionFlowResolved) return;
    for (const ship of orderedFleet) {
      if (!nwsAlertShipmentIds.has(ship.id)) continue;
      if (attentionFlowResolvedShipmentIds.includes(ship.id)) continue;
      if (attentionResolvedDispatchRef.current.has(ship.id)) continue;
      const allAgentsOk = FLOW_BOARD_AGENTS.every((a) => {
        const fk = `${ship.id}:${a.key}`;
        return runFeedback[fk]?.ok === true;
      });
      if (allAgentsOk) {
        attentionResolvedDispatchRef.current.add(ship.id);
        onAttentionFlowResolved(ship.id);
      }
    }
  }, [
    runFeedback,
    orderedFleet,
    nwsAlertShipmentIds,
    onAttentionFlowResolved,
    attentionFlowResolvedShipmentIds,
  ]);

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
      const rosterAgent = ROSTER_AGENTS.find((a) => a.key === agentKey);
      setLoadingCellKey(cellKey);
      if (agentKey === "diplomat") setDriverCommsModal(null);
      const agentName = rosterAgent?.name ?? agentKey;
      const agentRole = rosterAgent?.role ?? "";
      const doingLine = rosterAgent?.detail
        ? trimAgentDoingLine(rosterAgent.detail)
        : "Executing orchestrated agent for this shipment.";
      onAgentRunStatusChange?.({
        status: "running",
        shipmentId,
        agentName,
        agentRole,
        doingLine,
      });
      setRunFeedback((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
      let doneSummary = "";
      let doneOk = false;
      let doneSource: "orchestrate" | "local" | undefined;
      let doneDetails:
        | {
            source?: string;
            rows?: RouteOptionRow[];
            riskBanner?: string;
            crm?: ShipmentDriverCrm;
            facility_maps?: { stop_order_options?: FacilityStopPermutationRow[] };
          }
        | undefined;
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
          source?: "orchestrate" | "local";
          details?: {
            source?: string;
            rows?: RouteOptionRow[];
            riskBanner?: string;
            crm?: ShipmentDriverCrm;
            facility_maps?: { stop_order_options?: FacilityStopPermutationRow[] };
          };
        };
        doneDetails = data.details;
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Request failed",
          );
        }

        if (
          agentKey === "negotiator" &&
          data.details?.rows &&
          Array.isArray(data.details.rows) &&
          data.details.rows.length > 0
        ) {
          setRouteOptionsMap((prev) => ({
            ...prev,
            [shipmentId]: {
              rows: data.details!.rows!,
              source: data.details!.source ?? "fallback",
              riskBanner: data.details!.riskBanner ?? "",
            },
          }));
        }

        const raw = data.summary?.trim() ?? "Done";
        const text = agentSummaryOneLiner(raw);
        doneSummary = raw;
        doneOk = true;
        doneSource = data.source;
        setRunFeedback((prev) => ({
          ...prev,
          [cellKey]: { ok: true, text },
        }));

        if (agentKey === "diplomat") {
          const crm = data.details?.crm;
          const payload = parseDriverPivtPayloadLoose(raw);
          const driverName =
            payload?.driverName?.trim() ||
            crm?.driver.name?.trim() ||
            "Driver";
          const driverPhone =
            payload?.driverPhone?.trim() ||
            crm?.driver.phone?.trim() ||
            "";
          const message = driverMessageToSend(raw);
          setDriverCommsModal({
            shipmentId,
            driverName,
            driverPhone,
            message,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Run failed";
        doneSummary = msg;
        doneOk = false;
        if (agentKey === "diplomat") setDriverCommsModal(null);
        setRunFeedback((prev) => ({
          ...prev,
          [cellKey]: { ok: false, text: msg },
        }));
      } finally {
        setLoadingCellKey(null);
        const facilityMaps = doneDetails?.facility_maps;
        const permOpts = facilityMaps?.stop_order_options;
        const facilityShip = orderedFleet.find((s) => s.id === shipmentId);
        const facilityStops = facilityShip
          ? orderedDeliveryStops(facilityShip)
          : [];
        const facilityStopPermutations =
          doneOk &&
          agentKey === "node_manager" &&
          Array.isArray(permOpts) &&
          permOpts.length > 0
            ? permOpts
            : undefined;
        const facilityCurrentStopOrderLabels =
          facilityStopPermutations && facilityStops.length > 0
            ? facilityStops.map((s) => s.label)
            : undefined;
        const facilityDeliveryStopsSnapshot =
          facilityStopPermutations && facilityStops.length > 0
            ? facilityStops.map((s) => ({
                label: s.label,
                lat: s.lat,
                lng: s.lng,
              }))
            : undefined;

        onAgentRunStatusChange?.({
          status: "done",
          shipmentId,
          agentName,
          agentRole,
          doingLine,
          summary:
            doneSummary.length > 1200
              ? `${doneSummary.slice(0, 1197)}…`
              : doneSummary,
          ok: doneOk,
          source: doneSource,
          rosterAgentKey: agentKey,
          routeChoice:
            doneOk &&
            agentKey === "negotiator" &&
            doneDetails?.rows &&
            Array.isArray(doneDetails.rows) &&
            doneDetails.rows.length > 0
              ? {
                  rows: doneDetails.rows,
                  source: doneDetails.source ?? "",
                  riskBanner: doneDetails.riskBanner ?? "",
                }
              : undefined,
          facilityStopPermutations,
          facilityCurrentStopOrderLabels,
          facilityDeliveryStopsSnapshot,
        });
      }
    },
    [scenario, onAgentRunStatusChange, orderedFleet],
  );

  useEffect(() => {
    if (!onRegisterFlowAgentRunner) return;
    const runner = (shipmentId: string, key: AgentKey) =>
      runAgentForCell(shipmentId, key);
    onRegisterFlowAgentRunner(runner);
    return () => onRegisterFlowAgentRunner(null);
  }, [onRegisterFlowAgentRunner, runAgentForCell]);

  if (orderedFleet.length === 0) {
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
        <table className="w-full min-w-[760px] border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-card)]">
              <th
                scope="col"
                className="sticky left-0 z-20 w-28 min-w-[7rem] border-r border-[var(--border)] bg-[var(--surface-card)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
              >
                {main.flowBoardPathColumn}
              </th>
              <th className="sticky left-28 z-10 min-w-[120px] border-r border-[var(--border)] bg-[var(--surface-card)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Shipment
              </th>
              {FLOW_BOARD_AGENTS.map((a) => (
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
            {orderedFleet.map((ship) => {
              const hasNwsAttention = nwsAlertShipmentIds.has(ship.id);
              const path = flowBoardPathStatus(ship, phase, scenario, {
                routeIntersectsNwsAlert: hasNwsAttention,
              });
              const shipRoutes = routeOptionsMap[ship.id];
              const routeLocked =
                Boolean(ship.optimizingSelectedRoute) || ship.optimizingRouteOptOut;
              const pendingRouteCommit =
                Boolean(shipRoutes?.rows?.length) && !routeLocked;
              return (
              <tr
                key={ship.id}
                className="border-b border-[var(--border)]/80 last:border-0"
              >
                <td
                  className={`sticky left-0 z-20 w-28 min-w-[7rem] border-r px-2 py-1.5 align-top shadow-[2px_0_8px_-2px_rgba(0,0,0,0.4)] ${
                    hasNwsAttention
                      ? "border-rose-600/45 bg-rose-950/70"
                      : "border-[var(--border)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  <p
                    className={`text-[10px] font-medium leading-snug ${
                      hasNwsAttention
                        ? "text-rose-50"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {path.pathLine}
                  </p>
                  <p
                    className={`mt-0.5 text-[9px] leading-tight ${
                      hasNwsAttention
                        ? "text-rose-100/95"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {path.loadLine}
                  </p>
                  {shipRoutes && (
                    <p className="mt-1.5 text-[8px] font-medium text-[var(--accent)]">
                      {shipRoutes.rows.length} route{shipRoutes.rows.length !== 1 ? "s" : ""} available
                      {shipRoutes.source === "google_maps" ? " (Maps)" : ""}
                    </p>
                  )}
                </td>
                <td className="sticky left-28 z-10 border-r border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 align-top shadow-[2px_0_8px_-2px_rgba(0,0,0,0.25)]">
                  <p className="font-mono text-[11px] font-semibold text-[var(--foreground)]">
                    {ship.id}
                  </p>
                  <p className="text-[9px] leading-tight text-[var(--muted)]">
                    {formatShipmentRoute(ship)}
                  </p>
                  {ship.optimizingSelectedRoute ? (
                    <p className="mt-1 text-[8px] font-semibold text-emerald-400">
                      ✓ Route {ship.optimizingSelectedRoute} committed
                    </p>
                  ) : null}
                  {ship.optimizingRouteOptOut && !ship.optimizingSelectedRoute ? (
                    <p className="mt-1 text-[8px] text-amber-200/90">
                      Route commit skipped — check Facility Pivt
                    </p>
                  ) : null}
                </td>
                {FLOW_BOARD_AGENTS.map((a) => {
                  const cellKey = `${ship.id}:${a.key}`;
                  const feedback = runFeedback[cellKey];
                  const loading = loadingCellKey === cellKey;

                  if (a.key === "negotiator" && pendingRouteCommit) {
                    return (
                      <td key={a.key} className="px-1 py-1 align-top">
                        <p className="mb-1 text-[8px] leading-snug text-[var(--muted)]">
                          {main.flowNegotiatorPickInModal}
                        </p>
                        <div className="flex min-w-0 flex-col gap-1">
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
                      </div>
                      </td>
                    );
                  }

                  return (
                    <td key={a.key} className="px-1 py-1 align-top">
                      <div className="flex min-w-0 flex-col gap-1">
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
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
            })}
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

      {typeof document !== "undefined" &&
        driverCommsModal &&
        createPortal(
          <DriverPivtCommsModal
            open
            shipmentId={driverCommsModal.shipmentId}
            driverName={driverCommsModal.driverName}
            driverPhone={driverCommsModal.driverPhone}
            message={driverCommsModal.message}
            onClose={() => setDriverCommsModal(null)}
          />,
          document.body,
        )}
    </div>
  );
}
