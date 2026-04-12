import { feature, mesh } from "topojson-client";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import type {
  UsMapDisplay,
  UsMapProjectedMarker,
  UsMapRoutePath,
  WeatherMapPoint,
} from "@/lib/weather-route-intersection";
import countriesJson from "world-atlas/countries-110m.json";
import statesTopo from "us-atlas/states-10m.json";

export const US_MAP_VIEW_WIDTH = 720;
export const US_MAP_VIEW_HEIGHT = 450;

type Cached = {
  projection: ReturnType<typeof geoAlbersUsa>;
  landPathD: string;
  stateBordersPathD: string;
};

let cached: Cached | null = null;

function getUsAlbersCached(): Cached {
  if (cached) return cached;

  const topo = countriesJson as unknown as Parameters<typeof feature>[0];
  const countriesObj = (countriesJson as { objects: { countries: unknown } }).objects
    .countries;
  const fc = feature(topo, countriesObj as never) as unknown as FeatureCollection;
  const us = fc.features.find(
    (f) => (f.properties as { name?: string } | null)?.name === "United States of America",
  ) as Feature<Polygon | MultiPolygon> | undefined;

  if (!us) {
    throw new Error("US boundary not found in world-atlas countries-110m");
  }

  const projection = geoAlbersUsa().fitSize(
    [US_MAP_VIEW_WIDTH, US_MAP_VIEW_HEIGHT],
    us,
  );
  const pathGen = geoPath(projection);
  const landPathD = pathGen(us) ?? "";

  const statesObj = (
    statesTopo as unknown as {
      objects: { states: Parameters<typeof mesh>[1] };
    }
  ).objects.states;
  const stateMesh = mesh(
    statesTopo as unknown as Parameters<typeof mesh>[0],
    statesObj,
    (a, b) => a !== b,
  );
  const stateBordersPathD = pathGen(stateMesh as never) ?? "";

  cached = { projection, landPathD, stateBordersPathD };
  return cached;
}

/** Project lon/lat to SVG coords on the US Albers map, or null if outside the projection. */
export function projectLngLatToUsMap(
  lng: number,
  lat: number,
): [number, number] | null {
  const { projection } = getUsAlbersCached();
  const pt = projection([lng, lat]);
  if (!pt) return null;
  return [pt[0], pt[1]];
}

/** Build SVG payload: US outline, affected corridor polylines, and alert markers. */
export function buildUsMapDisplay(
  points: WeatherMapPoint[],
  routes?: { shipmentId: string; coordinates: [number, number][] }[],
): UsMapDisplay {
  const { projection, landPathD, stateBordersPathD } = getUsAlbersCached();
  const pathGen = geoPath(projection);
  const routePaths: UsMapRoutePath[] = [];

  if (routes?.length) {
    for (const r of routes) {
      if (r.coordinates.length < 2) continue;
      const ls: Feature<LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: r.coordinates },
      };
      const pathD = pathGen(ls);
      if (pathD) routePaths.push({ shipmentId: r.shipmentId, pathD });
    }
  }

  const markers: UsMapProjectedMarker[] = [];
  for (const p of points) {
    const proj = projectLngLatToUsMap(p.lng, p.lat);
    if (!proj) continue;
    markers.push({
      x: proj[0],
      y: proj[1],
      name: p.name,
      alertlevel: p.alertlevel,
      eventtype: p.eventtype,
    });
  }

  return {
    viewBoxWidth: US_MAP_VIEW_WIDTH,
    viewBoxHeight: US_MAP_VIEW_HEIGHT,
    landPathD,
    stateBordersPathD,
    routePaths,
    markers,
  };
}
