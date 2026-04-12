"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleOverviewMap } from "./GoogleOverviewMap";
import { RouteRevisionsTable } from "./RouteRevisionsTable";
import { ScenarioFooterPanel } from "./ScenarioFooterPanel";
import { ResponseFlowChart } from "./ResponseFlowChart";
import { DriverUpdatesPanel } from "./DriverUpdatesPanel";
import { WeatherEventsPanel } from "./WeatherEventsPanel";
import { FlowAgentRunPanel } from "./FlowAgentRunPanel";
import type { AgentKey } from "@/lib/agents";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import {
  sortFleetByWeatherAttention,
  type ActiveShipment,
} from "@/lib/shipments";
import { EXCEPTION_ALERTS } from "@/lib/constants";
import {
  resolutionForShipment,
  resolutionWithShipmentId,
  type AgentId,
  type ResolutionOutput,
  type SimStep,
} from "@/lib/simulation";
import type { FlowAgentRunStatusPayload } from "@/lib/flow-agent-run-status";
import { agentLabels, main } from "@/lib/ui-copy";
import type { WorkspaceTabId } from "@/lib/workspace-tab";

const shell = {
  card: "border border-[var(--border)] bg-[var(--surface-card)] shadow-sm",
  head: "border-b border-[var(--border)] px-5 py-4",
  title: "text-[14px] font-semibold tracking-tight uppercase text-[var(--foreground)]",
  desc: "mt-0.5 text-[11px] leading-snug text-[var(--muted)]",
  body: "p-4",
} as const;

const TABS: { id: WorkspaceTabId; label: string; sub?: string }[] = [
  { id: "overview", label: main.tabMap },
  { id: "updated_route", label: main.tabUpdatedRoute },
  { id: "flow", label: main.tabFlow },
  { id: "drivers", label: main.tabComms },
  { id: "log", label: main.tabLog },
];

const INITIALS: Record<AgentId, string> = {
  watchman: "RP",
  node_manager: "FP",
  negotiator: "OP",
  diplomat: "DP",
  system: "IG",
};

function categoryFor(agent: AgentId): string {
  return agentLabels[agent]?.category ?? "Update";
}

interface MainWorkspaceProps {
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
  messages: SimStep[];
  resolution: ResolutionOutput | null;
  fleet: ActiveShipment[];
  selectedShipmentId: string | null;
  onSelectShipment: (id: string) => void;
  workspaceTab: WorkspaceTabId;
  onWorkspaceTabChange: (tab: WorkspaceTabId) => void;
  /** NWS corridor hits from cached weather snapshot (``/api/weather-snapshot``). */
  weatherAttentionShipmentIds: string[];
  /** Loads cleared in the Response flow (all agents run OK) for current NWS attention. */
  attentionFlowResolvedShipmentIds: string[];
  /** CRM board calls this when all roster agents succeed for an attention load. */
  onAttentionFlowResolved?: (shipmentId: string) => void;
  /** Call after Weather tab finishes a successful refresh so attention state reloads from DB. */
  onWeatherDataRefresh?: () => void;
  /** Reload ships from SQLite (e.g. after committing an optimizing route in Next steps). */
  onRefreshFleet?: () => void | Promise<void>;
}

export function MainWorkspace({
  phase,
  scenario,
  isRunning,
  messages,
  resolution,
  fleet,
  selectedShipmentId,
  onSelectShipment,
  workspaceTab: tab,
  onWorkspaceTabChange: setTab,
  weatherAttentionShipmentIds,
  attentionFlowResolvedShipmentIds,
  onAttentionFlowResolved,
  onWeatherDataRefresh,
  onRefreshFleet,
}: MainWorkspaceProps) {
  const fleetWeatherSortOrder = useMemo(
    () =>
      sortFleetByWeatherAttention(fleet, weatherAttentionShipmentIds).map(
        (s) => s.id,
      ),
    [fleet, weatherAttentionShipmentIds],
  );

  const selectedShip = useMemo((): ActiveShipment | null => {
    if (!selectedShipmentId) return null;
    return fleet.find((s) => s.id === selectedShipmentId) ?? null;
  }, [fleet, selectedShipmentId]);

  const resolutionForPanel = useMemo((): ResolutionOutput | null => {
    if (!selectedShip) return null;
    if (resolution) return resolutionWithShipmentId(resolution, selectedShip.id);
    if (scenario === "idle") return null;
    return resolutionForShipment(scenario, selectedShip.id);
  }, [resolution, scenario, selectedShip]);

  const [customerEmailSent, setCustomerEmailSent] = useState<{
    shipmentId: string;
    scenario: ScenarioKind;
  } | null>(null);
  const emailSent =
    customerEmailSent !== null &&
    customerEmailSent.shipmentId === selectedShipmentId &&
    customerEmailSent.scenario === scenario;

  const [flowAgentRunStatus, setFlowAgentRunStatus] =
    useState<FlowAgentRunStatusPayload | null>(null);
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);
  const workspaceToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showWorkspaceToast = useCallback((message: string) => {
    if (workspaceToastTimer.current) {
      clearTimeout(workspaceToastTimer.current);
    }
    setWorkspaceToast(message);
    workspaceToastTimer.current = setTimeout(() => {
      setWorkspaceToast(null);
      workspaceToastTimer.current = null;
    }, 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (workspaceToastTimer.current) {
        clearTimeout(workspaceToastTimer.current);
      }
    };
  }, []);

  const flowAgentRunnerRef = useRef<
    ((shipmentId: string, agentKey: AgentKey) => Promise<void>) | null
  >(null);

  const registerFlowAgentRunner = useCallback(
    (
      runner:
        | ((shipmentId: string, agentKey: AgentKey) => Promise<void>)
        | null,
    ) => {
      flowAgentRunnerRef.current = runner;
    },
    [],
  );

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedShipmentId]);

  const alertText =
    scenario !== "idle" && phase !== "nominal"
      ? EXCEPTION_ALERTS[scenario]
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <header className="shrink-0 border-b border-[var(--border)] px-5 py-4 lg:px-8">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[var(--accent)]">
            {main.welcomeLine()}
          </p>
          <h2 className="mt-0.5 text-xl font-bold uppercase tracking-tight text-[var(--foreground)] md:text-2xl">
            {main.headline}
          </h2>
          <p className="text-[12px] leading-snug text-[var(--muted)]">
            {main.subline}
          </p>
        </div>
        {/* Tab nav pill bar */}
        <nav className="mt-4 inline-flex gap-1 bg-[var(--surface-elevated)] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                tab === t.id
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="flex flex-col items-start leading-tight">
                <span>{t.label}</span>
                {t.sub ? (
                  <span className="max-w-[10rem] truncate text-[8px] font-normal normal-case tracking-normal opacity-70">
                    {t.sub}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </nav>
      </header>

      <AnimatePresence>
        {alertText && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-rose-500/20 bg-rose-500/[0.08]"
          >
            <p className="px-5 py-2.5 text-[11px] font-medium leading-snug text-rose-300 lg:px-8">
              🚨 {alertText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {workspaceToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[190] flex justify-center px-4 sm:top-[5rem]">
          <div className="pointer-events-auto max-w-lg rounded border border-[var(--accent)]/50 bg-[var(--surface-elevated)] px-4 py-2.5 text-center text-[12px] font-semibold text-[var(--accent)] shadow-xl">
            {workspaceToast}
          </div>
        </div>
      ) : null}

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        {tab === "overview" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface-card)] shadow-sm">
              <div className="relative min-h-[min(48vh,480px)]">
                <GoogleOverviewMap
                  phase={phase}
                  scenario={scenario}
                  shipment={selectedShip}
                />
                <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1">
                  <LegendChip label={main.legendDirections} accent />
                  <LegendChip label={main.legendPath} />
                  {phase !== "nominal" && <LegendChip label={main.legendIssue} danger />}
                  {(phase === "thinking" || phase === "resolved") && (
                    <LegendChip label={main.legendWorking} dashed />
                  )}
                  {phase === "resolved" && (
                    <LegendChip label={main.legendDone} ok />
                  )}
                </div>
              </div>
              <ScenarioFooterPanel
                scenario={scenario}
                shipmentId={selectedShip?.id ?? null}
              />
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--muted)]">
              {main.mapCaption}
              {selectedShip ? (
                <>
                  {" "}
                  <span className="font-mono text-[var(--foreground)]">
                    ({selectedShip.id}: {selectedShip.routeFrom} →{" "}
                    {selectedShip.routeTo})
                  </span>
                </>
              ) : null}
            </p>
          </div>
        )}

        {tab === "updated_route" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.updatedRouteTitle}</h3>
              <p className={shell.desc}>{main.updatedRouteDesc}</p>
            </div>
            <div className={shell.body}>
              {!selectedShip ? (
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  {main.updatedRouteSelectLoadHint}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {main.routeRevisionsSectionTitle}
                    </h4>
                    <RouteRevisionsTable
                      shipId={selectedShip.id}
                      currentShip={selectedShip}
                      onAfterRevert={onRefreshFleet}
                    />
                  </div>
                  {!selectedShip.optimizingSelectedRoute &&
                  !selectedShip.optimizingRouteOptOut ? (
                    <p className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
                      {main.updatedRouteEmpty}
                    </p>
                  ) : null}
                  {selectedShip.optimizingSelectedRoute ? (
                    <div className="flex items-center gap-2 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5">
                      <span className="text-[11px] font-semibold text-[var(--accent)]">
                        {main.routeCommitted(
                          selectedShip.optimizingSelectedRoute,
                        )}
                      </span>
                    </div>
                  ) : selectedShip.optimizingRouteOptOut ? (
                    <div className="flex items-center gap-2 border border-amber-600/40 bg-amber-950/30 px-4 py-2.5">
                      <span className="text-[11px] font-semibold text-amber-100/90">
                        {main.routeOptedOut}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                    <div className="relative min-h-[min(48vh,480px)]">
                      <GoogleOverviewMap
                        phase={phase}
                        scenario={scenario}
                        shipment={selectedShip}
                      />
                      <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1">
                        <LegendChip label={main.legendDirections} accent />
                        <LegendChip label={main.legendPath} />
                        {phase !== "nominal" && (
                          <LegendChip label={main.legendIssue} danger />
                        )}
                        {(phase === "thinking" || phase === "resolved") && (
                          <LegendChip label={main.legendWorking} dashed />
                        )}
                        {phase === "resolved" && (
                          <LegendChip label={main.legendDone} ok />
                        )}
                      </div>
                    </div>
                    <ScenarioFooterPanel
                      scenario={scenario}
                      shipmentId={selectedShip.id}
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                    {main.updatedRouteCaption}{" "}
                    <span className="font-mono text-[var(--foreground)]">
                      ({selectedShip.id}: {selectedShip.routeFrom} →{" "}
                      {selectedShip.routeTo})
                    </span>
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "weather" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.weatherTitle}</h3>
              <p className={shell.desc}>{main.weatherDesc}</p>
            </div>
            <div className={shell.body}>
              <WeatherEventsPanel
                onLoaded={onWeatherDataRefresh}
                fleetSortOrder={fleetWeatherSortOrder}
              />
            </div>
          </section>
        )}

        {tab === "flow" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.flowTitle}</h3>
              <p className={shell.desc}>{main.flowIntro}</p>
            </div>
            <div className={shell.body}>
              <ResponseFlowChart
                fleet={selectedShip ? [selectedShip] : []}
                phase={phase}
                scenario={scenario}
                isRunning={isRunning}
                weatherAttentionShipmentIds={weatherAttentionShipmentIds}
                attentionFlowResolvedShipmentIds={
                  attentionFlowResolvedShipmentIds
                }
                onAttentionFlowResolved={onAttentionFlowResolved}
                onAgentRunStatusChange={setFlowAgentRunStatus}
                onRegisterFlowAgentRunner={registerFlowAgentRunner}
              />
            </div>
          </section>
        )}

        {tab === "drivers" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.driverCrmTitle}</h3>
              <p className={shell.desc}>{main.driverCrmHint}</p>
            </div>
            <div className={shell.body}>
              <DriverUpdatesPanel
                fleet={fleet}
                selectedShipmentId={selectedShipmentId}
                onSelectShipment={onSelectShipment}
                resolution={resolutionForPanel}
                emailSent={emailSent}
                onSendCustomerDraft={async () => {
                  if (selectedShipmentId && scenario !== "idle") {
                    setCustomerEmailSent({
                      shipmentId: selectedShipmentId,
                      scenario,
                    });
                    try {
                      await fetch(
                        `/api/ships/${encodeURIComponent(selectedShipmentId)}/driver-route-notice-ack`,
                        { method: "POST" },
                      );
                    } catch {
                      /* best-effort */
                    }
                  }
                }}
              />
            </div>
          </section>
        )}

        {tab === "log" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.logTitle}</h3>
              <p className={shell.desc}>
                {main.logHint}
                {selectedShip ? (
                  <span className="mt-1 block font-mono text-[10px] text-[var(--accent)]">
                    {main.logScopeNote(selectedShip.id)}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="thin-scrollbar max-h-[min(56vh,520px)] overflow-y-auto px-4 py-3">
              {!selectedShip ? (
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  Select a load in the left panel to view its activity feed.
                </p>
              ) : messages.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  {main.logEmptyForLoad}
                </p>
              ) : null}
              {selectedShip
                ? messages.map((m) => {
                const initials = INITIALS[m.agent];
                return (
                  <div
                    key={m.id}
                    className="flex gap-3 border-b border-[var(--border)]/60 py-3 last:border-0"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--surface-card)] text-[9px] font-bold text-[var(--foreground)]">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-snug text-[var(--foreground)]">
                        {m.body}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[9px] text-[var(--muted)]">
                          {m.timestamp}
                        </span>
                        <span className="bg-white/8 px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                          {categoryFor(m.agent)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
                : null}
              {isRunning && selectedShip ? (
                <div className="flex gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--accent)]/30 bg-[var(--accent)]/10">
                    <span className="h-1.5 w-1.5 animate-pulse bg-[var(--accent)]" />
                  </div>
                  <div className="skeleton-shimmer flex-1 border border-[var(--border)] p-3">
                    <div className="h-1.5 w-1/3 bg-white/10" />
                    <div className="mt-1.5 h-1.5 w-full bg-white/5" />
                  </div>
                </div>
              ) : null}
              <div ref={logEndRef} />
            </div>
            <div className="flex justify-center border-t border-[var(--border)] py-2">
              <span className="flex h-8 w-8 items-center justify-center border border-[var(--border)] text-[10px] text-[var(--muted)]">
                ↓
              </span>
            </div>
          </section>
        )}
      </div>

      {tab === "flow" && flowAgentRunStatus ? (
        <FlowAgentRunPanel
          status={flowAgentRunStatus}
          onClear={() => setFlowAgentRunStatus(null)}
          onRefreshFleet={onRefreshFleet}
          getFlowAgentRunner={() => flowAgentRunnerRef.current}
          onRouteSaved={({ option }) => {
            showWorkspaceToast(main.workspaceToastRouteSaved(option));
            setTab("updated_route");
          }}
          onRouteOptOut={() => {
            showWorkspaceToast(main.workspaceToastRouteOptOut);
          }}
          onFacilityStopOrderSaved={() => {
            showWorkspaceToast(main.workspaceToastFacilityOrderSaved);
          }}
        />
      ) : null}
    </div>
  );
}

function LegendChip({
  label,
  accent,
  warn,
  danger,
  dashed,
  ok,
}: {
  label: string;
  accent?: boolean;
  warn?: boolean;
  danger?: boolean;
  dashed?: boolean;
  ok?: boolean;
}) {
  const color = accent
    ? "#d8f966"
    : warn
      ? "#fbbf24"
      : danger
        ? "#ef4444"
        : ok
          ? "#d8f966"
          : "#a3a3a3";
  return (
    <span className="flex items-center gap-1 border border-white/10 bg-black/75 px-2 py-0.5 text-[9px] text-[var(--muted)] backdrop-blur">
      <span
        className="inline-block h-2 w-4"
        style={{
          background: dashed ? "transparent" : color,
          border: dashed ? `1.5px dashed ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}
