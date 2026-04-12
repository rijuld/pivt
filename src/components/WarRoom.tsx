"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyProfileModal } from "./CompanyProfileModal";
import { WarRoomSidebar } from "./WarRoomSidebar";
import { MainWorkspace } from "./MainWorkspace";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import type { CompanyProfile } from "@/lib/company-profile";
import type { ActiveShipment } from "@/lib/shipments";
import {
  welcomeStepForShipment,
  type ResolutionOutput,
  type SimStep,
} from "@/lib/simulation";
import type { WorkspaceTabId } from "@/lib/workspace-tab";

export default function WarRoom() {
  const [messagesByShipment, setMessagesByShipment] = useState<
    Record<string, SimStep[]>
  >({});
  const [phase] = useState<MapPhase>("nominal");
  const [scenario] = useState<ScenarioKind>("idle");
  const [resolution] = useState<ResolutionOutput | null>(null);

  const [fleet, setFleet] = useState<ActiveShipment[]>([]);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(
    null,
  );
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>("overview");

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("profile");
      const data = (await res.json()) as { profile: CompanyProfile };
      setCompanyProfile(data.profile);
    } catch {
      setCompanyProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const selectShipment = useCallback((id: string) => {
    setSelectedShipmentId(id);
    setWorkspaceTab("overview");
  }, []);

  const refreshFleet = useCallback(async () => {
    try {
      const res = await fetch("/api/ships");
      if (!res.ok) {
        throw new Error("Failed to load fleet");
      }
      const data = (await res.json()) as { ships: ActiveShipment[] };
      setFleet(data.ships);
      setFleetError(null);
    } catch (e) {
      setFleetError(
        e instanceof Error ? e.message : "Could not load fleet from API.",
      );
      setFleet([]);
    } finally {
      setFleetLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFleet();
  }, [refreshFleet]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (fleet.length === 0) {
      setSelectedShipmentId(null);
      return;
    }
    setSelectedShipmentId((prev) => {
      if (prev && fleet.some((s) => s.id === prev)) return prev;
      const primary = fleet.find((s) => s.isPrimary);
      return primary?.id ?? fleet[0].id;
    });
  }, [fleet]);

  useEffect(() => {
    setMessagesByShipment((prev) => {
      const keep = new Set(fleet.map((s) => s.id));
      const next: Record<string, SimStep[]> = {};
      for (const id of keep) {
        const existing = prev[id];
        const ship = fleet.find((s) => s.id === id)!;
        next[id] =
          existing && existing.length > 0
            ? existing
            : [welcomeStepForShipment(ship)];
      }
      return next;
    });
  }, [fleet]);

  const messagesForSelected =
    selectedShipmentId && messagesByShipment[selectedShipmentId]
      ? messagesByShipment[selectedShipmentId]
      : [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <aside className="flex w-[28%] min-w-[272px] max-w-[380px] shrink-0 flex-col">
        <WarRoomSidebar
          phase={phase}
          activeScenario={scenario}
          fleet={fleet}
          fleetLoading={fleetLoading}
          fleetError={fleetError}
          onRefreshFleet={refreshFleet}
          selectedShipmentId={selectedShipmentId}
          onSelectShipment={selectShipment}
          activeWorkspaceTab={workspaceTab}
          onWorkspaceTab={setWorkspaceTab}
          companyProfile={companyProfile}
          profileLoading={profileLoading}
          onEditProfile={() => setProfileModalOpen(true)}
        />
      </aside>
      <MainWorkspace
        phase={phase}
        scenario={scenario}
        isRunning={false}
        messages={messagesForSelected}
        resolution={resolution}
        fleet={fleet}
        selectedShipmentId={selectedShipmentId}
        onSelectShipment={selectShipment}
        workspaceTab={workspaceTab}
        onWorkspaceTabChange={setWorkspaceTab}
      />
      <CompanyProfileModal
        open={profileModalOpen}
        profile={companyProfile}
        onClose={() => setProfileModalOpen(false)}
        onSaved={() => {
          void refreshProfile();
        }}
      />
    </div>
  );
}
