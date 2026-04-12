export type DropOffStop = {
  label: string;
  lat: number;
  lng: number;
  sequence?: number;
};

function sortStops(stops: DropOffStop[]): DropOffStop[] {
  const hasSeq = stops.some((s) => s.sequence != null);
  if (!hasSeq) return [...stops];
  return [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

/**
 * Parse JSON array of drop-off stops. Returns null if missing or invalid.
 * Last stop in the array is the final delivery (must align with dest_* when set).
 */
export function parseDropOffsFromJson(
  raw: string | null | undefined,
): DropOffStop[] | null {
  if (raw == null || String(raw).trim() === "") return null;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: DropOffStop[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      const label = String(o.label ?? "").trim() || "Stop";
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const sequence =
        o.sequence != null && Number.isFinite(Number(o.sequence))
          ? Number(o.sequence)
          : undefined;
      out.push({ label, lat, lng, sequence });
    }
    if (out.length === 0) return null;
    return sortStops(out);
  } catch {
    return null;
  }
}

/** Shipment fields needed for drop-off parsing (avoids circular imports with shipments.ts). */
export type DropOffShipmentFields = {
  originLng: number;
  originLat: number;
  dropOffsJson: string | null;
  destLabel: string | null;
  routeTo: string;
  destLat: number;
  destLng: number;
};

/** Ordered delivery stops from JSON, or one synthetic stop from lane destination. */
export function orderedDeliveryStops(ship: DropOffShipmentFields): DropOffStop[] {
  const fromJson = parseDropOffsFromJson(ship.dropOffsJson);
  if (fromJson && fromJson.length > 0) return fromJson;
  return [
    {
      label: ship.destLabel?.trim() || ship.routeTo,
      lat: ship.destLat,
      lng: ship.destLng,
    },
  ];
}

/** Intermediate coordinates for Google Directions waypoints (all but final stop). */
export function intermediateDropCoordinates(
  ship: DropOffShipmentFields,
): { lat: number; lng: number }[] {
  const all = orderedDeliveryStops(ship);
  if (all.length <= 1) return [];
  return all.slice(0, -1).map((s) => ({ lat: s.lat, lng: s.lng }));
}

/** Keep dest_* in sync with the last JSON stop when multi-drop data is present. */
export function syncDestFromDropOffsJson<T extends DropOffShipmentFields>(ship: T): T {
  const fromJson = parseDropOffsFromJson(ship.dropOffsJson);
  if (!fromJson || fromJson.length === 0) return ship;
  const last = fromJson[fromJson.length - 1]!;
  return {
    ...ship,
    destLat: last.lat,
    destLng: last.lng,
    destLabel: last.label || ship.destLabel,
  };
}

/**
 * True when the shipment has 2+ ordered delivery stops (i.e. multi-destination).
 */
export function isMultiStop(ship: DropOffShipmentFields): boolean {
  return orderedDeliveryStops(ship).length >= 2;
}

/**
 * Return the next (first) delivery stop from the current origin.
 * Multi-stop loads: Optimizing Pivt only needs origin → next stop.
 */
export function nextDeliveryStop(
  ship: DropOffShipmentFields,
): DropOffStop {
  const stops = orderedDeliveryStops(ship);
  return stops[0]!;
}

/**
 * Build a "next-leg only" virtual shipment for Optimizing Pivt: origin → first
 * stop, with no intermediate waypoints.  Remaining stops are preserved in
 * ``dropOffsJson`` for informational purposes but are not on the driving path.
 */
export function nextLegShipment<T extends DropOffShipmentFields>(ship: T): T {
  const stops = orderedDeliveryStops(ship);
  if (stops.length <= 1) return ship;
  const next = stops[0]!;
  return {
    ...ship,
    destLat: next.lat,
    destLng: next.lng,
    destLabel: next.label,
    dropOffsJson: null,
  };
}

/** Centroid of origin + every delivery stop (better than O–D only for multi-stop lanes). */
export function shipRouteMidpointWithDrops(
  ship: DropOffShipmentFields,
): { lng: number; lat: number } {
  const stops = orderedDeliveryStops(ship);
  const pts = [
    { lng: ship.originLng, lat: ship.originLat },
    ...stops.map((s) => ({ lng: s.lng, lat: s.lat })),
  ];
  const n = pts.length;
  return {
    lng: pts.reduce((a, p) => a + p.lng, 0) / n,
    lat: pts.reduce((a, p) => a + p.lat, 0) / n,
  };
}
