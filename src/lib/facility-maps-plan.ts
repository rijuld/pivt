/**
 * Google Maps–backed facility / fulfilment planning: relay anchors, stop-order
 * permutations, alternates, and NWS corridor context — used by Facility Pivt.
 */
import { listLogisticsAnchorCoords } from "@/lib/db/airport-coords";
import type { DropOffStop } from "@/lib/drop-offs";
import { orderedDeliveryStops } from "@/lib/drop-offs";
import { fetchNwsActiveAlerts, summarizeNwsAlert } from "@/lib/nws-alerts";
import {
  fetchAlternateRoutes,
  fetchShipDirections,
  modeledTotalCostUsd,
  type AlternateRouteInfo,
} from "@/lib/google-route-options";
import type { ActiveShipment } from "@/lib/shipments";
import { intersectRoutesWithAlertFeatures } from "@/lib/weather-route-intersection";

function normCode(s: string): string {
  return s.trim().toUpperCase();
}

function haversineKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function permutationsMid<T>(items: T[], maxOut = 24): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  function rec(prefix: T[], rest: T[]) {
    if (out.length >= maxOut) return;
    if (rest.length === 0) {
      out.push(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      rec(
        [...prefix, rest[i]!],
        [...rest.slice(0, i), ...rest.slice(i + 1)],
      );
    }
  }
  rec([], items);
  return out;
}

function stopsToJson(stops: DropOffStop[]): string {
  return JSON.stringify(
    stops.map((s, i) => ({
      label: s.label,
      lat: s.lat,
      lng: s.lng,
      sequence: i + 1,
    })),
  );
}

function shipWithDropoffsJson(
  ship: ActiveShipment,
  stops: DropOffStop[],
): ActiveShipment {
  return { ...ship, dropOffsJson: stopsToJson(stops) };
}

export type FacilityRelayCandidate = {
  code: string;
  label: string;
  lat: number;
  lng: number;
  distance_mi: number;
  duration_min: number;
  total_cost_usd: number;
  summary: string;
  detour_minutes: number;
  detour_cost_usd: number;
};

export type FacilityStopOrderOption = {
  name: string;
  stop_order: string[];
  distance_mi: number;
  duration_min: number;
  total_cost_usd: number;
  summary: string;
};

export type FacilityMapsPlan = {
  source: "google_maps" | "insufficient_data";
  weather_event_count: number;
  weather_on_corridor: boolean;
  weather_alert_sample: string[];
  db_hub_configured: boolean;
  /** Haversine-only viability when SQLite hub lat/lng exist. */
  db_hub_viable: boolean | null;
  google_direct: {
    distance_mi: number;
    duration_min: number;
    total_cost_usd: number;
    summary: string;
  } | null;
  alternate_routes: AlternateRouteInfo[];
  /** Cheapest Google ``alternatives=true`` leg including SLA model. */
  best_alternate: (AlternateRouteInfo & { total_cost_usd: number }) | null;
  candidate_relays: FacilityRelayCandidate[];
  best_relay: FacilityRelayCandidate | null;
  stop_order_options: FacilityStopOrderOption[];
  best_stop_order: FacilityStopOrderOption | null;
  recommended_mode:
    | "db_hub_swap"
    | "maps_relay"
    | "reorder_drops"
    | "alternate_highway"
    | "stay_course";
  narrative: string;
};

function runDbHubViable(ship: ActiveShipment): {
  viable: boolean | null;
  configured: boolean;
  label: string;
} {
  const hubLng = ship.hubLng;
  const hubLat = ship.hubLat;
  const hubLabel = ship.hubLabel ?? "Hub";
  if (hubLng == null || hubLat == null) {
    return { viable: null, configured: false, label: hubLabel };
  }
  const distOriginDest = haversineKm(
    ship.originLng,
    ship.originLat,
    ship.destLng,
    ship.destLat,
  );
  const distHubDest = haversineKm(hubLng, hubLat, ship.destLng, ship.destLat);
  return {
    viable: distHubDest < distOriginDest * 0.95,
    configured: true,
    label: hubLabel,
  };
}

function pickRelayCandidates(
  ship: ActiveShipment,
  maxCandidates: number,
): { code: string; lat: number; lng: number }[] {
  const rf = normCode(ship.routeFrom);
  const rt = normCode(ship.routeTo);
  const midLat = (ship.originLat + ship.destLat) / 2;
  const midLng = (ship.originLng + ship.destLng) / 2;
  const anchors = listLogisticsAnchorCoords().filter(
    (a) => normCode(a.code) !== rf && normCode(a.code) !== rt,
  );
  const scored = anchors
    .map((a) => {
      const dVia =
        haversineKm(ship.originLng, ship.originLat, a.lng, a.lat) +
        haversineKm(a.lng, a.lat, ship.destLng, ship.destLat);
      const dDirect = haversineKm(
        ship.originLng,
        ship.originLat,
        ship.destLng,
        ship.destLat,
      );
      const detour = dVia - dDirect;
      const nearCorridor = haversineKm(midLng, midLat, a.lng, a.lat);
      return { a, score: detour + nearCorridor * 0.15 };
    })
    .filter(({ a }) => {
      const maxLeg = Math.max(
        haversineKm(ship.originLng, ship.originLat, a.lng, a.lat),
        haversineKm(a.lng, a.lat, ship.destLng, ship.destLat),
      );
      return maxLeg < 1400;
    })
    .sort((x, y) => x.score - y.score)
    .slice(0, maxCandidates)
    .map(({ a }) => a);
  return scored;
}

export async function buildFacilityMapsPlan(
  ship: ActiveShipment,
  fleet: ActiveShipment[],
  apiKey: string | null,
): Promise<FacilityMapsPlan> {
  const dbHub = runDbHubViable(ship);

  let collection: Awaited<ReturnType<typeof fetchNwsActiveAlerts>>;
  try {
    collection = await fetchNwsActiveAlerts();
  } catch {
    collection = { type: "FeatureCollection", features: [] };
  }
  const { hits } = intersectRoutesWithAlertFeatures(
    fleet,
    collection,
    summarizeNwsAlert,
  );
  const mine = hits.find((h) => h.shipmentId === ship.id);
  const weather_event_count = mine?.events.length ?? 0;
  const weather_on_corridor = weather_event_count > 0;
  const weather_alert_sample = (mine?.events ?? [])
    .slice(0, 4)
    .map((e) => `${e.name} (${e.eventtype})`);

  if (!apiKey) {
    return {
      source: "insufficient_data",
      weather_event_count,
      weather_on_corridor,
      weather_alert_sample,
      db_hub_configured: dbHub.configured,
      db_hub_viable: dbHub.viable,
      google_direct: null,
      alternate_routes: [],
      best_alternate: null,
      candidate_relays: [],
      best_relay: null,
      stop_order_options: [],
      best_stop_order: null,
      recommended_mode: "stay_course",
      narrative:
        "Google Maps API key is not configured — cannot score relay anchors or stop permutations.",
    };
  }

  const directLeg = await fetchShipDirections(ship, apiKey, {});
  const alternate_routes = await fetchAlternateRoutes(ship, apiKey);
  const best_alternate =
    alternate_routes.length > 0
      ? alternate_routes
          .map((r) => ({
            ...r,
            total_cost_usd: Math.round(
              modeledTotalCostUsd(ship, r.distanceMi, r.durationMin),
            ),
          }))
          .sort((a, b) => a.total_cost_usd - b.total_cost_usd)[0]!
      : null;

  const google_direct = directLeg
    ? {
        distance_mi: Math.round(directLeg.distanceMi),
        duration_min: Math.round(directLeg.durationMin),
        total_cost_usd: Math.round(
          modeledTotalCostUsd(
            ship,
            directLeg.distanceMi,
            directLeg.durationMin,
          ),
        ),
        summary: directLeg.summary,
      }
    : null;

  const directCost = google_direct?.total_cost_usd ?? Number.POSITIVE_INFINITY;
  const directDur = google_direct?.duration_min ?? 0;

  const relaySeeds = pickRelayCandidates(ship, 7);
  const candidate_relays: FacilityRelayCandidate[] = [];
  for (const a of relaySeeds) {
    const leg = await fetchShipDirections(ship, apiKey, {
      leadingViaPoints: [{ lat: a.lat, lng: a.lng }],
    });
    if (!leg) continue;
    const total = modeledTotalCostUsd(ship, leg.distanceMi, leg.durationMin);
    const totalR = Math.round(total);
    candidate_relays.push({
      code: a.code,
      label: `${a.code} cross-dock`,
      lat: a.lat,
      lng: a.lng,
      distance_mi: Math.round(leg.distanceMi),
      duration_min: Math.round(leg.durationMin),
      total_cost_usd: totalR,
      summary: leg.summary,
      detour_minutes: Math.round(leg.durationMin - directDur),
      detour_cost_usd: Math.round(total - directCost),
    });
  }
  candidate_relays.sort((x, y) => x.total_cost_usd - y.total_cost_usd);
  const best_relay = candidate_relays[0] ?? null;

  const stops = orderedDeliveryStops(ship);
  const stop_order_options: FacilityStopOrderOption[] = [];
  if (stops.length >= 2) {
    if (stops.length <= 5) {
      const perms = permutationsMid(stops, 120);
      let idx = 0;
      for (const perm of perms) {
        const altShip = shipWithDropoffsJson(ship, perm);
        const leg = await fetchShipDirections(altShip, apiKey, {});
        if (!leg) continue;
        const total = modeledTotalCostUsd(ship, leg.distanceMi, leg.durationMin);
        stop_order_options.push({
          name: `Permutation ${++idx}`,
          stop_order: perm.map((s) => s.label),
          distance_mi: Math.round(leg.distanceMi),
          duration_min: Math.round(leg.durationMin),
          total_cost_usd: Math.round(total),
          summary: leg.summary,
        });
      }
      stop_order_options.sort((a, b) => a.total_cost_usd - b.total_cost_usd);
    }
  }
  const best_stop_order = stop_order_options[0] ?? null;

  let recommended_mode: FacilityMapsPlan["recommended_mode"] = "stay_course";
  if (dbHub.configured && dbHub.viable === true) {
    recommended_mode = "db_hub_swap";
  } else if (
    best_stop_order &&
    best_stop_order.total_cost_usd < directCost * 0.985
  ) {
    recommended_mode = "reorder_drops";
  } else if (
    best_alternate &&
    best_alternate.total_cost_usd < directCost * 0.985 &&
    (!best_relay ||
      best_alternate.total_cost_usd < best_relay.total_cost_usd)
  ) {
    recommended_mode = "alternate_highway";
  } else if (
    best_relay &&
    (weather_on_corridor ||
      best_relay.total_cost_usd < directCost * 0.99 ||
      (best_relay.detour_minutes < 90 && best_relay.detour_cost_usd < 400))
  ) {
    recommended_mode = "maps_relay";
  }

  const parts: string[] = [];
  if (google_direct) {
    parts.push(
      `Direct (Google): ${google_direct.summary}, ${google_direct.distance_mi} mi, ` +
        `${google_direct.duration_min} min, modeled ~$${google_direct.total_cost_usd}.`,
    );
  }
  if (weather_on_corridor) {
    parts.push(
      `NWS: ${weather_event_count} alert intersection(s) on modeled corridor — consider detour, relay, or stop reorder.`,
    );
  }
  if (best_relay) {
    parts.push(
      `Best relay anchor ${best_relay.code}: ${best_relay.summary}, ` +
        `${best_relay.distance_mi} mi, ~$${best_relay.total_cost_usd} ` +
        `(Δ ${best_relay.detour_minutes} min vs direct).`,
    );
  }
  if (best_stop_order && recommended_mode === "reorder_drops") {
    parts.push(
      `Cheapest stop order (${best_stop_order.stop_order.join(" → ")}): ` +
        `~$${best_stop_order.total_cost_usd}, ${best_stop_order.duration_min} min.`,
    );
  }
  if (best_alternate && recommended_mode === "alternate_highway") {
    parts.push(
      `Google alternate #${best_alternate.routeIndex} (${best_alternate.summary}) ` +
        `~$${best_alternate.total_cost_usd} vs direct ~$${directCost}.`,
    );
  }
  if (parts.length === 0) {
    parts.push("Insufficient Google route data for this load.");
  }

  return {
    source: "google_maps",
    weather_event_count,
    weather_on_corridor,
    weather_alert_sample,
    db_hub_configured: dbHub.configured,
    db_hub_viable: dbHub.viable,
    google_direct,
    alternate_routes,
    best_alternate,
    candidate_relays,
    best_relay,
    stop_order_options: stop_order_options.slice(0, 8),
    best_stop_order,
    recommended_mode,
    narrative: parts.join(" "),
  };
}

export type FacilityAgentCore = {
  hub_viable: boolean;
  hub_label: string;
  recommendation: string;
  rationale: string;
  maps: FacilityMapsPlan;
};

export function synthesizeFacilityCore(
  ship: ActiveShipment,
  maps: FacilityMapsPlan,
): FacilityAgentCore {
  const db = runDbHubViable(ship);
  const directCost = maps.google_direct?.total_cost_usd ?? Number.POSITIVE_INFINITY;

  let hub_viable = false;
  let hub_label = ship.hubLabel ?? "Hub";
  let recommendation = "reroute";
  let rationale = maps.narrative;

  if (db.configured && db.viable === true) {
    hub_viable = true;
    hub_label = db.label;
    recommendation = "hub_inventory_swap";
    rationale =
      `Configured hub "${db.label}" is closer to consignee than the full lane span — ` +
      `inventory swap is viable. ${maps.narrative}`;
  } else if (maps.recommended_mode === "reorder_drops" && maps.best_stop_order) {
    hub_viable = true;
    hub_label = "Stop sequence (Google)";
    recommendation = "reorder_delivery_sequence";
    rationale =
      `Reordering intermediate drops lowers modeled cost vs current sequence: ` +
      `${maps.best_stop_order.stop_order.join(" → ")} (~$${maps.best_stop_order.total_cost_usd}). ` +
      maps.narrative;
  } else if (maps.recommended_mode === "alternate_highway" && maps.best_alternate) {
    hub_viable = true;
    hub_label = `Alt ${maps.best_alternate.routeIndex}: ${maps.best_alternate.summary}`;
    recommendation = "use_google_alternate";
    rationale =
      `Google Maps returned a cheaper alternate mainline than the default leg for this corridor. ` +
      maps.narrative;
  } else if (maps.recommended_mode === "maps_relay" && maps.best_relay) {
    hub_viable = true;
    hub_label = `${maps.best_relay.code} relay`;
    recommendation = maps.weather_on_corridor
      ? "relay_avoid_weather"
      : "relay_cost_optimization";
    rationale =
      `No hub coordinates on file — using Google Directions via anchor ${maps.best_relay.code} ` +
      `(${maps.best_relay.summary}, ~$${maps.best_relay.total_cost_usd}) as a cross-dock / ` +
      `inventory pivot vs direct ~$${directCost}. ` +
      maps.narrative;
  } else {
    hub_viable = false;
    if (!db.configured) {
      hub_label = ship.hubLabel ?? "Hub (no coords)";
    }
    recommendation = "reroute_or_monitor";
    rationale =
      `No configured hub coordinates and no compelling Google relay or reorder under current thresholds. ` +
      maps.narrative;
  }

  return { hub_viable, hub_label, recommendation, rationale, maps };
}
