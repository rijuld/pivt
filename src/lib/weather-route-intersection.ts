import { buffer, booleanIntersects, lineString } from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import type { ActiveShipment } from "@/lib/shipments";
import { formatShipmentRoute } from "@/lib/shipments";
import { routeLineCoordinatesForShipment } from "@/lib/route-geometry";

/** Point alert centroids use this buffer (km) vs route lines. */
export const POINT_EVENT_BUFFER_KM = 200;

export interface WeatherEventSummary {
  name: string;
  eventtype: string;
  alertlevel: string;
  description: string;
  country: string;
  fromdate: string;
  todate: string | null;
  reportUrl: string | null;
  geometryType: string;
}

export interface RouteWeatherHit {
  shipmentId: string;
  routeLabel: string;
  events: WeatherEventSummary[];
}

export interface WeatherMapPoint {
  lng: number;
  lat: number;
  name: string;
  alertlevel: string;
  eventtype: string;
}

/** SVG payload for the weather tab US map (projected server-side). */
export interface UsMapProjectedMarker {
  x: number;
  y: number;
  name: string;
  alertlevel: string;
  eventtype: string;
}

export interface UsMapRoutePath {
  shipmentId: string;
  /** SVG `d` for the corridor polyline in US Albers space */
  pathD: string;
}

export interface UsMapDisplay {
  viewBoxWidth: number;
  viewBoxHeight: number;
  landPathD: string;
  /** Internal US state borders (projected), from Census topojson mesh */
  stateBordersPathD?: string;
  /** Affected corridors only */
  routePaths: UsMapRoutePath[];
  markers: UsMapProjectedMarker[];
}

function featureIntersectsLine(
  routeLine: Feature<LineString>,
  disaster: Feature,
): boolean {
  const g = disaster.geometry;
  if (!g) return false;

  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    return booleanIntersects(
      routeLine,
      disaster as Feature<Polygon | MultiPolygon>,
    );
  }

  if (g.type === "Point") {
    const pt = disaster as Feature<Point>;
    const zone = buffer(pt, POINT_EVENT_BUFFER_KM, {
      units: "kilometers",
    });
    if (!zone) return false;
    return booleanIntersects(routeLine, zone);
  }

  if (g.type === "LineString") {
    return booleanIntersects(routeLine, disaster as Feature<LineString>);
  }

  if (g.type === "MultiLineString") {
    return booleanIntersects(routeLine, disaster as Feature<MultiLineString>);
  }

  return false;
}

export function intersectRoutesWithAlertFeatures(
  ships: ActiveShipment[],
  collection: FeatureCollection,
  summarizeFeature: (f: Feature) => WeatherEventSummary,
): { hits: RouteWeatherHit[]; totalFeatures: number } {
  const totalFeatures = collection.features.length;
  const hits: RouteWeatherHit[] = [];

  for (const ship of ships) {
    const coords = routeLineCoordinatesForShipment(ship);
    if (coords.length < 2) continue;

    const routeLine = lineString(coords) as Feature<LineString>;
    const matched: WeatherEventSummary[] = [];

    for (const feature of collection.features) {
      if (!feature || feature.type !== "Feature") continue;
      try {
        if (featureIntersectsLine(routeLine, feature as Feature)) {
          matched.push(summarizeFeature(feature as Feature));
        }
      } catch {
        /* skip malformed geometries */
      }
    }

    hits.push({
      shipmentId: ship.id,
      routeLabel: formatShipmentRoute(ship),
      events: matched,
    });
  }

  return { hits, totalFeatures };
}
