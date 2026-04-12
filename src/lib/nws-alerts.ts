import { centroid } from "@turf/turf";
import type { Feature, FeatureCollection } from "geojson";
import type {
  WeatherEventSummary,
  WeatherMapPoint,
} from "@/lib/weather-route-intersection";

export const NWS_ALERTS_ACTIVE_URL = "https://api.weather.gov/alerts/active";

/** NOAA requires a descriptive User-Agent. Set `NWS_USER_AGENT` in production. */
function nwsUserAgent(): string {
  const fromEnv = process.env.NWS_USER_AGENT?.trim();
  if (fromEnv) return fromEnv;
  return "(EIS War Room, weather-integration@localhost)";
}

function representativeLngLat(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Point") {
    const [lng, lat] = g.coordinates as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
  }
  try {
    const c = centroid(f as Feature);
    if (c.geometry.type !== "Point") return null;
    const [lng, lat] = c.geometry.coordinates as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
  } catch {
    return null;
  }
}

function featureId(f: Feature): string | null {
  const withId = f as Feature & { id?: string };
  if (typeof withId.id === "string" && withId.id.length > 0) return withId.id;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const pid = p["@id"] ?? p.id;
  if (typeof pid === "string" && pid.length > 0) return pid;
  return null;
}

export function summarizeNwsAlert(f: Feature): WeatherEventSummary {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const g = f.geometry;
  return {
    name: String(p.headline ?? p.event ?? "Weather alert"),
    eventtype: String(p.event ?? "—"),
    alertlevel: String(p.severity ?? "—"),
    description: String(p.description ?? ""),
    country: "United States",
    fromdate: String(p.effective ?? p.sent ?? ""),
    todate: p.expires != null ? String(p.expires) : null,
    reportUrl: featureId(f),
    geometryType: g?.type ?? "unknown",
  };
}

export function extractNwsMapPoints(collection: FeatureCollection): WeatherMapPoint[] {
  const out: WeatherMapPoint[] = [];
  for (const raw of collection.features) {
    if (!raw || raw.type !== "Feature") continue;
    const f = raw as Feature;
    const coords = representativeLngLat(f);
    if (!coords) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    out.push({
      lng: coords[0],
      lat: coords[1],
      name: String(p.headline ?? p.event ?? "Alert"),
      alertlevel: String(p.severity ?? ""),
      eventtype: String(p.event ?? ""),
    });
  }
  return out;
}

export async function fetchNwsActiveAlerts(): Promise<FeatureCollection> {
  const res = await fetch(NWS_ALERTS_ACTIVE_URL, {
    headers: {
      "User-Agent": nwsUserAgent(),
      Accept: "application/geo+json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`NWS alerts HTTP ${res.status}`);
  }
  const data = (await res.json()) as FeatureCollection;
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("Invalid NWS GeoJSON response");
  }
  return data;
}
