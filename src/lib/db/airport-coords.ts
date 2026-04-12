import { coordsForState } from "@/lib/state-centroids";

/**
 * Approximate lat/lng for IATA-style lane codes used in demo seeds.
 * Fallback: state centroid when the code is unknown.
 */
const AIRPORT_COORDS: Record<string, { lat: number; lng: number }> = {
  NYC: { lat: 40.7128, lng: -74.006 },
  CHI: { lat: 41.8781, lng: -87.6298 },
  ORD: { lat: 41.9786, lng: -87.9048 },
  BOS: { lat: 42.3656, lng: -71.0096 },
  BUF: { lat: 42.9405, lng: -78.7322 },
  EWR: { lat: 40.6895, lng: -74.1745 },
  PHL: { lat: 39.8744, lng: -75.2424 },
  PIT: { lat: 40.4915, lng: -80.2329 },
  BWI: { lat: 39.1754, lng: -76.6683 },
  RIC: { lat: 37.5052, lng: -77.3197 },
  IAD: { lat: 38.9531, lng: -77.4565 },
  CLT: { lat: 35.2144, lng: -80.9473 },
  ATL: { lat: 33.6407, lng: -84.4277 },
  JAX: { lat: 30.4941, lng: -81.6879 },
  MIA: { lat: 25.7959, lng: -80.287 },
  TPA: { lat: 27.9755, lng: -82.5332 },
  HOU: { lat: 29.9902, lng: -95.3368 },
  DFW: { lat: 32.8998, lng: -97.0403 },
  MSP: { lat: 44.8848, lng: -93.2223 },
  CMH: { lat: 39.998, lng: -82.8919 },
  CVG: { lat: 39.0488, lng: -84.6678 },
  DTW: { lat: 42.2124, lng: -83.3534 },
  IND: { lat: 39.7173, lng: -86.2944 },
  DSM: { lat: 41.534, lng: -93.6631 },
  STL: { lat: 38.7487, lng: -90.37 },
  KC: { lat: 39.2976, lng: -94.7139 },
  DEN: { lat: 39.8561, lng: -104.6737 },
  SLC: { lat: 40.7899, lng: -111.9791 },
  PHX: { lat: 33.4346, lng: -112.0117 },
  TUS: { lat: 32.1161, lng: -110.941 },
  LAX: { lat: 33.9425, lng: -118.4081 },
  SFO: { lat: 37.6213, lng: -122.379 },
  SEA: { lat: 47.4502, lng: -122.3088 },
  PDX: { lat: 45.5887, lng: -122.5975 },
  BOI: { lat: 43.5644, lng: -116.2228 },
  BNA: { lat: 36.1245, lng: -86.6782 },
  MEM: { lat: 35.0424, lng: -89.9767 },
  RDU: { lat: 35.8776, lng: -78.7875 },
  MKE: { lat: 42.9472, lng: -87.8966 },
  MSY: { lat: 29.9911, lng: -90.2592 },
  BTR: { lat: 30.5332, lng: -91.1565 },
};

function norm(code: string): string {
  return code.trim().toUpperCase();
}

export function airportCoordForCode(
  code: string,
  stateFallback: string,
): { lat: number; lng: number } {
  const c = AIRPORT_COORDS[norm(code)];
  if (c) return c;
  return coordsForState(stateFallback);
}

export function endpointsForLane(
  routeFrom: string,
  routeTo: string,
  state: string,
): {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
} {
  const o = airportCoordForCode(routeFrom, state);
  const d = airportCoordForCode(routeTo, state);
  return {
    originLat: o.lat,
    originLng: o.lng,
    destLat: d.lat,
    destLng: d.lng,
  };
}
