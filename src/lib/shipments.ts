import type { MapPhase, ScenarioKind } from "./constants";
import { orderedDeliveryStops, shipRouteMidpointWithDrops } from "./drop-offs";

/** Census-style macro regions for grouping in the dashboard. */
export type USRegion =
  | "Northeast"
  | "Mid-Atlantic"
  | "Southeast"
  | "Midwest"
  | "Southwest"
  | "Mountain"
  | "Pacific";

export type ShipmentStatus = "nominal" | "at_risk" | "exception";

export interface ActiveShipment {
  id: string;
  state: string;
  region: USRegion;
  /** Required lane endpoints. */
  routeFrom: string;
  routeTo: string;
  status: ShipmentStatus;
  /** Focal demo shipment — drives agent swarm + primary route overlay. */
  isPrimary: boolean;
  /** Optional — free-form notes. */
  notes: string | null;
  /** Optional — motor carrier / SCAC. */
  carrier: string | null;
  /** Optional — equipment (e.g. dry van, reefer). */
  equipment: string | null;
  /** Optional — customer or PO reference. */
  customerRef: string | null;
  /** Optional — assigned driver (shown in Driver comms). */
  driverName: string | null;
  driverPhone: string | null;
  driverEmail: string | null;
  driverOrg: string | null;
  /** Optional — dispatcher / dispatch desk. */
  dispatcherName: string | null;
  dispatcherPhone: string | null;
  dispatcherEmail: string | null;
  dispatcherOrg: string | null;

  /** Lane geometry — stored in SQLite, seeded for demo loads. */
  originLng: number;
  originLat: number;
  destLng: number;
  destLat: number;
  originLabel: string | null;
  destLabel: string | null;
  hubLng: number | null;
  hubLat: number | null;
  hubLabel: string | null;
  stallLng: number | null;
  stallLat: number | null;
  /** e.g. Philadelphia cross-dock for port scenario */
  altWaypointLng: number | null;
  altWaypointLat: number | null;
  priority: string | null;
  cargo: string | null;
  slaPenaltyPerHour: number | null;
  originalEta: string | null;
  blizzardCorridor: string | null;
  /** JSON: { nominal, threat, resolution, portResolution } as [lng,lat][][] */
  routeVariantsJson: string | null;
  crmTimelineJson: string | null;
  /**
   * JSON array of ordered drop-offs `{ label, lat, lng, sequence? }`.
   * Last entry is the final delivery (kept in sync with dest_*).
   */
  dropOffsJson: string | null;
}

export function formatShipmentRoute(s: ActiveShipment): string {
  const stops = orderedDeliveryStops(s);
  if (stops.length <= 1) {
    return `${s.routeFrom} → ${s.routeTo}`;
  }
  const short = (label: string) => label.split(",")[0]?.trim() || label;
  return `${s.routeFrom} → ${stops.map((x) => short(x.label)).join(" → ")}`;
}

/** Midpoint of origin + all delivery stops — heatmaps & alert proximity. */
export function shipRouteMidpoint(s: ActiveShipment): { lng: number; lat: number } {
  return shipRouteMidpointWithDrops(s);
}

/** Compact line for list views — optional fields only. */
export function formatShipmentExtras(s: ActiveShipment): string | null {
  const parts: string[] = [];
  if (s.carrier?.trim()) parts.push(s.carrier.trim());
  if (s.equipment?.trim()) parts.push(s.equipment.trim());
  if (s.customerRef?.trim()) parts.push(`Ref ${s.customerRef.trim()}`);
  if (s.notes?.trim()) parts.push(s.notes.trim());
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function primaryShipment(
  fleet: ActiveShipment[],
): ActiveShipment | null {
  return fleet.find((s) => s.isPrimary) ?? null;
}

/** Alert epicenters for heatmap + proximity (scenario + DB-backed primary / app settings). */
export function alertEpicenter(
  scenario: ScenarioKind,
  primary: ActiveShipment | null,
  portEpicenter: { lng: number; lat: number } | null,
): { lng: number; lat: number } | null {
  if (scenario === "blizzard") {
    if (primary?.stallLng != null && primary.stallLat != null) {
      return { lng: primary.stallLng, lat: primary.stallLat };
    }
    if (primary) return shipRouteMidpoint(primary);
    return null;
  }
  if (scenario === "port_strike" && portEpicenter) return portEpicenter;
  return null;
}

function roughlyNear(
  lng: number,
  lat: number,
  center: { lng: number; lat: number },
  degLng: number,
  degLat: number,
) {
  return (
    Math.abs(lng - center.lng) <= degLng && Math.abs(lat - center.lat) <= degLat
  );
}

/** Shipments considered “in the alert zone” for KPI + heatmap weighting. */
export function shipmentsInAlertZone(
  fleet: ActiveShipment[],
  scenario: ScenarioKind,
  phase: MapPhase,
  portEpicenter: { lng: number; lat: number } | null,
): ActiveShipment[] {
  if (phase === "nominal" || scenario === "idle") return [];
  const primary = primaryShipment(fleet);
  const c = alertEpicenter(scenario, primary, portEpicenter);
  if (!c) return [];
  const box =
    scenario === "blizzard"
      ? { degLng: 4.5, degLat: 3.5 }
      : { degLng: 3.2, degLat: 2.8 };
  return fleet.filter((s) => {
    const p = shipRouteMidpoint(s);
    return roughlyNear(p.lng, p.lat, c, box.degLng, box.degLat);
  });
}

function hash(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Synthetic “caller” density — clustered near the alert epicenter.
 * Weight falls off with distance; a subset of real shipment positions
 * in-zone get boosted so the heat ties to live fleet data.
 */
export function buildCallerHeatmapGeoJSON(
  fleet: ActiveShipment[],
  scenario: ScenarioKind,
  phase: MapPhase,
  portEpicenter: { lng: number; lat: number } | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (phase === "nominal" || scenario === "idle") {
    return { type: "FeatureCollection", features: [] };
  }
  const primary = primaryShipment(fleet);
  const center = alertEpicenter(scenario, primary, portEpicenter);
  if (!center) return { type: "FeatureCollection", features: [] };

  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const inZone = shipmentsInAlertZone(fleet, scenario, phase, portEpicenter);

  for (let i = 0; i < 55; i++) {
    const t = i / 55;
    const angle = t * Math.PI * 2 * 6 + hash(i) * 4;
    const r = 0.15 + hash(i + 3) * (0.35 + (i % 7) * 0.08);
    const lng = center.lng + Math.cos(angle) * r * 1.1;
    const lat = center.lat + Math.sin(angle) * r * 0.85;
    const distWeight = Math.max(0.2, 1 - r * 1.8);
    const w = 2 + Math.floor(distWeight * 8) + (i % 4);
    features.push({
      type: "Feature",
      properties: { weight: w },
      geometry: { type: "Point", coordinates: [lng, lat] },
    });
  }

  for (let j = 0; j < inZone.length; j++) {
    const s = inZone[j]!;
    const base = shipRouteMidpoint(s);
    for (let k = 0; k < 3; k++) {
      const lng =
        base.lng + (hash(j * 17 + k) - 0.5) * 0.35 + (k - 1) * 0.05;
      const lat =
        base.lat + (hash(j * 31 + k + 9) - 0.5) * 0.28 + (k - 1) * 0.04;
      features.push({
        type: "Feature",
        properties: { weight: 6 + (j % 5) },
        geometry: { type: "Point", coordinates: [lng, lat] },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

export function groupShipmentsByRegion(
  fleet: ActiveShipment[],
): Record<USRegion, ActiveShipment[]> {
  const out = {} as Record<USRegion, ActiveShipment[]>;
  const order: USRegion[] = [
    "Northeast",
    "Mid-Atlantic",
    "Southeast",
    "Midwest",
    "Southwest",
    "Mountain",
    "Pacific",
  ];
  for (const r of order) out[r] = [];
  for (const s of fleet) {
    out[s.region].push(s);
  }
  for (const r of order) {
    out[r]!.sort((a, b) => a.state.localeCompare(b.state));
  }
  return out;
}

export function countByStateInRegion(
  region: USRegion,
  fleet: ActiveShipment[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of fleet) {
    if (s.region !== region) continue;
    counts[s.state] = (counts[s.state] ?? 0) + 1;
  }
  return counts;
}

/** @deprecated Prefer importing `SHIP_SEED_ROWS` from `@/lib/db/ship-seeds`. */
export { SHIP_SEED_ROWS as SEED_SHIPMENTS } from "./db/ship-seeds";
