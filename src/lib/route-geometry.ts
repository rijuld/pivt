import type { ActiveShipment } from "@/lib/shipments";
import { parseRouteVariantsJson } from "@/lib/route-variants";

function interpolateCorridor(
  o: { lng: number; lat: number },
  d: { lng: number; lat: number },
  segments = 6,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    out.push([
      o.lng + (d.lng - o.lng) * t,
      o.lat + (d.lat - o.lat) * t,
    ]);
  }
  return out;
}

/** GeoJSON positions [lng, lat] along the lane used for hazard intersection checks. */
export function routeLineCoordinatesForShipment(
  ship: ActiveShipment,
): [number, number][] {
  const v = parseRouteVariantsJson(ship.routeVariantsJson);
  if (v?.nominal?.length) {
    return v.nominal.map(([lng, lat]) => [lng, lat] as [number, number]);
  }
  return interpolateCorridor(
    { lng: ship.originLng, lat: ship.originLat },
    { lng: ship.destLng, lat: ship.destLat },
  );
}
