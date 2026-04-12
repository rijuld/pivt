import type { ActiveShipment } from "@/lib/shipments";

export type ContactRole = "driver" | "dispatcher" | "fleet_manager";

export interface CrmContact {
  id: string;
  name: string;
  role: ContactRole;
  phone: string;
  email: string;
  org: string;
}

export type TimelineKind = "call" | "sms" | "email" | "note";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  direction: "in" | "out";
  /** Short label for the row */
  summary: string;
  detail?: string;
  at: string;
  /** Who it involved */
  party: string;
}

export interface ShipmentDriverCrm {
  shipmentId: string;
  driver: CrmContact;
  dispatcher: CrmContact;
  /** Seed activity for demo */
  timeline: TimelineEntry[];
}

const DRIVER_MARCO: CrmContact = {
  id: "drv-marco",
  name: "Marco Ruiz",
  role: "driver",
  phone: "+1 (412) 555-0142",
  email: "m.ruiz@midlandfreight.example.com",
  org: "Midland Freight",
};

const DISPATCH_NINA: CrmContact = {
  id: "dsp-nina",
  name: "Nina Patel",
  role: "dispatcher",
  phone: "+1 (800) 555-0199",
  email: "dispatch@midlandfreight.example.com",
  org: "Midland Freight Dispatch",
};

function fallbackCrm(shipmentId: string): ShipmentDriverCrm {
  return {
    shipmentId,
    driver: {
      id: `drv-${shipmentId}`,
      name: "Assigned driver",
      role: "driver",
      phone: "+1 (555) 555-0100",
      email: `driver.load+${shipmentId.toLowerCase()}@carrier.example.com`,
      org: "Network carrier",
    },
    dispatcher: {
      id: `dsp-${shipmentId}`,
      name: "Floor dispatch",
      role: "dispatcher",
      phone: "+1 (800) 555-0111",
      email: `dispatch@networkcarrier.example.com`,
      org: "Network carrier",
    },
    timeline: [
      {
        id: "ft1",
        kind: "note",
        direction: "out",
        summary: "Load accepted in TMS — assign driver at first check-call",
        at: "—",
        party: "System",
      },
    ],
  };
}

export function getDriverCrmForShipment(shipmentId: string): ShipmentDriverCrm {
  return fallbackCrm(shipmentId);
}

function hasDriverContact(ship: ActiveShipment): boolean {
  return Boolean(
    ship.driverName?.trim() ||
      ship.driverPhone?.trim() ||
      ship.driverEmail?.trim() ||
      ship.driverOrg?.trim(),
  );
}

function hasDispatcherContact(ship: ActiveShipment): boolean {
  return Boolean(
    ship.dispatcherName?.trim() ||
      ship.dispatcherPhone?.trim() ||
      ship.dispatcherEmail?.trim() ||
      ship.dispatcherOrg?.trim(),
  );
}

function parseTimelineFromShip(ship: ActiveShipment): TimelineEntry[] | null {
  if (!ship.crmTimelineJson?.trim()) return null;
  try {
    const parsed = JSON.parse(ship.crmTimelineJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as TimelineEntry[];
  } catch {
    return null;
  }
}

/**
 * Demo timeline + fallback contacts from id, overridden by fields saved on the load.
 * Rich timeline rows come from `crm_timeline_json` when present on the shipment row.
 */
export function getDriverCrmForActiveShipment(
  ship: ActiveShipment,
): ShipmentDriverCrm {
  const fb = fallbackCrm(ship.id);
  const fromDb = parseTimelineFromShip(ship);
  const timeline =
    fromDb && fromDb.length > 0 ? fromDb : fb.timeline;

  const base: ShipmentDriverCrm = ship.isPrimary
    ? {
        shipmentId: ship.id,
        driver: DRIVER_MARCO,
        dispatcher: DISPATCH_NINA,
        timeline,
      }
    : { ...fb, timeline };

  const driver = hasDriverContact(ship)
    ? {
        ...base.driver,
        name: ship.driverName?.trim() || base.driver.name,
        phone: ship.driverPhone?.trim() || base.driver.phone,
        email: ship.driverEmail?.trim() || base.driver.email,
        org: ship.driverOrg?.trim() || base.driver.org,
      }
    : base.driver;

  const dispatcher = hasDispatcherContact(ship)
    ? {
        ...base.dispatcher,
        name: ship.dispatcherName?.trim() || base.dispatcher.name,
        phone: ship.dispatcherPhone?.trim() || base.dispatcher.phone,
        email: ship.dispatcherEmail?.trim() || base.dispatcher.email,
        org: ship.dispatcherOrg?.trim() || base.dispatcher.org,
      }
    : base.dispatcher;

  return {
    ...base,
    shipmentId: ship.id,
    driver,
    dispatcher,
    timeline,
  };
}

export function kindLabel(k: TimelineKind): string {
  switch (k) {
    case "call":
      return "Call";
    case "sms":
      return "SMS";
    case "email":
      return "Email";
    case "note":
      return "Note";
    default:
      return k;
  }
}
