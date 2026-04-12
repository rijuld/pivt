"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { RouteWeatherHit, UsMapDisplay } from "@/lib/weather-route-intersection";
import { main } from "@/lib/ui-copy";
import { WeatherAlertsMap } from "./WeatherAlertsMap";

type ApiPayload = {
  fetchedAt: string;
  totalAlerts: number;
  fleetRouteCount: number;
  routesWithAlerts: number;
  pointBufferKm: number;
  usMapDisplay: UsMapDisplay;
  hits: RouteWeatherHit[];
  error?: string;
};

function severityBadgeClass(severity: string): string {
  const u = severity.toLowerCase();
  if (u === "extreme") return "bg-rose-600/25 text-rose-200";
  if (u === "severe") return "bg-orange-500/20 text-orange-200";
  if (u === "moderate") return "bg-amber-500/20 text-amber-100";
  if (u === "minor") return "bg-emerald-500/15 text-emerald-200";
  return "bg-white/10 text-[var(--muted)]";
}

type WeatherEventsPanelProps = {
  /** Fires after a successful fetch so parents can reload ``/api/weather-snapshot`` from SQLite. */
  onLoaded?: () => void;
  /** Same order as Loads sidebar: weather attention first, then id (from ``/api/ships``). */
  fleetSortOrder?: string[];
};

function sortHitsByFleetOrder(
  hits: RouteWeatherHit[],
  fleetSortOrder: string[] | undefined,
): RouteWeatherHit[] {
  if (!fleetSortOrder?.length) {
    return [...hits].sort((a, b) => a.shipmentId.localeCompare(b.shipmentId));
  }
  const rank = new Map(fleetSortOrder.map((id, i) => [id, i]));
  return [...hits].sort((a, b) => {
    const ra = rank.get(a.shipmentId);
    const rb = rank.get(b.shipmentId);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.shipmentId.localeCompare(b.shipmentId);
  });
}

export function WeatherEventsPanel({
  onLoaded,
  fleetSortOrder,
}: WeatherEventsPanelProps) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/weather-events");
      const json = (await res.json()) as ApiPayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? main.weatherError);
        setData(null);
        return;
      }
      setData(json);
      onLoaded?.();
    } catch {
      setError(main.weatherError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const hitsSorted = useMemo(() => {
    if (!data?.hits?.length) return [];
    return sortHitsByFleetOrder(data.hits, fleetSortOrder);
  }, [data, fleetSortOrder]);

  if (loading && !data) {
    return (
      <p className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-[11px] text-[var(--muted)]">
        {main.weatherLoading}
      </p>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-300">
          {error}
        </p>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => void load()}
          className="border border-[var(--foreground)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)]"
        >
          {main.weatherRefresh}
        </motion.button>
      </div>
    );
  }

  if (!data) return null;

  const noFleet = data.fleetRouteCount === 0;
  const noOverlap = !noFleet && data.routesWithAlerts === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            {main.weatherSummary(
              data.totalAlerts,
              data.routesWithAlerts,
              data.fleetRouteCount,
              data.fetchedAt,
            )}
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
            {main.weatherBufferNote(data.pointBufferKm)}
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 border border-[var(--foreground)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)] disabled:opacity-50"
        >
          {loading ? main.weatherRefreshing : main.weatherRefresh}
        </motion.button>
      </div>

      <p className="text-[10px] text-[var(--muted)]">{main.weatherSource}</p>

      <div className="overflow-hidden border border-[var(--border)] bg-[var(--surface-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
            {main.weatherMapTitle}
          </h4>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
            {main.weatherMapDesc}
          </p>
        </div>
        <WeatherAlertsMap display={data.usMapDisplay ?? null} />
      </div>

      {noFleet ? (
        <p className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-[11px] text-[var(--muted)]">
          {main.weatherNoShips}
        </p>
      ) : null}

      {noOverlap && !noFleet ? (
        <p className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-[11px] text-[var(--muted)]">
          {main.weatherEmpty}
        </p>
      ) : null}

      <div className="space-y-4">
        {hitsSorted.map((row) => (
          <div
            key={row.shipmentId}
            className="border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="border-b border-[var(--border)] bg-[var(--surface-card)] px-3 py-2">
              <p className="font-mono text-[12px] font-semibold text-[var(--foreground)]">
                {row.shipmentId}
              </p>
              <p className="text-[10px] text-[var(--muted)]">{row.routeLabel}</p>
              <p className="mt-1 text-[9px] text-[var(--text-tertiary)]">
                {main.weatherIntersectCount(row.events.length)}
              </p>
            </div>
            <ul className="divide-y divide-[var(--border)]/80">
              {row.events.map((ev, i) => (
                <li key={`${row.shipmentId}-${ev.name}-${i}`} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[var(--foreground)]">
                      {ev.name}
                    </p>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[9px] font-semibold uppercase ${severityBadgeClass(ev.alertlevel)}`}
                    >
                      {ev.eventtype} · {ev.alertlevel}
                    </span>
                  </div>
                  {ev.country ? (
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {ev.country}
                    </p>
                  ) : null}
                  {ev.description ? (
                    <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-[var(--text-tertiary)]">
                      {ev.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-[var(--muted)]">
                    <span>
                      {ev.fromdate}
                      {ev.todate ? ` → ${ev.todate}` : ""}
                    </span>
                    {ev.reportUrl ? (
                      <a
                        href={ev.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {main.weatherReportLink}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
