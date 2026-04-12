import polyline from "@mapbox/polyline";
import { intermediateDropCoordinates } from "@/lib/drop-offs";
import type { ActiveShipment } from "@/lib/shipments";

const DIRECTIONS_JSON =
  "https://maps.googleapis.com/maps/api/directions/json";

type DirectionsJson = {
  status: string;
  error_message?: string;
  routes?: { overview_polyline?: { points?: string } }[];
};

/** Prefer server-only key; fallback matches client Maps usage. */
export function googleMapsServerApiKey(): string | null {
  const k =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return k || null;
}

/**
 * Full driving route [lng, lat][] from Google Directions overview polyline
 * (same service family as the browser Directions API on the overview map).
 * Uses SQLite-backed origin/destination coordinates on each load.
 */
export async function fetchDrivingPolylineLngLat(
  ship: ActiveShipment,
  apiKey: string,
): Promise<[number, number][] | null> {
  const params = new URLSearchParams();
  params.set("key", apiKey);
  params.set("mode", "driving");
  params.set("origin", `${ship.originLat},${ship.originLng}`);
  params.set("destination", `${ship.destLat},${ship.destLng}`);
  const mids = intermediateDropCoordinates(ship);
  if (mids.length > 0) {
    params.set(
      "waypoints",
      mids.map((w) => `via:${w.lat},${w.lng}`).join("|"),
    );
  }

  const url = `${DIRECTIONS_JSON}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as DirectionsJson;
  if (data.status !== "OK") {
    if (data.error_message) {
      console.warn(
        "Google Directions:",
        data.status,
        data.error_message.slice(0, 120),
      );
    }
    return null;
  }

  const encoded = data.routes?.[0]?.overview_polyline?.points;
  if (!encoded) return null;

  const latLng = polyline.decode(encoded);
  if (latLng.length < 2) return null;
  return latLng.map(([lat, lng]) => [lng, lat] as [number, number]);
}
