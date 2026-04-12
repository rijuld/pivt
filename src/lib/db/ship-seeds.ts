import type { ActiveShipment } from "@/lib/shipments";
import { endpointsForLane } from "./airport-coords";

const MID_STOPS_PER_LANE = 2;

/**
 * Two intermediate coordinates along the origin→dest segment plus a final stop
 * at the lane destination (same as ``endpointsForLane``). Used for every
 * generic fleet row so routes and Maps see multiple mid-destinations.
 */
export function defaultMultiMidDropOffsJson(
  routeFrom: string,
  routeTo: string,
  state: string,
): string {
  const { originLat, originLng, destLat, destLng } = endpointsForLane(
    routeFrom,
    routeTo,
    state,
  );
  const stops: Array<{
    label: string;
    lat: number;
    lng: number;
    sequence: number;
  }> = [];
  for (let i = 1; i <= MID_STOPS_PER_LANE; i++) {
    const t = i / (MID_STOPS_PER_LANE + 1);
    stops.push({
      label: `Mid-stop ${i} (${routeFrom} → ${routeTo})`,
      lat: Math.round((originLat + (destLat - originLat) * t) * 1e6) / 1e6,
      lng: Math.round((originLng + (destLng - originLng) * t) * 1e6) / 1e6,
      sequence: i,
    });
  }
  stops.push({
    label: `${routeTo} (final)`,
    lat: destLat,
    lng: destLng,
    sequence: MID_STOPS_PER_LANE + 1,
  });
  return JSON.stringify(stops);
}

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
    label: "Toledo, OH",
    lat: 41.6528,
    lng: -83.5379,
    sequence: 2,
  },
  {
    label: "Columbus, OH hub",
    lat: 39.9612,
    lng: -82.9988,
    sequence: 3,
  },
  {
    label: "Chicago, IL",
    lat: 41.8781,
    lng: -87.6298,
    sequence: 4,
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
    label: "Albany, NY",
    lat: 42.6526,
    lng: -73.7562,
    sequence: 2,
  },
  {
    label: "Rochester, NY",
    lat: 43.1566,
    lng: -77.6088,
    sequence: 3,
  },
  {
    label: "Buffalo, NY",
    lat: 42.8864,
    lng: -78.8784,
    sequence: 4,
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

/** Per-load CRM for seeded ships — must align 1:1 with ``SHIP_SEED_ROWS`` order. */
const SEED_ROW_CRM: Array<{
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  driverOrg: string;
  dispatcherName: string;
  dispatcherPhone: string;
  dispatcherEmail: string;
  dispatcherOrg: string;
}> = [
  {
    driverName: "Marco Ruiz",
    driverPhone: "+1 (412) 555-0142",
    driverEmail: "m.ruiz@midlandfreight.example.com",
    driverOrg: "Midland Freight",
    dispatcherName: "Nina Patel",
    dispatcherPhone: "+1 (800) 555-0199",
    dispatcherEmail: "dispatch@midlandfreight.example.com",
    dispatcherOrg: "Midland Freight Dispatch",
  },
  {
    driverName: "Elena Vasquez",
    driverPhone: "+1 (617) 555-0181",
    driverEmail: "e.vasquez@baystatehaul.example.com",
    driverOrg: "Bay State Haulage",
    dispatcherName: "Marcus Webb",
    dispatcherPhone: "+1 (800) 555-0122",
    dispatcherEmail: "m.webb@baystatehaul.example.com",
    dispatcherOrg: "Bay State Dispatch",
  },
  {
    driverName: "Jordan Miles",
    driverPhone: "+1 (973) 555-0163",
    driverEmail: "j.miles@metroline.example.com",
    driverOrg: "MetroLine Carriers",
    dispatcherName: "Alicia Chen",
    dispatcherPhone: "+1 (800) 555-0134",
    dispatcherEmail: "a.chen@metroline.example.com",
    dispatcherOrg: "MetroLine Control",
  },
  {
    driverName: "Sam Okonkwo",
    driverPhone: "+1 (215) 555-0144",
    driverEmail: "s.okonkwo@keystonefreight.example.com",
    driverOrg: "Keystone Freight",
    dispatcherName: "Priya Singh",
    dispatcherPhone: "+1 (800) 555-0145",
    dispatcherEmail: "p.singh@keystonefreight.example.com",
    dispatcherOrg: "Keystone Ops Desk",
  },
  {
    driverName: "Rosa Delgado",
    driverPhone: "+1 (410) 555-0176",
    driverEmail: "r.delgado@columbiacartage.example.com",
    driverOrg: "Columbia Cartage",
    dispatcherName: "Tom Brennan",
    dispatcherPhone: "+1 (800) 555-0177",
    dispatcherEmail: "t.brennan@columbiacartage.example.com",
    dispatcherOrg: "Columbia Dispatch",
  },
  {
    driverName: "Chris Park",
    driverPhone: "+1 (703) 555-0188",
    driverEmail: "c.park@atlanticrelay.example.com",
    driverOrg: "Atlantic Relay",
    dispatcherName: "Denise Hart",
    dispatcherPhone: "+1 (800) 555-0189",
    dispatcherEmail: "d.hart@atlanticrelay.example.com",
    dispatcherOrg: "Atlantic Relay Central",
  },
  {
    driverName: "Andre Williams",
    driverPhone: "+1 (404) 555-0190",
    driverEmail: "a.williams@southeastmotor.example.com",
    driverOrg: "Southeast Motor Lines",
    dispatcherName: "Nina Patel",
    dispatcherPhone: "+1 (800) 555-0191",
    dispatcherEmail: "dispatch.se@southeastmotor.example.com",
    dispatcherOrg: "SEML Dispatch",
  },
  {
    driverName: "Luis Herrera",
    driverPhone: "+1 (305) 555-0102",
    driverEmail: "l.herrera@gulfcoastltl.example.com",
    driverOrg: "Gulf Coast LTL",
    dispatcherName: "Marcus Webb",
    dispatcherPhone: "+1 (800) 555-0103",
    dispatcherEmail: "m.webb@gulfcoastltl.example.com",
    dispatcherOrg: "Gulf Coast Control",
  },
  {
    driverName: "Tanya Brooks",
    driverPhone: "+1 (713) 555-0114",
    driverEmail: "t.brooks@lonestarlogistics.example.com",
    driverOrg: "Lone Star Logistics",
    dispatcherName: "Alicia Chen",
    dispatcherPhone: "+1 (800) 555-0115",
    dispatcherEmail: "a.chen@lonestarlogistics.example.com",
    dispatcherOrg: "Lone Star Dispatch",
  },
  {
    driverName: "James Okafor",
    driverPhone: "+1 (312) 555-0126",
    driverEmail: "j.okafor@greatlakeshaul.example.com",
    driverOrg: "Great Lakes Haul",
    dispatcherName: "Priya Singh",
    dispatcherPhone: "+1 (800) 555-0127",
    dispatcherEmail: "p.singh@greatlakeshaul.example.com",
    dispatcherOrg: "Great Lakes Desk",
  },
  {
    driverName: "Megan Flores",
    driverPhone: "+1 (614) 555-0138",
    driverEmail: "m.flores@ohiovalley.example.com",
    driverOrg: "Ohio Valley Transport",
    dispatcherName: "Tom Brennan",
    dispatcherPhone: "+1 (800) 555-0139",
    dispatcherEmail: "t.brennan@ohiovalley.example.com",
    dispatcherOrg: "Ohio Valley Dispatch",
  },
  {
    driverName: "David Kowalski",
    driverPhone: "+1 (734) 555-0140",
    driverEmail: "d.kowalski@motorcityfreight.example.com",
    driverOrg: "Motor City Freight",
    dispatcherName: "Denise Hart",
    dispatcherPhone: "+1 (800) 555-0141",
    dispatcherEmail: "d.hart@motorcityfreight.example.com",
    dispatcherOrg: "Motor City Control",
  },
  {
    driverName: "Amira Hassan",
    driverPhone: "+1 (612) 555-0152",
    driverEmail: "a.hassan@northstartruck.example.com",
    driverOrg: "North Star Trucking",
    dispatcherName: "Nina Patel",
    dispatcherPhone: "+1 (800) 555-0153",
    dispatcherEmail: "dispatch@northstartruck.example.com",
    dispatcherOrg: "North Star Dispatch",
  },
  {
    driverName: "Tyrell Jackson",
    driverPhone: "+1 (314) 555-0164",
    driverEmail: "t.jackson@gatewaycargo.example.com",
    driverOrg: "Gateway Cargo",
    dispatcherName: "Marcus Webb",
    dispatcherPhone: "+1 (800) 555-0165",
    dispatcherEmail: "m.webb@gatewaycargo.example.com",
    dispatcherOrg: "Gateway Dispatch",
  },
  {
    driverName: "Sofia Ramirez",
    driverPhone: "+1 (303) 555-0176",
    driverEmail: "s.ramirez@rockymtn.example.com",
    driverOrg: "Rocky Mountain Express",
    dispatcherName: "Alicia Chen",
    dispatcherPhone: "+1 (800) 555-0177",
    dispatcherEmail: "a.chen@rockymtn.example.com",
    dispatcherOrg: "Rocky Mountain Ops",
  },
  {
    driverName: "Kevin O'Brien",
    driverPhone: "+1 (602) 555-0188",
    driverEmail: "k.obrien@sonoradesert.example.com",
    driverOrg: "Sonora Desert Lines",
    dispatcherName: "Priya Singh",
    dispatcherPhone: "+1 (800) 555-0189",
    dispatcherEmail: "p.singh@sonoradesert.example.com",
    dispatcherOrg: "Sonora Dispatch",
  },
  {
    driverName: "Yuki Tanaka",
    driverPhone: "+1 (310) 555-0190",
    driverEmail: "y.tanaka@pacificrim.example.com",
    driverOrg: "Pacific Rim Transport",
    dispatcherName: "Tom Brennan",
    dispatcherPhone: "+1 (800) 555-0191",
    dispatcherEmail: "t.brennan@pacificrim.example.com",
    dispatcherOrg: "Pacific Rim Control",
  },
  {
    driverName: "Hannah Nguyen",
    driverPhone: "+1 (206) 555-0102",
    driverEmail: "h.nguyen@cascadetruck.example.com",
    driverOrg: "Cascade Trucking",
    dispatcherName: "Denise Hart",
    dispatcherPhone: "+1 (800) 555-0103",
    dispatcherEmail: "d.hart@cascadetruck.example.com",
    dispatcherOrg: "Cascade Dispatch",
  },
  {
    driverName: "Ethan Cole",
    driverPhone: "+1 (503) 555-0114",
    driverEmail: "e.cole@willamettefreight.example.com",
    driverOrg: "Willamette Freight",
    dispatcherName: "Nina Patel",
    dispatcherPhone: "+1 (800) 555-0115",
    dispatcherEmail: "dispatch@willamettefreight.example.com",
    dispatcherOrg: "Willamette Ops",
  },
  {
    driverName: "Monica Reyes",
    driverPhone: "+1 (615) 555-0126",
    driverEmail: "m.reyes@musiccityhaul.example.com",
    driverOrg: "Music City Haul",
    dispatcherName: "Marcus Webb",
    dispatcherPhone: "+1 (800) 555-0127",
    dispatcherEmail: "m.webb@musiccityhaul.example.com",
    dispatcherOrg: "Music City Dispatch",
  },
  {
    driverName: "Greg Foster",
    driverPhone: "+1 (704) 555-0138",
    driverEmail: "g.foster@carolinacargo.example.com",
    driverOrg: "Carolina Cargo",
    dispatcherName: "Alicia Chen",
    dispatcherPhone: "+1 (800) 555-0139",
    dispatcherEmail: "a.chen@carolinacargo.example.com",
    dispatcherOrg: "Carolina Control",
  },
  {
    driverName: "Irene Novak",
    driverPhone: "+1 (414) 555-0140",
    driverEmail: "i.novak@lakemichigan.example.com",
    driverOrg: "Lake Michigan Motor",
    dispatcherName: "Priya Singh",
    dispatcherPhone: "+1 (800) 555-0141",
    dispatcherEmail: "p.singh@lakemichigan.example.com",
    dispatcherOrg: "Lake Michigan Desk",
  },
  {
    driverName: "Camille Broussard",
    driverPhone: "+1 (504) 555-0166",
    driverEmail: "c.broussard@bayouhaul.example.com",
    driverOrg: "Bayou Haul LLC",
    dispatcherName: "Denise Hart",
    dispatcherPhone: "+1 (800) 555-0167",
    dispatcherEmail: "d.hart@bayouhaul.example.com",
    dispatcherOrg: "Bayou Dispatch",
  },
];

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
    dropOffsJson: defaultMultiMidDropOffsJson(routeFrom, routeTo, state),
    optimizingSelectedRoute: null,
    optimizingRouteOptOut: false,
  };
}

/**
 * Full dummy fleet — only referenced when seeding an empty SQLite DB.
 * The primary row carries corridor geometry + CRM extras used across the app.
 */
const SHIP_SEED_ROWS_BASE: ActiveShipment[] = [
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

if (SHIP_SEED_ROWS_BASE.length !== SEED_ROW_CRM.length) {
  throw new Error(
    `SHIP_SEED_ROWS_BASE (${SHIP_SEED_ROWS_BASE.length}) must match SEED_ROW_CRM (${SEED_ROW_CRM.length})`,
  );
}

/** Seeded ships with ``driver_*`` / ``dispatcher_*`` columns populated for demo CRM. */
const SHIP_SEED_ROWS_MERGED: ActiveShipment[] = [];
for (let i = 0; i < SHIP_SEED_ROWS_BASE.length; i++) {
  SHIP_SEED_ROWS_MERGED.push({
    ...SHIP_SEED_ROWS_BASE[i]!,
    ...SEED_ROW_CRM[i]!,
  });
}
export const SHIP_SEED_ROWS = SHIP_SEED_ROWS_MERGED;
