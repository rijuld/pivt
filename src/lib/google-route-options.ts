/**
 * Google Maps Directions-backed route alternatives with modeled costs.
 *
 * For each shipment, we compute up to three route alternatives:
 *   Direct (default routing)
 *   Via hub/waypoint when the shipment has hub coordinates
 *   Avoid highways (often longer distance/time; not always lowest modeled cost)
 *
 * Cost model:  fuel (distance × $/mi) + tolls (flat estimate) + time penalty.
 * SLA penalty is modeled from `slaPenaltyPerHour` × hours over baseline.
 */
import { intermediateDropCoordinates } from "@/lib/drop-offs";
import type { ActiveShipment } from "@/lib/shipments";
import type { RouteOptionRow } from "@/lib/routeOptions";

const DIRECTIONS_JSON =
  "https://maps.googleapis.com/maps/api/directions/json";

const METERS_PER_MILE = 1609.344;

/** Rough per-mile cost in USD (fuel + wear). */
const COST_PER_MILE = 1.82;

/** Flat toll estimate per 100 mi of highway driving. */
const TOLL_PER_100MI = 12;

/** Extra per-hour "opportunity cost" of truck time on the road. */
const TIME_COST_PER_HOUR = 38;

type DirectionsLeg = {
  distance?: { value?: number };
  duration?: { value?: number };
};
type DirectionsRoute = {
  legs?: DirectionsLeg[];
  summary?: string;
  overview_polyline?: { points?: string };
};
type DirectionsJson = {
  status: string;
  error_message?: string;
  routes?: DirectionsRoute[];
};

/** Which Google Directions request shape produced this option (stable after letter re-sort). */
export type ComputedRouteProfile = "direct" | "hub" | "avoid_highways";

export interface ComputedRouteOption {
  option: string;
  label: string;
  description: string;
  eta: string;
  cost: string;
  slaPenalty: string;
  approved: boolean;
  distanceMi: number;
  durationMin: number;
  costUsd: number;
  slaPenaltyUsd: number;
  routeSummary: string;
  routeProfile: ComputedRouteProfile;
  /** Encoded path from ``overview_polyline`` when the Directions call succeeded. */
  encodedPolyline: string | null;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtEta(minutes: number): string {
  const h = Math.round(minutes / 60);
  if (h < 1) return `${Math.round(minutes)} min`;
  return `${h} h`;
}

async function fetchDirections(
  ship: ActiveShipment,
  apiKey: string,
  options: { avoidHighways?: boolean; waypoints?: string },
): Promise<{
  distanceMi: number;
  durationMin: number;
  summary: string;
  encodedPolyline: string | null;
} | null> {
  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("mode", "driving");
  params.set("origin", `${ship.originLat},${ship.originLng}`);
  params.set("destination", `${ship.destLat},${ship.destLng}`);
  if (options.avoidHighways) params.set("avoid", "highways");
  if (options.waypoints) params.set("waypoints", options.waypoints);
  params.set("alternatives", "false");

  const url = `${DIRECTIONS_JSON}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as DirectionsJson;
  if (data.status !== "OK" || !data.routes?.length) return null;

  const route = data.routes[0];
  let totalMeters = 0;
  let totalSeconds = 0;
  for (const leg of route.legs ?? []) {
    totalMeters += leg.distance?.value ?? 0;
    totalSeconds += leg.duration?.value ?? 0;
  }
  const encodedPolyline = route.overview_polyline?.points ?? null;
  return {
    distanceMi: totalMeters / METERS_PER_MILE,
    durationMin: totalSeconds / 60,
    summary: route.summary ?? "—",
    encodedPolyline,
  };
}

function costForRoute(distMi: number, durationMin: number): number {
  const fuel = distMi * COST_PER_MILE;
  const tolls = (distMi / 100) * TOLL_PER_100MI;
  const time = (durationMin / 60) * TIME_COST_PER_HOUR;
  return fuel + tolls + time;
}

/** Modeled drive cost (fuel + toll heuristic + time) in USD — same basis as route options. */
export function modeledDriveCostUsd(
  distanceMi: number,
  durationMin: number,
): number {
  return costForRoute(distanceMi, durationMin);
}

function slaPenalty(ship: ActiveShipment, durationMin: number): number {
  const rate = ship.slaPenaltyPerHour ?? 0;
  if (rate <= 0) return 0;
  const baselineHours = 24;
  const hours = durationMin / 60;
  const overHours = Math.max(0, hours - baselineHours);
  return overHours * rate;
}

/** Drive + SLA exposure (when SLA rate is set) in USD. */
export function modeledTotalCostUsd(
  ship: ActiveShipment,
  distanceMi: number,
  durationMin: number,
): number {
  return costForRoute(distanceMi, durationMin) + slaPenalty(ship, durationMin);
}

/**
 * Driving directions for the shipment lane, optionally inserting ``via`` points
 * **before** intermediate drop-offs (relay → mids → final).
 */
export async function fetchShipDirections(
  ship: ActiveShipment,
  apiKey: string,
  opts: {
    avoidHighways?: boolean;
    leadingViaPoints?: Array<{ lat: number; lng: number }>;
  } = {},
): Promise<{
  distanceMi: number;
  durationMin: number;
  summary: string;
  encodedPolyline: string | null;
} | null> {
  const mids = intermediateDropCoordinates(ship);
  const viaParts: string[] = [];
  for (const p of opts.leadingViaPoints ?? []) {
    viaParts.push(`via:${p.lat},${p.lng}`);
  }
  for (const w of mids) {
    viaParts.push(`via:${w.lat},${w.lng}`);
  }
  const waypoints = viaParts.length > 0 ? viaParts.join("|") : undefined;
  return fetchDirections(ship, apiKey, {
    waypoints,
    avoidHighways: opts.avoidHighways,
  });
}

/**
 * Compute up to 3 Google-Maps-backed route options for a shipment.
 * Falls back to hardcoded data when no API key or all calls fail.
 */
export async function computeRouteOptions(
  ship: ActiveShipment,
  apiKey: string | null,
): Promise<ComputedRouteOption[]> {
  if (!apiKey) return [];

  const mids = intermediateDropCoordinates(ship);
  const midWaypoints =
    mids.length > 0
      ? mids.map((w) => `via:${w.lat},${w.lng}`).join("|")
      : undefined;

  const hubWaypoints =
    ship.hubLng != null && ship.hubLat != null
      ? `via:${ship.hubLat},${ship.hubLng}`
      : undefined;

  const [directResult, hubResult, avoidHwyResult] = await Promise.all([
    fetchDirections(ship, apiKey, { waypoints: midWaypoints }),
    hubWaypoints
      ? fetchDirections(ship, apiKey, {
          waypoints: [hubWaypoints, midWaypoints].filter(Boolean).join("|"),
        })
      : Promise.resolve(null),
    fetchDirections(ship, apiKey, {
      avoidHighways: true,
      waypoints: midWaypoints,
    }),
  ]);

  const results: ComputedRouteOption[] = [];

  if (directResult) {
    const c = costForRoute(directResult.distanceMi, directResult.durationMin);
    const p = slaPenalty(ship, directResult.durationMin);
    results.push({
      option: "A",
      label: "A — Direct / Fastest",
      description: `Direct route via ${directResult.summary}. Fastest ETA, highway tolls apply.`,
      eta: fmtEta(directResult.durationMin),
      cost: fmtUsd(c),
      slaPenalty: p > 0 ? fmtUsd(p) : "—",
      approved: false,
      distanceMi: Math.round(directResult.distanceMi),
      durationMin: Math.round(directResult.durationMin),
      costUsd: Math.round(c),
      slaPenaltyUsd: Math.round(p),
      routeSummary: directResult.summary,
      routeProfile: "direct",
      encodedPolyline: directResult.encodedPolyline,
    });
  }

  if (hubResult) {
    const c = costForRoute(hubResult.distanceMi, hubResult.durationMin);
    const p = slaPenalty(ship, hubResult.durationMin);
    results.push({
      option: "B",
      label: `B — Via ${ship.hubLabel ?? "hub"}`,
      description: `Hub relay via ${ship.hubLabel ?? "waypoint"} (${hubResult.summary}). Potential inventory swap.`,
      eta: fmtEta(hubResult.durationMin),
      cost: fmtUsd(c),
      slaPenalty: p > 0 ? fmtUsd(p) : "—",
      approved: false,
      distanceMi: Math.round(hubResult.distanceMi),
      durationMin: Math.round(hubResult.durationMin),
      costUsd: Math.round(c),
      slaPenaltyUsd: Math.round(p),
      routeSummary: hubResult.summary,
      routeProfile: "hub",
      encodedPolyline: hubResult.encodedPolyline,
    });
  }

  if (avoidHwyResult) {
    const c = costForRoute(
      avoidHwyResult.distanceMi,
      avoidHwyResult.durationMin,
    );
    const p = slaPenalty(ship, avoidHwyResult.durationMin);
    results.push({
      option: hubResult ? "C" : "B",
      label: hubResult
        ? "C — Avoid highways / Cheapest"
        : "B — Avoid highways / Cheapest",
      description: `No-highway route via ${avoidHwyResult.summary}. Avoids limited-access highways; often slower and may cost more than the direct leg.`,
      eta: fmtEta(avoidHwyResult.durationMin),
      cost: fmtUsd(c),
      slaPenalty: p > 0 ? fmtUsd(p) : "—",
      approved: false,
      distanceMi: Math.round(avoidHwyResult.distanceMi),
      durationMin: Math.round(avoidHwyResult.durationMin),
      costUsd: Math.round(c),
      slaPenaltyUsd: Math.round(p),
      routeSummary: avoidHwyResult.summary,
      routeProfile: "avoid_highways",
      encodedPolyline: avoidHwyResult.encodedPolyline,
    });
  }

  results.sort((a, b) => a.costUsd - b.costUsd);

  const minCost = Math.min(...results.map((r) => r.costUsd));
  const minDur = Math.min(...results.map((r) => r.durationMin));

  results.forEach((r, i) => {
    const letter = String.fromCharCode(65 + i);
    r.option = letter;
    const cheapest = r.costUsd === minCost;
    const fastest = r.durationMin === minDur;
    const tag = cheapest && fastest
      ? "Best value"
      : cheapest
        ? "Cheapest"
        : fastest
          ? "Fastest"
          : "Balanced";
    r.label = `${letter} — ${tag}`;
  });

  if (results.length > 0) {
    const mid = results.length >= 3 ? 1 : 0;
    results[mid].approved = true;
  }

  return results;
}

export interface AlternateRouteInfo {
  routeIndex: number;
  summary: string;
  distanceMi: number;
  durationMin: number;
  costUsd: number;
}

/**
 * Fetch Google Maps alternate driving routes (``alternatives=true``) for a shipment.
 * Returns up to 3 route alternatives with distance, duration, and modeled cost.
 */
export async function fetchAlternateRoutes(
  ship: ActiveShipment,
  apiKey: string,
): Promise<AlternateRouteInfo[]> {
  const mids = intermediateDropCoordinates(ship);
  const midWaypoints =
    mids.length > 0
      ? mids.map((w) => `via:${w.lat},${w.lng}`).join("|")
      : undefined;

  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("mode", "driving");
  params.set("origin", `${ship.originLat},${ship.originLng}`);
  params.set("destination", `${ship.destLat},${ship.destLng}`);
  if (midWaypoints) params.set("waypoints", midWaypoints);
  params.set("alternatives", "true");

  const url = `${DIRECTIONS_JSON}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as DirectionsJson;
  if (data.status !== "OK" || !data.routes?.length) return [];

  return data.routes.map((route, idx) => {
    let totalMeters = 0;
    let totalSeconds = 0;
    for (const leg of route.legs ?? []) {
      totalMeters += leg.distance?.value ?? 0;
      totalSeconds += leg.duration?.value ?? 0;
    }
    const distMi = totalMeters / METERS_PER_MILE;
    const durMin = totalSeconds / 60;
    return {
      routeIndex: idx + 1,
      summary: route.summary ?? `Route ${idx + 1}`,
      distanceMi: Math.round(distMi),
      durationMin: Math.round(durMin),
      costUsd: Math.round(costForRoute(distMi, durMin)),
    };
  });
}

/** Convert ComputedRouteOption[] → RouteOptionRow[] for the existing UI. */
export function toRouteOptionRows(
  computed: ComputedRouteOption[],
): RouteOptionRow[] {
  return computed.map((r) => ({
    option: r.option,
    label: r.label,
    description: r.description,
    eta: r.eta,
    cost: r.cost,
    slaPenalty: r.slaPenalty,
    approved: r.approved,
  }));
}
