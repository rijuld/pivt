"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoogleOverviewMap } from "./GoogleOverviewMap";
import { ScenarioFooterPanel } from "./ScenarioFooterPanel";
import { ResponseFlowChart } from "./ResponseFlowChart";
import { DriverUpdatesPanel } from "./DriverUpdatesPanel";
import { WeatherEventsPanel } from "./WeatherEventsPanel";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { ActiveShipment } from "@/lib/shipments";
import { EXCEPTION_ALERTS } from "@/lib/constants";
import {
  routeOptionsForScenario,
  type RouteOptionRow,
} from "@/lib/routeOptions";
import {
  resolutionForShipment,
  resolutionWithShipmentId,
  type AgentId,
  type ResolutionOutput,
  type SimStep,
} from "@/lib/simulation";
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
  { id: "routes", label: main.tabRoutes },
  { id: "flow", label: main.tabFlow },
  {
    id: "drivers",
    label: main.tabComms,
    sub: main.tabCommsSubtitle,
  },
  { id: "log", label: main.tabLog },
];

const INITIALS: Record<AgentId, string> = {
  watchman: "RP",
  node_manager: "FP",
  negotiator: "OP",
  cfo: "CP",
  diplomat: "DP",
  system: "IG",
};

function categoryFor(agent: AgentId): string {
  return agentLabels[agent]?.category ?? "Update";
}

function routeCardTitle(label: string): string {
  const i = label.indexOf("—");
  return i >= 0 ? label.slice(i + 1).trim() : label;
}

function RouteCardBadges({
  row,
  alternativesApproved,
  routeApproval,
  selectedRouteOption,
}: {
  row: RouteOptionRow;
  alternativesApproved: boolean;
  routeApproval: { scenario: ScenarioKind; option: string } | null;
  selectedRouteOption: string | null;
}) {
  if (alternativesApproved && routeApproval?.option === row.option) {
    return (
      <span className="shrink-0 bg-[var(--accent)]/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]">
        Approved
      </span>
    );
  }
  if (!alternativesApproved && row.approved && selectedRouteOption === row.option) {
    return (
      <span className="shrink-0 bg-[var(--accent)]/15 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
        {main.routesSuggestedAndSelected}
      </span>
    );
  }
  if (!alternativesApproved && row.approved) {
    return (
      <span className="shrink-0 bg-white/8 px-2 py-0.5 text-[9px] font-medium text-[var(--muted)]">
        {main.routesSuggested}
      </span>
    );
  }
  if (!alternativesApproved && selectedRouteOption === row.option) {
    return (
      <span className="shrink-0 bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
        {main.routesSelected}
      </span>
    );
  }
  return null;
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
}: MainWorkspaceProps) {
  const selectedShip = useMemo((): ActiveShipment | null => {
    if (!selectedShipmentId) return null;
    return fleet.find((s) => s.id === selectedShipmentId) ?? null;
  }, [fleet, selectedShipmentId]);

  const primaryShip = useMemo(
    () => fleet.find((s) => s.isPrimary) ?? null,
    [fleet],
  );

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

  const [routeApproval, setRouteApproval] = useState<{
    scenario: ScenarioKind;
    option: string;
  } | null>(null);
  const [routeSuggestionPass, setRouteSuggestionPass] = useState(0);

  const [prevScenario, setPrevScenario] = useState(scenario);
  if (scenario !== prevScenario) {
    setPrevScenario(scenario);
    setRouteSuggestionPass(0);
    setRouteApproval(null);
  }

  const passForBundle = routeSuggestionPass;

  const defaultRouteOption = useMemo(() => {
    const kind = scenario === "idle" ? "blizzard" : scenario;
    const b = routeOptionsForScenario(kind, passForBundle, primaryShip);
    const rec = b.rows.find((r) => r.approved);
    return rec?.option ?? b.rows[0]?.option ?? null;
  }, [scenario, passForBundle, primaryShip]);

  const routeBundleKey = `${scenario}|${passForBundle}|${primaryShip?.id ?? ""}`;
  const [routeBundleSnapshot, setRouteBundleSnapshot] = useState(routeBundleKey);
  const [routeOptionOverride, setRouteOptionOverride] = useState<string | null>(
    null,
  );
  if (routeBundleKey !== routeBundleSnapshot) {
    setRouteBundleSnapshot(routeBundleKey);
    setRouteOptionOverride(null);
  }

  const selectedRouteOption =
    routeOptionOverride ?? defaultRouteOption;

  const alternativesApproved =
    scenario !== "idle" &&
    routeApproval !== null &&
    routeApproval.scenario === scenario;

  const canApproveAlternatives =
    scenario !== "idle" && !isRunning && resolution !== null;
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedShipmentId]);

  const alertText =
    scenario !== "idle" && phase !== "nominal"
      ? EXCEPTION_ALERTS[scenario]
      : null;

  const routeKind = scenario === "idle" ? "blizzard" : scenario;
  const bundle = routeOptionsForScenario(routeKind, passForBundle, primaryShip);

  const approvedChoiceLabel =
    alternativesApproved && routeApproval
      ? (bundle.rows.find((r) => r.option === routeApproval.option)?.label ??
        routeApproval.option)
      : "";

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

        {tab === "weather" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <h3 className={shell.title}>{main.weatherTitle}</h3>
              <p className={shell.desc}>{main.weatherDesc}</p>
            </div>
            <div className={shell.body}>
              <WeatherEventsPanel />
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
              />
            </div>
          </section>
        )}

        {tab === "routes" && (
          <section className={shell.card}>
            <div className={shell.head}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className={shell.title}>{bundle.title}</h3>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setRouteSuggestionPass((p) => p + 1);
                    setRouteApproval(null);
                  }}
                  className="shrink-0 border border-[var(--foreground)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] hover:border-[var(--accent)]"
                >
                  {main.suggestRoutes}
                </motion.button>
              </div>
              <p className={shell.desc}>{bundle.subtitle}</p>
              <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
                {main.routesTapHint}
              </p>
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-tertiary)]">
                {main.suggestRoutesHint}
              </p>
              {selectedShip ? (
                <p className="mt-2 font-mono text-[10px] text-[var(--accent)]">
                  {main.routesScopeNote(selectedShip.id)}
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-[var(--warn)]">
                  Select a load in the left panel to tie these options to a
                  shipment.
                </p>
              )}
            </div>

            <div
              className={`space-y-2 ${shell.body}`}
              role="radiogroup"
              aria-label="Route options"
            >
              {bundle.rows.map((row) => {
                const selected = selectedRouteOption === row.option;
                const locked = alternativesApproved;
                return (
                  <button
                    key={row.option}
                    type="button"
                    disabled={locked}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      if (!locked) setRouteOptionOverride(row.option);
                    }}
                    className={`w-full border text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                      selected
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] shadow-[inset_0_0_0_1px_rgba(216,249,102,0.12)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]/40 hover:bg-white/[0.02]"
                    } ${locked ? "cursor-default" : "cursor-pointer active:scale-[0.99]"}`}
                  >
                    <div className="flex gap-3 p-3.5">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center font-mono text-[13px] font-bold ${
                          selected
                            ? "bg-[var(--accent)]/25 text-[var(--accent)]"
                            : "bg-[var(--surface-card)] text-[var(--muted)]"
                        }`}
                        aria-hidden
                      >
                        {row.option}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-[var(--foreground)]">
                            {routeCardTitle(row.label)}
                          </span>
                          <RouteCardBadges
                            row={row}
                            alternativesApproved={alternativesApproved}
                            routeApproval={routeApproval}
                            selectedRouteOption={selectedRouteOption}
                          />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                          {row.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-[var(--muted)]">
                          <span>
                            <span className="text-[var(--text-tertiary)]">ETA</span>{" "}
                            {row.eta}
                          </span>
                          <span>
                            <span className="text-[var(--text-tertiary)]">Cost</span>{" "}
                            {row.cost}
                          </span>
                          <span className="text-[var(--warn)]">
                            <span className="text-[var(--text-tertiary)]">SLA risk</span>{" "}
                            {row.slaPenalty}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[var(--border)] px-4 py-4">
              {alternativesApproved ? (
                <div className="flex items-center gap-2 border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 text-[12px] font-medium text-[var(--accent)]">
                  <span aria-hidden>✓</span>
                  {main.approveAlternativesDone(approvedChoiceLabel)}
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <motion.button
                    type="button"
                    whileTap={{
                      scale:
                        canApproveAlternatives && selectedRouteOption
                          ? 0.98
                          : 1,
                    }}
                    disabled={
                      !canApproveAlternatives || selectedRouteOption === null
                    }
                    onClick={() => {
                      if (selectedRouteOption && scenario !== "idle") {
                        setRouteApproval({
                          scenario,
                          option: selectedRouteOption,
                        });
                      }
                    }}
                    className={`shrink-0 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition sm:min-w-[200px] ${
                      canApproveAlternatives && selectedRouteOption
                        ? "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                        : "cursor-not-allowed bg-[var(--surface-card)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {main.approveAlternatives}
                  </motion.button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[10px] leading-snug text-[var(--muted)]">
                      {main.approveAlternativesHint}
                    </p>
                    {!canApproveAlternatives && (
                      <p className="text-[10px] leading-snug text-[var(--warn)]">
                        {isRunning
                          ? main.approveAlternativesRunning
                          : scenario === "idle"
                            ? main.approveAlternativesWait
                            : !resolution
                              ? main.approveAlternativesNoResolution
                              : null}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--warn)]/25 bg-[var(--warn)]/[0.06] px-4 py-3">
              <p className="text-[10px] leading-relaxed text-[var(--warn)]">
                {bundle.riskBanner}
              </p>
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
                onSendCustomerDraft={() => {
                  if (selectedShipmentId && scenario !== "idle") {
                    setCustomerEmailSent({
                      shipmentId: selectedShipmentId,
                      scenario,
                    });
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
