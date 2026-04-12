import { NextResponse } from "next/server";
import {
  fetchDrivingPolylineLngLat,
  googleMapsServerApiKey,
} from "@/lib/google-directions-polyline";
import {
  extractNwsMapPoints,
  fetchNwsActiveAlerts,
  summarizeNwsAlert,
} from "@/lib/nws-alerts";
import { routeLineCoordinatesForShipment } from "@/lib/route-geometry";
import { buildUsMapDisplay } from "@/lib/us-albers-map";
import {
  POINT_EVENT_BUFFER_KM,
  intersectRoutesWithAlertFeatures,
} from "@/lib/weather-route-intersection";
import { listShips, saveWeatherEventsSnapshot } from "@/lib/db/ships-db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const ships = listShips();
    const collection = await fetchNwsActiveAlerts();
    const { hits: allHits, totalFeatures } = intersectRoutesWithAlertFeatures(
      ships,
      collection,
      summarizeNwsAlert,
    );
    const hits = allHits.filter((h) => h.events.length > 0);

    const mapPoints = extractNwsMapPoints(collection);

    const mapsKey = googleMapsServerApiKey();
    const routesForMap = await Promise.all(
      hits.map(async (h) => {
        const ship = ships.find((s) => s.id === h.shipmentId);
        if (!ship) return null;
        let coordinates = routeLineCoordinatesForShipment(ship);
        if (mapsKey) {
          try {
            const fromGoogle = await fetchDrivingPolylineLngLat(ship, mapsKey);
            if (fromGoogle && fromGoogle.length >= 2) {
              coordinates = fromGoogle;
            }
          } catch (e) {
            console.error("weather map directions", h.shipmentId, e);
          }
        }
        return { shipmentId: h.shipmentId, coordinates };
      }),
    );
    const routesFiltered = routesForMap.filter(
      (r): r is { shipmentId: string; coordinates: [number, number][] } =>
        r !== null,
    );

    const usMapDisplay = buildUsMapDisplay(mapPoints, routesFiltered);

    const body = {
      fetchedAt: new Date().toISOString(),
      totalAlerts: totalFeatures,
      fleetRouteCount: ships.length,
      routesWithAlerts: hits.length,
      pointBufferKm: POINT_EVENT_BUFFER_KM,
      usMapDisplay,
      hits,
    };
    try {
      saveWeatherEventsSnapshot(JSON.stringify(body));
    } catch (e) {
      console.error("weather snapshot save", e);
    }

    return NextResponse.json(body);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to load NWS weather alerts",
      },
      { status: 502 },
    );
  }
}
