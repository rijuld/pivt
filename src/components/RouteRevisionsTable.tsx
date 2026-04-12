"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActiveShipment } from "@/lib/shipments";
import { main } from "@/lib/ui-copy";

type RevisionRow = {
  id: number;
  createdAt: string;
  summary: string;
  dropOffsJson: string | null;
  stopPreview: string;
  optimizingSelectedRoute: string | null;
  optimizingRouteOptOut: boolean;
};

function revisionMatchesLive(r: RevisionRow, ship: ActiveShipment): boolean {
  return (
    (r.dropOffsJson ?? null) === (ship.dropOffsJson ?? null) &&
    (r.optimizingSelectedRoute ?? null) ===
      (ship.optimizingSelectedRoute ?? null) &&
    r.optimizingRouteOptOut === ship.optimizingRouteOptOut
  );
}

export function RouteRevisionsTable({
  shipId,
  currentShip,
  onAfterRevert,
}: {
  shipId: string;
  currentShip: ActiveShipment;
  onAfterRevert?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/ships/${encodeURIComponent(shipId)}/route-revisions`,
      );
      const data = (await res.json()) as {
        revisions?: RevisionRow[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(
          typeof data.error === "string" ? data.error : main.routeRevisionsLoadError,
        );
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.revisions) ? data.revisions : []);
    } catch {
      setLoadError(main.routeRevisionsLoadError);
      setRows([]);
    }
  }, [shipId]);

  useEffect(() => {
    void load();
  }, [
    load,
    currentShip.dropOffsJson,
    currentShip.optimizingSelectedRoute,
    currentShip.optimizingRouteOptOut,
  ]);

  const revert = useCallback(
    async (revisionId: number) => {
      setBusyId(revisionId);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/ships/${encodeURIComponent(shipId)}/route-revisions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revisionId }),
          },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setLoadError(
            typeof data.error === "string"
              ? data.error
              : main.routeRevisionsRevertError,
          );
          return;
        }
        await onAfterRevert?.();
        await load();
      } catch {
        setLoadError(main.routeRevisionsRevertError);
      } finally {
        setBusyId(null);
      }
    },
    [load, onAfterRevert, shipId],
  );

  if (rows === null) {
    return (
      <p className="text-[11px] text-[var(--muted)]">{main.routeRevisionsLoading}</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
        {main.routeRevisionsEmpty}
      </p>
    );
  }

  const matchingIds = rows
    .filter((r) => revisionMatchesLive(r, currentShip))
    .map((r) => r.id);
  const canonicalLiveId =
    matchingIds.length > 0 ? Math.max(...matchingIds) : -1;

  return (
    <div className="space-y-2">
      {loadError ? (
        <p className="text-[11px] text-rose-300">{loadError}</p>
      ) : null}
      <div className="thin-scrollbar max-h-[min(40vh,320px)] overflow-auto rounded border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-card)] text-[var(--text-tertiary)]">
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColWhen}
              </th>
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColSummary}
              </th>
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColStops}
              </th>
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColRoute}
              </th>
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColOptOut}
              </th>
              <th className="px-2 py-2 font-semibold uppercase tracking-wide">
                {main.routeRevisionsColAction}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isLive =
                revisionMatchesLive(r, currentShip) && r.id === canonicalLiveId;
              return (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[var(--foreground)]">
                    {r.createdAt}
                  </td>
                  <td className="max-w-[11rem] px-2 py-2 text-[var(--muted)]">
                    {r.summary}
                  </td>
                  <td className="max-w-[14rem] px-2 py-2 text-[var(--foreground)]">
                    {r.stopPreview}
                  </td>
                  <td className="px-2 py-2 font-mono text-[var(--foreground)]">
                    {r.optimizingSelectedRoute ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-[var(--muted)]">
                    {r.optimizingRouteOptOut ? main.routeRevisionsYes : main.routeRevisionsNo}
                  </td>
                  <td className="px-2 py-2">
                    {isLive ? (
                      <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--accent)]">
                        {main.routeRevisionsCurrentBadge}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void revert(r.id)}
                        className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)]/50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyId === r.id
                          ? main.routeRevisionsReverting
                          : main.routeRevisionsRevert}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
