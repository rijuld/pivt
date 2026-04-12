"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentKey } from "@/lib/agents";
import { parsePivotAgentJson } from "@/lib/agent-json-summary";
import type {
  FacilityStopPermutationRow,
  FlowAgentRunStatusPayload,
} from "@/lib/flow-agent-run-status";
import type { RouteOptionRow } from "@/lib/routeOptions";
import { main } from "@/lib/ui-copy";
import { AgentRunSummaryBody } from "./AgentRunSummaryBody";

interface FlowAgentRunPanelProps {
  status: FlowAgentRunStatusPayload | null;
  /** Clears the last-run chip from the workspace. */
  onClear: () => void;
  /** Reload fleet after PATCH so SQLite-backed fields update the CRM board. */
  onRefreshFleet?: () => void | Promise<void>;
  /** Same runner as Response flow ``Run agent`` cells (used after Opt out). */
  getFlowAgentRunner?: () =>
    | ((shipmentId: string, agentKey: AgentKey) => void | Promise<void>)
    | null;
  /** After a successful route commit — parent shows a toast and may switch tabs. */
  onRouteSaved?: (payload: { option: string }) => void;
  /** After opt-out PATCH — parent shows a toast; Facility run is deferred slightly. */
  onRouteOptOut?: () => void;
  /** After Facility Pivt applies a new stop permutation to the load. */
  onFacilityStopOrderSaved?: () => void;
}

export function FlowAgentRunPanel({
  status,
  onClear,
  onRefreshFleet,
  getFlowAgentRunner,
  onRouteSaved,
  onRouteOptOut,
  onFacilityStopOrderSaved,
}: FlowAgentRunPanelProps) {
  const [nextStepsOpen, setNextStepsOpen] = useState(false);
  const [modalChosenOption, setModalChosenOption] = useState<string | null>(null);
  const [routeActionBusy, setRouteActionBusy] = useState(false);
  const [routeActionError, setRouteActionError] = useState<string | null>(null);
  const [facilityChosenIndex, setFacilityChosenIndex] = useState<number | null>(
    null,
  );
  const [facilityActionBusy, setFacilityActionBusy] = useState(false);
  const [facilityActionError, setFacilityActionError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (status?.status === "done") setNextStepsOpen(true);
    if (status?.status === "running") setNextStepsOpen(false);
  }, [status]);

  useEffect(() => {
    setRouteActionError(null);
    if (!nextStepsOpen || status?.status !== "done") return;
    const rc = status.routeChoice;
    if (!rc?.rows?.length) {
      setModalChosenOption(null);
      return;
    }
    const j = parsePivotAgentJson(status.summary);
    const recLetter =
      j?.agent === "optimizing_pivt" && j.recommended_option != null
        ? String(j.recommended_option).trim().toUpperCase().slice(0, 1)
        : null;
    const recOk =
      recLetter && rc.rows.some((r) => r.option === recLetter)
        ? recLetter
        : null;
    setModalChosenOption(
      recOk ??
        rc.rows.find((r) => r.approved)?.option ??
        rc.rows[0]?.option ??
        null,
    );
  }, [nextStepsOpen, status]);

  useEffect(() => {
    setFacilityActionError(null);
  }, [nextStepsOpen, status]);

  useEffect(() => {
    if (nextStepsOpen) setFacilityChosenIndex(null);
  }, [nextStepsOpen]);

  const patchShipRouteDecision = useCallback(
    async (body: {
      optimizingSelectedRoute: string | null;
      optimizingRouteOptOut: boolean;
    }) => {
      if (!status || status.status !== "done") return;
      const res = await fetch(
        `/api/ships/${encodeURIComponent(status.shipmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Update failed",
        );
      }
      await onRefreshFleet?.();
    },
    [onRefreshFleet, status],
  );

  const patchShipDropOffs = useCallback(
    async (
      dropOffsJson: string,
      extra?: {
        optimizingSelectedRoute: string | null;
        optimizingRouteOptOut: boolean;
      },
    ) => {
      if (!status || status.status !== "done") return;
      const res = await fetch(
        `/api/ships/${encodeURIComponent(status.shipmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            extra
              ? { dropOffsJson, ...extra }
              : { dropOffsJson },
          ),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Update failed",
        );
      }
      await onRefreshFleet?.();
    },
    [onRefreshFleet, status],
  );

  const handleConfirmRoute = useCallback(async () => {
    if (!status || status.status !== "done" || !modalChosenOption) return;
    setRouteActionBusy(true);
    setRouteActionError(null);
    try {
      await patchShipRouteDecision({
        optimizingSelectedRoute: modalChosenOption,
        optimizingRouteOptOut: false,
      });
      onRouteSaved?.({ option: modalChosenOption });
      setNextStepsOpen(false);
    } catch (e) {
      setRouteActionError(
        e instanceof Error ? e.message : main.flowModalRouteError,
      );
    } finally {
      setRouteActionBusy(false);
    }
  }, [modalChosenOption, onRouteSaved, patchShipRouteDecision, status]);

  const handleOptOut = useCallback(async () => {
    if (!status || status.status !== "done") return;
    setRouteActionBusy(true);
    setRouteActionError(null);
    try {
      await patchShipRouteDecision({
        optimizingSelectedRoute: null,
        optimizingRouteOptOut: true,
      });
      onRouteOptOut?.();
      setNextStepsOpen(false);
      const shipId = status.shipmentId;
      const runner = getFlowAgentRunner?.();
      setTimeout(() => {
        if (runner) void runner(shipId, "node_manager");
      }, 450);
    } catch (e) {
      setRouteActionError(
        e instanceof Error ? e.message : main.flowModalRouteError,
      );
    } finally {
      setRouteActionBusy(false);
    }
  }, [getFlowAgentRunner, onRouteOptOut, patchShipRouteDecision, status]);

  const handleApplyFacilityOrder = useCallback(async () => {
    if (!status || status.status !== "done") return;
    const perms = status.facilityStopPermutations;
    const snap = status.facilityDeliveryStopsSnapshot;
    if (!perms?.length || !snap?.length) return;
    const idx =
      facilityChosenIndex ??
      defaultFacilityPermutationIndex(
        status.summary,
        perms,
        status.facilityCurrentStopOrderLabels,
      );
    const chosen = perms[idx];
    if (!chosen) return;
    const reordered = reorderSnapshotByLabels(snap, chosen.stop_order);
    if (!reordered) {
      setFacilityActionError(
        "Stop labels do not match this load. Refresh the fleet and re-run Facility Pivt.",
      );
      return;
    }
    const dropOffsJson = JSON.stringify(
      reordered.map((s, i) => ({
        label: s.label,
        lat: s.lat,
        lng: s.lng,
        sequence: i + 1,
      })),
    );
    setFacilityActionBusy(true);
    setFacilityActionError(null);
    try {
      // Reordering invalidates a previously saved Optimizing letter / polyline.
      await patchShipDropOffs(dropOffsJson, {
        optimizingSelectedRoute: null,
        optimizingRouteOptOut: false,
      });
      onFacilityStopOrderSaved?.();
      setNextStepsOpen(false);
    } catch (e) {
      setFacilityActionError(
        e instanceof Error ? e.message : main.flowModalFacilityError,
      );
    } finally {
      setFacilityActionBusy(false);
    }
  }, [facilityChosenIndex, onFacilityStopOrderSaved, patchShipDropOffs, status]);

  const facilityDefaultIndex = useMemo(() => {
    if (!status || status.status !== "done") return 0;
    const perms = status.facilityStopPermutations;
    if (!perms?.length) return 0;
    return defaultFacilityPermutationIndex(
      status.summary,
      perms,
      status.facilityCurrentStopOrderLabels,
    );
  }, [status]);

  if (!status) return null;

  const isRunning = status.status === "running";
  const showRoutePicker =
    status.status === "done" &&
    status.ok &&
    status.rosterAgentKey === "negotiator" &&
    status.routeChoice &&
    status.routeChoice.rows.length > 0;

  const showFacilityPermutationPicker =
    status.status === "done" &&
    status.ok &&
    status.rosterAgentKey === "node_manager" &&
    (status.facilityStopPermutations?.length ?? 0) > 0 &&
    (status.facilityDeliveryStopsSnapshot?.length ?? 0) > 0;

  const effectiveFacilityIndex =
    facilityChosenIndex ?? facilityDefaultIndex;

  const facilityChosenRow =
    status.status === "done" && status.facilityStopPermutations
      ? status.facilityStopPermutations[effectiveFacilityIndex]
      : undefined;
  const facilityMatchesCurrent =
    status.status === "done" &&
    facilityChosenRow != null &&
    status.facilityCurrentStopOrderLabels != null &&
    labelsEqual(
      facilityChosenRow.stop_order,
      status.facilityCurrentStopOrderLabels,
    );
  const facilityApplyDisabled =
    !showFacilityPermutationPicker ||
    facilityActionBusy ||
    facilityMatchesCurrent;

  return (
    <>
      <div
        className="pointer-events-auto fixed bottom-5 right-5 z-[100] flex w-[min(18rem,calc(100vw-2.5rem))] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]/98 p-3 shadow-xl backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              {isRunning
                ? main.flowAgentStatusTitle
                : main.flowAgentStatusTitleDone}
            </p>
            <p className="mt-1 truncate text-[12px] font-semibold text-[var(--foreground)]">
              {status.agentName}
            </p>
            <p className="truncate text-[9px] text-[var(--muted)]">{status.agentRole}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--foreground)]">
              {main.flowAgentStatusLoad(status.shipmentId)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClear}
            className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)] transition hover:border-rose-500/40 hover:text-rose-200"
          >
            ×
          </button>
        </div>

        {isRunning ? (
          <>
            <p className="text-[9px] leading-snug text-[var(--muted)]">
              {status.doingLine}
            </p>
            <p className="flex items-center gap-1.5 text-[8px] text-[var(--text-tertiary)]">
              <span
                className="inline-flex h-1 w-1 shrink-0 animate-pulse rounded-full bg-[var(--accent)]"
                aria-hidden
              />
              {main.flowAgentStatusFooter}
            </p>
          </>
        ) : (
          <>
            <p className="text-[9px] leading-snug text-[var(--muted)]">{status.doingLine}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setNextStepsOpen(true)}
                className="flex-1 rounded border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
              >
                Next steps
              </button>
              {status.source === "orchestrate" && (
                <span className="self-center text-[7px] font-medium uppercase tracking-wider text-sky-400/90">
                  watsonx
                </span>
              )}
            </div>
            {!status.ok ? (
              <p className="text-[9px] leading-snug text-rose-300">
                Run reported an error — open Next steps for details.
              </p>
            ) : null}
          </>
        )}
      </div>

      {typeof document !== "undefined" &&
        !isRunning &&
        status.status === "done" &&
        nextStepsOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key="flow-next-steps"
              className="fixed inset-0 z-[160] flex items-end justify-center p-4 sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                  onClick={() => setNextStepsOpen(false)}
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="flow-next-steps-title"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 16, opacity: 0 }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.38 }}
                  className="relative z-10 flex max-h-[min(82vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
                >
                  <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
                    <h2
                      id="flow-next-steps-title"
                      className="text-[13px] font-semibold uppercase tracking-wide text-[var(--foreground)]"
                    >
                      Next steps
                    </h2>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {status.agentName} · {main.flowAgentStatusLoad(status.shipmentId)}
                    </p>
                  </div>
                  <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {!status.ok ? (
                      <p className="text-[12px] leading-relaxed text-rose-300">
                        {status.summary}
                      </p>
                    ) : (
                      <>
                        <AgentRunSummaryBody
                          summary={status.summary}
                          omitRouteOptionsTable={showRoutePicker}
                        />
                        {showRoutePicker && status.routeChoice ? (
                          <OptimizingRoutePicker
                            rows={status.routeChoice.rows}
                            source={status.routeChoice.source}
                            riskBanner={status.routeChoice.riskBanner}
                            chosen={modalChosenOption}
                            onChoose={setModalChosenOption}
                            disabled={routeActionBusy}
                          />
                        ) : null}
                        {showFacilityPermutationPicker &&
                        status.facilityStopPermutations ? (
                          <FacilityPermutationPicker
                            summary={status.summary}
                            permutations={status.facilityStopPermutations}
                            chosenIndex={effectiveFacilityIndex}
                            onChooseIndex={setFacilityChosenIndex}
                            disabled={facilityActionBusy}
                          />
                        ) : null}
                        {routeActionError ? (
                          <p className="mt-2 text-[11px] text-rose-300">{routeActionError}</p>
                        ) : null}
                        {facilityActionError ? (
                          <p className="mt-2 text-[11px] text-rose-300">
                            {facilityActionError}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--surface-card)] px-4 py-3">
                    {showRoutePicker ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          disabled={routeActionBusy || !modalChosenOption}
                          onClick={() => void handleConfirmRoute()}
                          className="order-1 w-full rounded border border-[var(--accent)]/55 bg-[var(--accent)]/20 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)] transition hover:bg-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:min-w-[10rem] sm:flex-1"
                        >
                          {routeActionBusy ? main.flowModalRouteBusy : main.flowModalConfirmRoute}
                        </button>
                        <button
                          type="button"
                          disabled={routeActionBusy}
                          onClick={() => void handleOptOut()}
                          className="order-2 w-full rounded border border-amber-600/45 bg-amber-950/35 py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-100/95 transition hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:min-w-[10rem] sm:flex-1"
                        >
                          {main.flowModalOptOut}
                        </button>
                        <button
                          type="button"
                          disabled={routeActionBusy}
                          onClick={() => setNextStepsOpen(false)}
                          className="order-3 w-full rounded border border-[var(--border)] bg-[var(--surface)] py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)]/40 disabled:opacity-45 sm:order-none sm:w-auto sm:min-w-[6rem]"
                        >
                          Close
                        </button>
                      </div>
                    ) : showFacilityPermutationPicker ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          disabled={facilityApplyDisabled}
                          onClick={() => void handleApplyFacilityOrder()}
                          className="order-1 w-full rounded border border-[var(--accent)]/55 bg-[var(--accent)]/20 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)] transition hover:bg-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-45 sm:order-none sm:w-auto sm:min-w-[10rem] sm:flex-1"
                        >
                          {facilityActionBusy
                            ? main.flowModalFacilityBusy
                            : main.flowModalApplyFacilityOrder}
                        </button>
                        <button
                          type="button"
                          disabled={facilityActionBusy}
                          onClick={() => setNextStepsOpen(false)}
                          className="order-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)]/40 disabled:opacity-45 sm:order-none sm:w-auto sm:min-w-[6rem]"
                        >
                          Close
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNextStepsOpen(false)}
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)]/40"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function labelsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]!);
}

function defaultFacilityPermutationIndex(
  summary: string,
  permutations: FacilityStopPermutationRow[],
  currentLabels: string[] | undefined,
): number {
  const j = parsePivotAgentJson(summary);
  const rec = j?.recommended_stop_order;
  if (Array.isArray(rec)) {
    const labels = rec.filter((x): x is string => typeof x === "string");
    const n0 = permutations[0]?.stop_order.length ?? 0;
    if (labels.length > 0 && labels.length === n0) {
      const idx = permutations.findIndex((p) => labelsEqual(p.stop_order, labels));
      if (idx >= 0) return idx;
    }
  }
  if (currentLabels?.length) {
    const idx = permutations.findIndex((p) =>
      labelsEqual(p.stop_order, currentLabels),
    );
    if (idx >= 0) return idx;
  }
  return 0;
}

function reorderSnapshotByLabels(
  snapshot: Array<{ label: string; lat: number; lng: number }>,
  labelOrder: string[],
): Array<{ label: string; lat: number; lng: number }> | null {
  if (snapshot.length !== labelOrder.length) return null;
  const byLabel = new Map(snapshot.map((s) => [s.label, s]));
  const out: Array<{ label: string; lat: number; lng: number }> = [];
  for (const lab of labelOrder) {
    const row = byLabel.get(lab);
    if (!row) return null;
    out.push(row);
  }
  return out;
}

function facilityPermutationBadges(
  summary: string,
  row: FacilityStopPermutationRow,
  index: number,
): string[] {
  const badges: string[] = [];
  if (index === 0) badges.push("Lowest modeled cost");
  const j = parsePivotAgentJson(summary);
  const rec = j?.recommended_stop_order;
  if (Array.isArray(rec)) {
    const labels = rec.filter((x): x is string => typeof x === "string");
    if (labels.length && labelsEqual(row.stop_order, labels)) {
      badges.push("Summary pick");
    }
  }
  return badges;
}

function FacilityPermutationPicker({
  summary,
  permutations,
  chosenIndex,
  onChooseIndex,
  disabled,
}: {
  summary: string;
  permutations: FacilityStopPermutationRow[];
  chosenIndex: number;
  onChooseIndex: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        {main.flowModalFacilitySection}
      </p>
      <p className="mt-1 text-[9px] leading-snug text-[var(--muted)]">
        All permutations keep the same stops; only the driving order changes. Pick one
        and apply to update this load's delivery sequence.
      </p>
      <div
        className="mt-2 flex flex-col gap-2"
        role="radiogroup"
        aria-label="Stop order permutations"
      >
        {permutations.map((row, index) => {
          const isOn = chosenIndex === index;
          const badges = facilityPermutationBadges(summary, row, index);
          return (
            <button
              key={`${row.name}-${index}`}
              type="button"
              role="radio"
              aria-checked={isOn}
              disabled={disabled}
              onClick={() => onChooseIndex(index)}
              className={`rounded border px-3 py-2 text-left text-[11px] transition ${
                isOn
                  ? "border-[var(--accent)]/60 bg-[var(--accent)]/[0.1] shadow-[inset_0_0_0_1px_rgba(216,249,102,0.12)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]/35"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="font-semibold text-[var(--foreground)]">{row.name}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-[var(--muted)]">
                {row.stop_order.join(" → ")}
              </span>
              <span className="mt-1 flex flex-wrap gap-3 font-mono text-[9px] text-[var(--muted)]">
                <span>
                  <span className="text-[var(--text-tertiary)]">Drive</span>{" "}
                  {row.distance_mi} mi
                </span>
                <span>
                  <span className="text-[var(--text-tertiary)]">ETA</span>{" "}
                  {row.duration_min} min
                </span>
                <span>
                  <span className="text-[var(--text-tertiary)]">Modeled</span> $
                  {row.total_cost_usd}
                </span>
              </span>
              <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-tertiary)]">
                {row.summary}
              </span>
              {badges.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {badges.map((b) => (
                    <span
                      key={b}
                      className="inline-block rounded border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptimizingRoutePicker({
  rows,
  source,
  riskBanner,
  chosen,
  onChoose,
  disabled,
}: {
  rows: RouteOptionRow[];
  source: string;
  riskBanner: string;
  chosen: string | null;
  onChoose: (opt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        {main.flowModalRouteSection}
      </p>
      {source ? (
        <p className="mt-1 text-[8px] uppercase tracking-wide text-[var(--muted)]">{source}</p>
      ) : null}
      <div
        className="mt-2 flex flex-col gap-2"
        role="radiogroup"
        aria-label="Route options"
      >
        {rows.map((row) => {
          const opt = row.option;
          const isOn = chosen === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={isOn}
              disabled={disabled}
              onClick={() => onChoose(opt)}
              className={`rounded border px-3 py-2 text-left text-[11px] transition ${
                isOn
                  ? "border-[var(--accent)]/60 bg-[var(--accent)]/[0.1] shadow-[inset_0_0_0_1px_rgba(216,249,102,0.12)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]/35"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="font-semibold text-[var(--foreground)]">{row.label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-[var(--muted)]">
                {row.description}
              </span>
              <span className="mt-1 flex flex-wrap gap-3 font-mono text-[9px] text-[var(--muted)]">
                <span>
                  <span className="text-[var(--text-tertiary)]">ETA</span> {row.eta}
                </span>
                <span>
                  <span className="text-[var(--text-tertiary)]">Cost</span> {row.cost}
                </span>
                {row.slaPenalty !== "—" ? (
                  <span className="text-[var(--warn)]">
                    <span className="text-[var(--text-tertiary)]">SLA</span> {row.slaPenalty}
                  </span>
                ) : null}
              </span>
              {row.approved ? (
                <span className="mt-1 inline-block text-[7px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Recommended
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {riskBanner ? (
        <p className="mt-2 text-[9px] leading-snug text-[var(--muted)]">{riskBanner}</p>
      ) : null}
    </div>
  );
}
