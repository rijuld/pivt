"use client";

import { useMemo, useState } from "react";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { CompanyProfile } from "@/lib/company-profile";
import {
  formatShipmentExtras,
  formatShipmentRoute,
  type ActiveShipment,
} from "@/lib/shipments";
import { BrandLogo } from "./BrandLogo";
import { ShipEditorModal } from "./ShipEditorModal";
import { app, sidebar } from "@/lib/ui-copy";
import type { WorkspaceTabId } from "@/lib/workspace-tab";

interface WarRoomSidebarProps {
  phase: MapPhase;
  activeScenario: ScenarioKind;
  fleet: ActiveShipment[];
  fleetLoading: boolean;
  fleetError: string | null;
  onRefreshFleet: () => void;
  selectedShipmentId: string | null;
  onSelectShipment: (id: string) => void;
  activeWorkspaceTab: WorkspaceTabId;
  onWorkspaceTab: (tab: WorkspaceTabId) => void;
  companyProfile: CompanyProfile | null;
  profileLoading: boolean;
  onEditProfile: () => void;
}

function friendlyLoadLabel(id: string) {
  return `Load ${id}`;
}

function shipmentBadge(
  s: ActiveShipment,
  phase: MapPhase,
  scenario: ScenarioKind,
): { icon: string; tone: "vip" | "wx" | "ok"; line: string } {
  if (s.isPrimary) {
    if (phase !== "nominal" && scenario === "blizzard") {
      return {
        icon: "★",
        tone: "vip",
        line: "Heavy weather — watch this lane",
      };
    }
    if (phase !== "nominal" && scenario === "port_strike") {
      return {
        icon: "★",
        tone: "vip",
        line: "Port disruption — coastal path blocked",
      };
    }
    return { icon: "★", tone: "vip", line: "On time · starred load" };
  }
  if (
    scenario === "blizzard" &&
    phase !== "nominal" &&
    (s.state === "PA" || s.state === "MD" || s.state === "NJ")
  ) {
    return { icon: "!", tone: "wx", line: "Weather watch nearby" };
  }
  if (scenario === "port_strike" && s.state === "NJ" && phase !== "nominal") {
    return { icon: "!", tone: "wx", line: "Near port — possible delay" };
  }
  return { icon: "✓", tone: "ok", line: "All clear" };
}

export function WarRoomSidebar({
  phase,
  activeScenario,
  fleet,
  fleetLoading,
  fleetError,
  onRefreshFleet,
  selectedShipmentId,
  onSelectShipment,
  activeWorkspaceTab,
  onWorkspaceTab,
  companyProfile,
  profileLoading,
  onEditProfile,
}: WarRoomSidebarProps) {
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; ship: ActiveShipment } | null
  >(null);

  const sidebarShipments = useMemo(() => {
    const primary = fleet.filter((s) => s.isPrimary);
    const rest = fleet.filter((s) => !s.isPrimary).slice(0, 6);
    return [...primary, ...rest];
  }, [fleet]);

  const laneCount = fleet.length;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-4">
        <BrandLogo fullWidth priority />
        <h1 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {app.name}
        </h1>
        <p className="mt-1 text-[12px] font-semibold leading-snug text-[var(--foreground)]">
          {profileLoading
            ? sidebar.profileLoading
            : (companyProfile?.companyName ?? "—")}
        </p>
        {companyProfile?.contactEmail ? (
          <p className="mt-0.5 truncate text-[10px] leading-snug text-[var(--muted)]">
            {companyProfile.contactEmail}
          </p>
        ) : null}
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">
          {fleetLoading ? "…" : sidebar.laneCount(laneCount)} ·{" "}
          {sidebar.assistHint}
        </p>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-4 px-0.5">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {sidebar.sectionFleetWide}
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onWorkspaceTab("weather")}
              className={`w-full border px-3 py-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                activeWorkspaceTab === "weather"
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/25"
                  : "border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--accent)]/40"
              }`}
            >
              <span className="block text-[11px] font-semibold text-[var(--foreground)]">
                {sidebar.weatherNavTitle}
              </span>
              <span className="mt-0.5 block text-[9px] leading-snug text-[var(--muted)]">
                {sidebar.weatherNavHint}
              </span>
            </button>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {sidebar.sectionLoads}
          </p>
          <button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className="border border-[var(--foreground)] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] hover:border-[var(--accent)]"
          >
            + {sidebar.addLoad}
          </button>
        </div>
        {fleetError && (
          <p className="mb-2 border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-[10px] leading-snug text-rose-300">
            {fleetError}
          </p>
        )}
        <div className="space-y-2">
          {fleetLoading && (
            <p className="px-0.5 text-[10px] text-[var(--muted)]">
              {sidebar.loadsLoading}
            </p>
          )}
          {!fleetLoading &&
            sidebarShipments.map((s) => {
              const b = shipmentBadge(s, phase, activeScenario);
              const extras = formatShipmentExtras(s);
              const selected = selectedShipmentId === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-start gap-2 border bg-[var(--surface-card)] p-2.5 transition ${
                    selected
                      ? "border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/30"
                      : `border-[var(--border)] ${s.isPrimary ? "ring-1 ring-[var(--accent)]/15" : ""}`
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectShipment(s.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  >
                    <ShipmentIcon icon={b.icon} tone={b.tone} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold text-[var(--foreground)]">
                        {friendlyLoadLabel(s.id)}
                      </p>
                      <p className="text-[10px] leading-snug text-[var(--muted)]">
                        {b.line} · {formatShipmentRoute(s)}
                      </p>
                      {extras && (
                        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[var(--text-tertiary)]">
                          {extras}
                        </p>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditor({ mode: "edit", ship: s });
                    }}
                    className="shrink-0 border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]"
                  >
                    {sidebar.editLoad}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] px-3 py-3">
        <p className="mb-2 px-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {sidebar.profileSection}
        </p>
        <button
          type="button"
          onClick={onEditProfile}
          disabled={profileLoading || !companyProfile}
          className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="block text-[11px] font-semibold text-[var(--foreground)]">
            {sidebar.editProfile}
          </span>
          <span className="mt-0.5 block text-[9px] leading-snug text-[var(--muted)]">
            {profileLoading
              ? sidebar.profileLoading
              : `${companyProfile?.city ?? "—"}${companyProfile?.state ? `, ${companyProfile.state}` : ""}`}
          </span>
        </button>
      </div>

      <ShipEditorModal
        open={editor !== null}
        mode={editor?.mode ?? "create"}
        ship={editor?.mode === "edit" ? editor.ship : null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          onRefreshFleet();
        }}
      />
    </div>
  );
}

function ShipmentIcon({
  icon,
  tone,
}: {
  icon: string;
  tone: "vip" | "wx" | "ok";
}) {
  const box: Record<typeof tone, string> = {
    vip: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    wx: "border-[var(--warn)]/40 bg-[var(--warn)]/15 text-[var(--warn)]",
    ok: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
  };
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center border text-[8px] font-bold ${box[tone]}`}
    >
      {icon}
    </div>
  );
}
