import { endpointsForLane } from "@/lib/db/airport-coords";
import { parseDropOffsFromJson } from "@/lib/drop-offs";
import type { ActiveShipment, ShipmentStatus, USRegion } from "@/lib/shipments";

export const REGIONS: USRegion[] = [
  "Northeast",
  "Mid-Atlantic",
  "Southeast",
  "Midwest",
  "Southwest",
  "Mountain",
  "Pacific",
];

const STATUSES: ShipmentStatus[] = ["nominal", "at_risk", "exception"];

function isRegion(s: string): s is USRegion {
  return REGIONS.includes(s as USRegion);
}

function isStatus(s: string): s is ShipmentStatus {
  return STATUSES.includes(s as ShipmentStatus);
}

const ID_RE = /^[A-Z]{2}-\d{3,6}$/i;

/** Optional string: omit, empty, or whitespace → null. */
function optNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

function optNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Optional JSON array of drop-offs; invalid JSON or shape → error. */
function optDropOffsJson(
  v: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: null };
  const s = optNullableString(v);
  if (s === null) return { ok: true, value: null };
  const parsed = parseDropOffsFromJson(s);
  if (parsed === null || parsed.length === 0) {
    return {
      ok: false,
      error:
        "dropOffsJson must be a JSON array of { label, lat, lng } with at least one stop.",
    };
  }
  return { ok: true, value: s };
}

export function parseCreateShip(
  body: Record<string, unknown>,
): { ok: true; data: ActiveShipment } | { ok: false; error: string } {
  const id = String(body.id ?? "").trim().toUpperCase();
  if (!ID_RE.test(id)) {
    return {
      ok: false,
      error:
        "Invalid id (use format like NY-8472: two letters, hyphen, 3–6 digits).",
    };
  }

  const state = String(body.state ?? "").trim().toUpperCase().slice(0, 2);
  if (state.length !== 2) {
    return { ok: false, error: "state must be a 2-letter code." };
  }

  const region = body.region;
  if (typeof region !== "string" || !isRegion(region)) {
    return { ok: false, error: `region must be one of: ${REGIONS.join(", ")}` };
  }

  const routeFrom = String(body.routeFrom ?? "").trim();
  const routeTo = String(body.routeTo ?? "").trim();
  if (!routeFrom || !routeTo) {
    return {
      ok: false,
      error: "routeFrom and routeTo are required.",
    };
  }

  const status = body.status;
  if (typeof status !== "string" || !isStatus(status)) {
    return {
      ok: false,
      error: `status must be one of: ${STATUSES.join(", ")}`,
    };
  }

  const isPrimary = Boolean(body.isPrimary);

  const notes = optNullableString(body.notes);
  const carrier = optNullableString(body.carrier);
  const equipment = optNullableString(body.equipment);
  const customerRef = optNullableString(
    body.customerRef ?? body.customer_ref,
  );

  const driverName = optNullableString(body.driverName);
  const driverPhone = optNullableString(body.driverPhone);
  const driverEmail = optNullableString(body.driverEmail);
  const driverOrg = optNullableString(body.driverOrg);
  const dispatcherName = optNullableString(body.dispatcherName);
  const dispatcherPhone = optNullableString(body.dispatcherPhone);
  const dispatcherEmail = optNullableString(body.dispatcherEmail);
  const dispatcherOrg = optNullableString(body.dispatcherOrg);

  const dropParsed = optDropOffsJson(body.dropOffsJson ?? body.drop_offs_json);
  if (!dropParsed.ok) return { ok: false, error: dropParsed.error };

  const end = endpointsForLane(routeFrom, routeTo, state);

  return {
    ok: true,
    data: {
      id,
      state,
      region,
      routeFrom,
      routeTo,
      status,
      isPrimary,
      notes,
      carrier,
      equipment,
      customerRef,
      driverName,
      driverPhone,
      driverEmail,
      driverOrg,
      dispatcherName,
      dispatcherPhone,
      dispatcherEmail,
      dispatcherOrg,
      originLng: optNumber(body.originLng) ?? end.originLng,
      originLat: optNumber(body.originLat) ?? end.originLat,
      destLng: optNumber(body.destLng) ?? end.destLng,
      destLat: optNumber(body.destLat) ?? end.destLat,
      originLabel: optNullableString(body.originLabel),
      destLabel: optNullableString(body.destLabel),
      hubLng: optNumber(body.hubLng),
      hubLat: optNumber(body.hubLat),
      hubLabel: optNullableString(body.hubLabel),
      stallLng: optNumber(body.stallLng),
      stallLat: optNumber(body.stallLat),
      altWaypointLng: optNumber(body.altWaypointLng),
      altWaypointLat: optNumber(body.altWaypointLat),
      priority: optNullableString(body.priority),
      cargo: optNullableString(body.cargo),
      slaPenaltyPerHour: optNumber(body.slaPenaltyPerHour),
      originalEta: optNullableString(body.originalEta),
      blizzardCorridor: optNullableString(body.blizzardCorridor),
      routeVariantsJson: optNullableString(body.routeVariantsJson),
      crmTimelineJson: optNullableString(body.crmTimelineJson),
      dropOffsJson: dropParsed.value,
      optimizingSelectedRoute: null,
      optimizingRouteOptOut: false,
    },
  };
}

export function parsePatchShip(
  body: Record<string, unknown>,
): { ok: true; data: Partial<Omit<ActiveShipment, "id">> } | { ok: false; error: string } {
  const out: Partial<Omit<ActiveShipment, "id">> = {};

  if (body.state !== undefined) {
    const state = String(body.state).trim().toUpperCase().slice(0, 2);
    if (state.length !== 2) {
      return { ok: false, error: "state must be a 2-letter code." };
    }
    out.state = state;
  }

  if (body.region !== undefined) {
    const region = body.region;
    if (typeof region !== "string" || !isRegion(region)) {
      return { ok: false, error: `region must be one of: ${REGIONS.join(", ")}` };
    }
    out.region = region;
  }

  if (body.routeFrom !== undefined) {
    const routeFrom = String(body.routeFrom).trim();
    if (!routeFrom) return { ok: false, error: "routeFrom cannot be empty." };
    out.routeFrom = routeFrom;
  }

  if (body.routeTo !== undefined) {
    const routeTo = String(body.routeTo).trim();
    if (!routeTo) return { ok: false, error: "routeTo cannot be empty." };
    out.routeTo = routeTo;
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    out.notes = optNullableString(body.notes);
  }
  if (Object.prototype.hasOwnProperty.call(body, "carrier")) {
    out.carrier = optNullableString(body.carrier);
  }
  if (Object.prototype.hasOwnProperty.call(body, "equipment")) {
    out.equipment = optNullableString(body.equipment);
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "customerRef") ||
    Object.prototype.hasOwnProperty.call(body, "customer_ref")
  ) {
    out.customerRef = optNullableString(
      body.customerRef ?? body.customer_ref,
    );
  }

  const driverDispatchKeys = [
    "driverName",
    "driverPhone",
    "driverEmail",
    "driverOrg",
    "dispatcherName",
    "dispatcherPhone",
    "dispatcherEmail",
    "dispatcherOrg",
  ] as const;
  for (const k of driverDispatchKeys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      out[k] = optNullableString(body[k]);
    }
  }

  if (body.status !== undefined) {
    const status = body.status;
    if (typeof status !== "string" || !isStatus(status)) {
      return {
        ok: false,
        error: `status must be one of: ${STATUSES.join(", ")}`,
      };
    }
    out.status = status;
  }

  if (body.isPrimary !== undefined) {
    out.isPrimary = Boolean(body.isPrimary);
  }

  if (Object.prototype.hasOwnProperty.call(body, "originLng")) {
    const n = optNumber(body.originLng);
    if (n !== null) out.originLng = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "originLat")) {
    const n = optNumber(body.originLat);
    if (n !== null) out.originLat = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "destLng")) {
    const n = optNumber(body.destLng);
    if (n !== null) out.destLng = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "destLat")) {
    const n = optNumber(body.destLat);
    if (n !== null) out.destLat = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "hubLng")) {
    const n = optNumber(body.hubLng);
    out.hubLng = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "hubLat")) {
    const n = optNumber(body.hubLat);
    out.hubLat = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "stallLng")) {
    const n = optNumber(body.stallLng);
    out.stallLng = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "stallLat")) {
    const n = optNumber(body.stallLat);
    out.stallLat = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "altWaypointLng")) {
    const n = optNumber(body.altWaypointLng);
    out.altWaypointLng = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "altWaypointLat")) {
    const n = optNumber(body.altWaypointLat);
    out.altWaypointLat = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "slaPenaltyPerHour")) {
    const n = optNumber(body.slaPenaltyPerHour);
    out.slaPenaltyPerHour = n;
  }

  if (Object.prototype.hasOwnProperty.call(body, "originLabel")) {
    out.originLabel = optNullableString(body.originLabel);
  }
  if (Object.prototype.hasOwnProperty.call(body, "destLabel")) {
    out.destLabel = optNullableString(body.destLabel);
  }
  if (Object.prototype.hasOwnProperty.call(body, "hubLabel")) {
    out.hubLabel = optNullableString(body.hubLabel);
  }
  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    out.priority = optNullableString(body.priority);
  }
  if (Object.prototype.hasOwnProperty.call(body, "cargo")) {
    out.cargo = optNullableString(body.cargo);
  }
  if (Object.prototype.hasOwnProperty.call(body, "originalEta")) {
    out.originalEta = optNullableString(body.originalEta);
  }
  if (Object.prototype.hasOwnProperty.call(body, "blizzardCorridor")) {
    out.blizzardCorridor = optNullableString(body.blizzardCorridor);
  }
  if (Object.prototype.hasOwnProperty.call(body, "routeVariantsJson")) {
    out.routeVariantsJson = optNullableString(body.routeVariantsJson);
  }
  if (Object.prototype.hasOwnProperty.call(body, "crmTimelineJson")) {
    out.crmTimelineJson = optNullableString(body.crmTimelineJson);
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "dropOffsJson") ||
    Object.prototype.hasOwnProperty.call(body, "drop_offs_json")
  ) {
    const dropParsed = optDropOffsJson(
      body.dropOffsJson ?? body.drop_offs_json,
    );
    if (!dropParsed.ok) return { ok: false, error: dropParsed.error };
    out.dropOffsJson = dropParsed.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "optimizingSelectedRoute")) {
    const v = body.optimizingSelectedRoute;
    if (v === null) {
      out.optimizingSelectedRoute = null;
    } else if (typeof v === "string") {
      const t = v.trim().toUpperCase();
      if (t.length !== 1 || t < "A" || t > "Z") {
        return {
          ok: false,
          error: "optimizingSelectedRoute must be a single letter A–Z or null.",
        };
      }
      out.optimizingSelectedRoute = t;
    } else {
      return { ok: false, error: "optimizingSelectedRoute must be a string or null." };
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "optimizingRouteOptOut")) {
    out.optimizingRouteOptOut = Boolean(body.optimizingRouteOptOut);
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "No valid fields to update." };
  }

  return { ok: true, data: out };
}
