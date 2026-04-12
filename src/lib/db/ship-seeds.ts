import type { ActiveShipment } from "@/lib/shipments";
import { endpointsForLane } from "./airport-coords";

/** Serialized route overlays for the primary lane (Mapbox / fallback SVG). */
export const PRIMARY_ROUTE_VARIANTS_JSON = JSON.stringify({
  nominal: [
    [-74.006, 40.7128],
    [-76.2, 40.95],
    [-79.5, 41.2],
    [-82.3, 41.45],
    [-85.2, 41.65],
    [-87.6298, 41.8781],
  ],
  threat: [
    [-74.006, 40.7128],
    [-75.5, 41.0],
    [-77.8, 41.35],
    [-80.5, 41.5],
    [-84.0, 41.7],
    [-87.6298, 41.8781],
  ],
  resolution: [
    [-74.006, 40.7128],
    [-76.0, 40.4],
    [-78.0, 39.8],
    [-82.9988, 39.9612],
    [-85.5, 41.0],
    [-87.6298, 41.8781],
  ],
  portResolution: [
    [-74.006, 40.7128],
    [-75.15, 39.95],
    [-76.2, 39.95],
    [-80.0, 40.2],
    [-84.5, 41.2],
    [-87.6298, 41.8781],
  ],
});

/** Ordered drop-offs for the primary NYC → Midwest lane (seed + DB backfill). */
export const PRIMARY_DROP_OFFS_JSON = JSON.stringify([
  {
    label: "Cleveland, OH",
    lat: 41.4993,
    lng: -81.6944,
    sequence: 1,
  },
  {
    label: "Columbus, OH hub",
    lat: 39.9612,
    lng: -82.9988,
    sequence: 2,
  },
  {
    label: "Chicago, IL",
    lat: 41.8781,
    lng: -87.6298,
    sequence: 3,
  },
]);

/** Second demo load: BOS → Worcester → Buffalo (multi-stop). */
export const MA_2201_DROP_OFFS_JSON = JSON.stringify([
  {
    label: "Worcester, MA",
    lat: 42.2626,
    lng: -71.8023,
    sequence: 1,
  },
  {
    label: "Buffalo, NY",
    lat: 42.8864,
    lng: -78.8784,
    sequence: 2,
  },
]);

/** Demo CRM timeline for the primary load (Driver comms tab). */
export const PRIMARY_CRM_TIMELINE_JSON = JSON.stringify([
  {
    id: "t1",
    kind: "call",
    direction: "out",
    summary: "Outbound — ETA check before NYC departure",
    at: "13:58",
    party: "Nina → Marco",
  },
  {
    id: "t2",
    kind: "sms",
    direction: "in",
    summary: "Driver: on dock, loaded 14:05",
    at: "14:06",
    party: "Marco",
  },
  {
    id: "t3",
    kind: "email",
    direction: "out",
    summary: "Lane assignment & BOL attached",
    at: "14:10",
    party: "Dispatch",
  },
]);

const nullContacts = {
  notes: null,
  carrier: null,
  equipment: null,
  customerRef: null,
  driverName: null,
  driverPhone: null,
  driverEmail: null,
  driverOrg: null,
  dispatcherName: null,
  dispatcherPhone: null,
  dispatcherEmail: null,
  dispatcherOrg: null,
} as const;

function lane(
  id: string,
  state: string,
  region: ActiveShipment["region"],
  routeFrom: string,
  routeTo: string,
  isPrimary: boolean,
): ActiveShipment {
  const e = endpointsForLane(routeFrom, routeTo, state);
  return {
    id,
    state,
    region,
    routeFrom,
    routeTo,
    status: "nominal",
    isPrimary,
    ...nullContacts,
    originLng: e.originLng,
    originLat: e.originLat,
    destLng: e.destLng,
    destLat: e.destLat,
    originLabel: null,
    destLabel: null,
    hubLng: null,
    hubLat: null,
    hubLabel: null,
    stallLng: null,
    stallLat: null,
    altWaypointLng: null,
    altWaypointLat: null,
    priority: null,
    cargo: null,
    slaPenaltyPerHour: null,
    originalEta: null,
    blizzardCorridor: null,
    routeVariantsJson: null,
    crmTimelineJson: null,
    dropOffsJson: null,
  };
}

/**
 * Full dummy fleet — only referenced when seeding an empty SQLite DB.
 * The primary row carries corridor geometry + CRM extras used across the app.
 */
export const SHIP_SEED_ROWS: ActiveShipment[] = [
  {
    ...lane("NY-8472", "PA", "Mid-Atlantic", "NYC", "ORD", true),
    originLat: 40.7128,
    originLng: -74.006,
    destLat: 41.8781,
    destLng: -87.6298,
    originLabel: "New York, NY",
    destLabel: "Chicago, IL",
    hubLng: -82.9988,
    hubLat: 39.9612,
    hubLabel: "Columbus OH hub",
    stallLng: -77.0,
    stallLat: 41.0,
    altWaypointLng: -75.1652,
    altWaypointLat: 39.9526,
    priority: "High",
    cargo: "Medical Supplies",
    slaPenaltyPerHour: 500,
    originalEta: "2026-04-12T08:00:00Z",
    blizzardCorridor: "I-80 West (PA)",
    routeVariantsJson: PRIMARY_ROUTE_VARIANTS_JSON,
    crmTimelineJson: PRIMARY_CRM_TIMELINE_JSON,
    dropOffsJson: PRIMARY_DROP_OFFS_JSON,
  },
  {
    ...lane("MA-2201", "MA", "Northeast", "BOS", "BUF", false),
    destLat: 42.8864,
    destLng: -78.8784,
    destLabel: "Buffalo, NY",
    dropOffsJson: MA_2201_DROP_OFFS_JSON,
  },
  lane("NJ-4410", "NJ", "Mid-Atlantic", "EWR", "PHL", false),
  lane("PA-9932", "PA", "Mid-Atlantic", "PHL", "PIT", false),
  lane("MD-1102", "MD", "Mid-Atlantic", "BWI", "RIC", false),
  lane("VA-7781", "VA", "Mid-Atlantic", "IAD", "CLT", false),
  lane("GA-3300", "GA", "Southeast", "ATL", "JAX", false),
  lane("FL-9021", "FL", "Southeast", "MIA", "TPA", false),
  lane("TX-5510", "TX", "Southwest", "HOU", "DFW", false),
  lane("IL-2044", "IL", "Midwest", "ORD", "MSP", false),
  lane("OH-6612", "OH", "Midwest", "CMH", "CVG", false),
  lane("MI-4409", "MI", "Midwest", "DTW", "IND", false),
  lane("MN-7711", "MN", "Midwest", "MSP", "DSM", false),
  lane("MO-8820", "MO", "Midwest", "STL", "KC", false),
  lane("CO-1209", "CO", "Mountain", "DEN", "SLC", false),
  lane("AZ-3344", "AZ", "Southwest", "PHX", "TUS", false),
  lane("CA-9901", "CA", "Pacific", "LAX", "SFO", false),
  lane("WA-2207", "WA", "Pacific", "SEA", "PDX", false),
  lane("OR-1188", "OR", "Pacific", "PDX", "BOI", false),
  lane("TN-4455", "TN", "Southeast", "BNA", "MEM", false),
  lane("NC-6677", "NC", "Southeast", "CLT", "RDU", false),
  lane("WI-3012", "WI", "Midwest", "MKE", "CHI", false),
  lane("LA-8899", "LA", "Southeast", "MSY", "BTR", false),
];
