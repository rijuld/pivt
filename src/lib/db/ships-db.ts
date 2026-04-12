import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { CompanyProfile } from "@/lib/company-profile";
import { DEFAULT_COMPANY_PROFILE } from "@/lib/company-profile";
import { endpointsForLane } from "@/lib/db/airport-coords";
import { SHIP_SEED_ROWS } from "@/lib/db/ship-seeds";
import { syncDestFromDropOffsJson } from "@/lib/drop-offs";
import type { ActiveShipment, ShipmentStatus, USRegion } from "@/lib/shipments";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ships.db");

let dbInstance: Database.Database | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createShipsTableSql() {
  return `
    CREATE TABLE ships (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      region TEXT NOT NULL,
      route_from TEXT NOT NULL,
      route_to TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('nominal', 'at_risk', 'exception')),
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      notes TEXT,
      carrier TEXT,
      equipment TEXT,
      customer_ref TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ships_region ON ships(region);
  `;
}

/** Split legacy "A → B" route_label into two fields. */
function splitRouteLabel(routeLabel: string): { routeFrom: string; routeTo: string } {
  const t = routeLabel.trim();
  const parts = t.split(/\s*(?:→|->)\s*/);
  if (parts.length >= 2) {
    return {
      routeFrom: (parts[0] ?? "").trim() || "—",
      routeTo: parts.slice(1).join(" → ").trim() || "—",
    };
  }
  if (t) return { routeFrom: t, routeTo: t };
  return { routeFrom: "—", routeTo: "—" };
}

function columnNames(db: Database.Database): Set<string> {
  const cols = db.prepare("PRAGMA table_info(ships)").all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

function ensureOptionalShipmentColumns(db: Database.Database) {
  const names = columnNames(db);
  for (const sqlName of [
    "notes",
    "carrier",
    "equipment",
    "customer_ref",
    "driver_name",
    "driver_phone",
    "driver_email",
    "driver_org",
    "dispatcher_name",
    "dispatcher_phone",
    "dispatcher_email",
    "dispatcher_org",
  ] as const) {
    if (!names.has(sqlName)) {
      db.exec(`ALTER TABLE ships ADD COLUMN ${sqlName} TEXT`);
    }
  }
}

function ensureShipmentGeoColumns(db: Database.Database) {
  const names = columnNames(db);
  const add = (sqlName: string, sqlType: string) => {
    if (!names.has(sqlName)) {
      db.exec(`ALTER TABLE ships ADD COLUMN ${sqlName} ${sqlType}`);
    }
  };
  add("origin_lng", "REAL");
  add("origin_lat", "REAL");
  add("dest_lng", "REAL");
  add("dest_lat", "REAL");
  add("origin_label", "TEXT");
  add("dest_label", "TEXT");
  add("hub_lng", "REAL");
  add("hub_lat", "REAL");
  add("hub_label", "TEXT");
  add("stall_lng", "REAL");
  add("stall_lat", "REAL");
  add("alt_waypoint_lng", "REAL");
  add("alt_waypoint_lat", "REAL");
  add("priority", "TEXT");
  add("cargo", "TEXT");
  add("sla_penalty_per_hour", "REAL");
  add("original_eta", "TEXT");
  add("blizzard_corridor", "TEXT");
  add("route_variants_json", "TEXT");
  add("crm_timeline_json", "TEXT");
  add("drop_offs_json", "TEXT");
  add("optimizing_selected_route", "TEXT");
  add("optimizing_route_opt_out", "INTEGER NOT NULL DEFAULT 0");
}

export interface ScenarioSettings {
  portStrikeEpicenter: { lng: number; lat: number };
}

const DEFAULT_SCENARIO_SETTINGS: ScenarioSettings = {
  portStrikeEpicenter: { lng: -74.1724, lat: 40.7357 },
};

function ensureAppKvTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function seedScenarioSettingsIfEmpty(db: Database.Database) {
  ensureAppKvTable(db);
  const row = db
    .prepare("SELECT 1 as x FROM app_kv WHERE key = 'scenario_settings'")
    .get() as { x: number } | undefined;
  if (row) return;
  db.prepare(`INSERT INTO app_kv (key, value) VALUES ('scenario_settings', ?)`).run(
    JSON.stringify(DEFAULT_SCENARIO_SETTINGS),
  );
}

export function getScenarioSettings(): ScenarioSettings {
  const db = getDb();
  ensureAppKvTable(db);
  const row = db
    .prepare(`SELECT value FROM app_kv WHERE key = 'scenario_settings'`)
    .get() as { value: string } | undefined;
  if (!row?.value) return DEFAULT_SCENARIO_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<ScenarioSettings>;
    return {
      portStrikeEpicenter:
        parsed.portStrikeEpicenter ?? DEFAULT_SCENARIO_SETTINGS.portStrikeEpicenter,
    };
  } catch {
    return DEFAULT_SCENARIO_SETTINGS;
  }
}

function activeShipmentToParams(s: ActiveShipment) {
  return {
    id: s.id,
    state: s.state,
    region: s.region,
    route_from: s.routeFrom,
    route_to: s.routeTo,
    status: s.status,
    is_primary: s.isPrimary ? 1 : 0,
    notes: s.notes,
    carrier: s.carrier,
    equipment: s.equipment,
    customer_ref: s.customerRef,
    driver_name: s.driverName,
    driver_phone: s.driverPhone,
    driver_email: s.driverEmail,
    driver_org: s.driverOrg,
    dispatcher_name: s.dispatcherName,
    dispatcher_phone: s.dispatcherPhone,
    dispatcher_email: s.dispatcherEmail,
    dispatcher_org: s.dispatcherOrg,
    origin_lng: s.originLng,
    origin_lat: s.originLat,
    dest_lng: s.destLng,
    dest_lat: s.destLat,
    origin_label: s.originLabel,
    dest_label: s.destLabel,
    hub_lng: s.hubLng,
    hub_lat: s.hubLat,
    hub_label: s.hubLabel,
    stall_lng: s.stallLng,
    stall_lat: s.stallLat,
    alt_waypoint_lng: s.altWaypointLng,
    alt_waypoint_lat: s.altWaypointLat,
    priority: s.priority,
    cargo: s.cargo,
    sla_penalty_per_hour: s.slaPenaltyPerHour,
    original_eta: s.originalEta,
    blizzard_corridor: s.blizzardCorridor,
    route_variants_json: s.routeVariantsJson,
    crm_timeline_json: s.crmTimelineJson,
    drop_offs_json: s.dropOffsJson,
    optimizing_selected_route: s.optimizingSelectedRoute,
    optimizing_route_opt_out: s.optimizingRouteOptOut ? 1 : 0,
  };
}

function backfillShipmentGeometry(db: Database.Database) {
  ensureShipmentGeoColumns(db);
  const seedById = new Map(SHIP_SEED_ROWS.map((s) => [s.id, s]));
  const rows = db
    .prepare(
      `SELECT id, route_from, route_to, state, origin_lng FROM ships`,
    )
    .all() as Array<{
    id: string;
    route_from: string;
    route_to: string;
    state: string;
    origin_lng: number | null;
  }>;

  const stmt = db.prepare(`
    UPDATE ships SET
      origin_lng = @origin_lng,
      origin_lat = @origin_lat,
      dest_lng = @dest_lng,
      dest_lat = @dest_lat,
      origin_label = @origin_label,
      dest_label = @dest_label,
      hub_lng = @hub_lng,
      hub_lat = @hub_lat,
      hub_label = @hub_label,
      stall_lng = @stall_lng,
      stall_lat = @stall_lat,
      alt_waypoint_lng = @alt_waypoint_lng,
      alt_waypoint_lat = @alt_waypoint_lat,
      priority = @priority,
      cargo = @cargo,
      sla_penalty_per_hour = @sla_penalty_per_hour,
      original_eta = @original_eta,
      blizzard_corridor = @blizzard_corridor,
      route_variants_json = @route_variants_json,
      crm_timeline_json = @crm_timeline_json,
      drop_offs_json = @drop_offs_json
    WHERE id = @id
  `);

  for (const row of rows) {
    if (row.origin_lng != null) continue;
    const seed = seedById.get(row.id);
    if (seed) {
      stmt.run(activeShipmentToParams(seed));
      continue;
    }
    const e = endpointsForLane(row.route_from, row.route_to, row.state);
    stmt.run({
      id: row.id,
      origin_lng: e.originLng,
      origin_lat: e.originLat,
      dest_lng: e.destLng,
      dest_lat: e.destLat,
      origin_label: null,
      dest_label: null,
      hub_lng: null,
      hub_lat: null,
      hub_label: null,
      stall_lng: null,
      stall_lat: null,
      alt_waypoint_lng: null,
      alt_waypoint_lat: null,
      priority: null,
      cargo: null,
      sla_penalty_per_hour: null,
      original_eta: null,
      blizzard_corridor: null,
      route_variants_json: null,
      crm_timeline_json: null,
      drop_offs_json: null,
    });
  }
}

function migrate(db: Database.Database) {
  const exists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ships'",
    )
    .get() as { name: string } | undefined;

  if (!exists) {
    db.exec(createShipsTableSql());
    ensureOptionalShipmentColumns(db);
    ensureShipmentGeoColumns(db);
    ensureCompanyProfileTable(db);
    ensureShipRouteRevisionsTable(db);
    return;
  }

  let names = columnNames(db);

  if (names.has("lng")) {
    db.exec(`
      CREATE TABLE ships_next (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        region TEXT NOT NULL,
        route_label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('nominal', 'at_risk', 'exception')),
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
      );
      INSERT INTO ships_next (id, state, region, route_label, status, is_primary)
        SELECT id, state, region, route_label, status, is_primary FROM ships;
      DROP TABLE ships;
      ALTER TABLE ships_next RENAME TO ships;
      CREATE INDEX IF NOT EXISTS idx_ships_region ON ships(region);
    `);
    names = columnNames(db);
  }

  if (names.has("route_label") && !names.has("route_from")) {
    const rows = db
      .prepare(
        "SELECT id, state, region, route_label, status, is_primary FROM ships",
      )
      .all() as Array<{
      id: string;
      state: string;
      region: string;
      route_label: string;
      status: string;
      is_primary: number;
    }>;

    db.exec(`
      CREATE TABLE ships_r2 (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        region TEXT NOT NULL,
        route_from TEXT NOT NULL,
        route_to TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('nominal', 'at_risk', 'exception')),
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        notes TEXT,
        carrier TEXT,
        equipment TEXT,
        customer_ref TEXT
      );
    `);

    const ins = db.prepare(`
      INSERT INTO ships_r2 (id, state, region, route_from, route_to, status, is_primary, notes, carrier, equipment, customer_ref)
      VALUES (@id, @state, @region, @route_from, @route_to, @status, @is_primary, @notes, @carrier, @equipment, @customer_ref)
    `);

    const run = db.transaction(() => {
      for (const row of rows) {
        const { routeFrom, routeTo } = splitRouteLabel(row.route_label);
        ins.run({
          id: row.id,
          state: row.state,
          region: row.region,
          route_from: routeFrom,
          route_to: routeTo,
          status: row.status,
          is_primary: row.is_primary,
          notes: null,
          carrier: null,
          equipment: null,
          customer_ref: null,
        });
      }
      db.exec(`
        DROP TABLE ships;
        ALTER TABLE ships_r2 RENAME TO ships;
        CREATE INDEX IF NOT EXISTS idx_ships_region ON ships(region);
      `);
    });
    run();
  }

  ensureOptionalShipmentColumns(db);
  ensureShipmentGeoColumns(db);
  ensureCompanyProfileTable(db);
  ensureShipRouteRevisionsTable(db);
  ensureDriverRouteAckTable(db);
}

function ensureShipRouteRevisionsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ship_route_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ship_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT NOT NULL,
      drop_offs_json TEXT,
      optimizing_selected_route TEXT,
      optimizing_route_opt_out INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ship_route_revisions_ship
      ON ship_route_revisions(ship_id, id DESC);
  `);
}

function ensureDriverRouteAckTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS driver_route_notice_ack (
      ship_id TEXT PRIMARY KEY,
      route_fingerprint TEXT NOT NULL,
      acknowledged_at TEXT NOT NULL
    );
  `);
}

export type DriverRouteNoticeAck = {
  fingerprint: string;
  acknowledgedAt: string;
};

export function getDriverRouteNoticeAck(
  shipId: string,
): DriverRouteNoticeAck | null {
  const db = getDb();
  ensureDriverRouteAckTable(db);
  const row = db
    .prepare(
      `SELECT route_fingerprint, acknowledged_at FROM driver_route_notice_ack WHERE ship_id = ?`,
    )
    .get(shipId) as
    | { route_fingerprint: string; acknowledged_at: string }
    | undefined;
  if (!row) return null;
  return {
    fingerprint: row.route_fingerprint,
    acknowledgedAt: row.acknowledged_at,
  };
}

export function setDriverRouteNoticeAck(
  shipId: string,
  fingerprint: string,
): DriverRouteNoticeAck {
  const db = getDb();
  ensureDriverRouteAckTable(db);
  const acknowledgedAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO driver_route_notice_ack (ship_id, route_fingerprint, acknowledged_at)
    VALUES (@ship_id, @route_fingerprint, @acknowledged_at)
    ON CONFLICT(ship_id) DO UPDATE SET
      route_fingerprint = excluded.route_fingerprint,
      acknowledged_at = excluded.acknowledged_at
  `,
  ).run({
    ship_id: shipId,
    route_fingerprint: fingerprint,
    acknowledged_at: acknowledgedAt,
  });
  return { fingerprint, acknowledgedAt };
}

export type ShipRouteRevision = {
  id: number;
  shipId: string;
  createdAt: string;
  summary: string;
  dropOffsJson: string | null;
  optimizingSelectedRoute: string | null;
  optimizingRouteOptOut: boolean;
};

function routeSnapshotsEqual(a: ActiveShipment, b: ActiveShipment): boolean {
  return (
    a.dropOffsJson === b.dropOffsJson &&
    a.optimizingSelectedRoute === b.optimizingSelectedRoute &&
    a.optimizingRouteOptOut === b.optimizingRouteOptOut
  );
}

function revisionSummaryFromDiff(
  prev: ActiveShipment,
  next: ActiveShipment,
): string {
  const parts: string[] = [];
  if (prev.dropOffsJson !== next.dropOffsJson) {
    parts.push("Delivery stops updated");
  }
  if (prev.optimizingSelectedRoute !== next.optimizingSelectedRoute) {
    if (next.optimizingSelectedRoute) {
      parts.push(`Route ${next.optimizingSelectedRoute} committed`);
    } else if (prev.optimizingSelectedRoute) {
      parts.push("Committed route cleared");
    }
  }
  if (prev.optimizingRouteOptOut !== next.optimizingRouteOptOut) {
    parts.push(next.optimizingRouteOptOut ? "Route opt-out set" : "Route opt-out cleared");
  }
  return parts.length > 0 ? parts.join(" · ") : "Route settings updated";
}

function insertRouteRevision(
  db: Database.Database,
  shipId: string,
  ship: ActiveShipment,
  summary: string,
) {
  ensureShipRouteRevisionsTable(db);
  db.prepare(
    `
    INSERT INTO ship_route_revisions (
      ship_id, summary, drop_offs_json, optimizing_selected_route, optimizing_route_opt_out
    ) VALUES (@ship_id, @summary, @drop_offs_json, @optimizing_selected_route, @optimizing_route_opt_out)
  `,
  ).run({
    ship_id: shipId,
    summary,
    drop_offs_json: ship.dropOffsJson,
    optimizing_selected_route: ship.optimizingSelectedRoute,
    optimizing_route_opt_out: ship.optimizingRouteOptOut ? 1 : 0,
  });
}

export function listShipRouteRevisions(shipId: string): ShipRouteRevision[] {
  const db = getDb();
  ensureShipRouteRevisionsTable(db);
  const rows = db
    .prepare(
      `SELECT id, ship_id, created_at, summary, drop_offs_json, optimizing_selected_route, optimizing_route_opt_out
       FROM ship_route_revisions WHERE ship_id = ? ORDER BY id DESC`,
    )
    .all(shipId) as Array<{
    id: number;
    ship_id: string;
    created_at: string;
    summary: string;
    drop_offs_json: string | null;
    optimizing_selected_route: string | null;
    optimizing_route_opt_out: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    shipId: r.ship_id,
    createdAt: r.created_at,
    summary: r.summary,
    dropOffsJson: r.drop_offs_json,
    optimizingSelectedRoute: r.optimizing_selected_route,
    optimizingRouteOptOut: r.optimizing_route_opt_out === 1,
  }));
}

/** Apply a stored revision and append a new history row describing the restore. */
export function revertShipRouteToRevision(
  shipId: string,
  revisionId: number,
): ActiveShipment | null {
  const db = getDb();
  ensureShipRouteRevisionsTable(db);
  const row = db
    .prepare(
      `SELECT id, ship_id, created_at, summary, drop_offs_json, optimizing_selected_route, optimizing_route_opt_out
       FROM ship_route_revisions WHERE id = ? AND ship_id = ?`,
    )
    .get(revisionId, shipId) as
    | {
        id: number;
        ship_id: string;
        created_at: string;
        summary: string;
        drop_offs_json: string | null;
        optimizing_selected_route: string | null;
        optimizing_route_opt_out: number;
      }
    | undefined;
  if (!row) return null;

  const ship = updateShip(
    shipId,
    {
      dropOffsJson: row.drop_offs_json,
      optimizingSelectedRoute: row.optimizing_selected_route,
      optimizingRouteOptOut: row.optimizing_route_opt_out === 1,
    },
    { skipRouteRevision: true },
  );
  if (!ship) return null;

  const run = db.transaction(() => {
    insertRouteRevision(
      db,
      shipId,
      ship,
      `Restored snapshot #${row.id} (${row.created_at})`,
    );
  });
  run();
  return getShip(shipId);
}

function ensureCompanyProfileTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Your company',
      contact_email TEXT,
      contact_phone TEXT,
      hq_line1 TEXT,
      hq_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      website TEXT,
      updated_at TEXT
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO company_profile (id, company_name) VALUES (1, ?)`,
  ).run(DEFAULT_COMPANY_PROFILE.companyName);
}

function rowToShip(row: {
  id: string;
  state: string;
  region: string;
  route_from: string;
  route_to: string;
  status: string;
  is_primary: number;
  notes: string | null;
  carrier: string | null;
  equipment: string | null;
  customer_ref: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_email?: string | null;
  driver_org?: string | null;
  dispatcher_name?: string | null;
  dispatcher_phone?: string | null;
  dispatcher_email?: string | null;
  dispatcher_org?: string | null;
  origin_lng?: number | null;
  origin_lat?: number | null;
  dest_lng?: number | null;
  dest_lat?: number | null;
  origin_label?: string | null;
  dest_label?: string | null;
  hub_lng?: number | null;
  hub_lat?: number | null;
  hub_label?: string | null;
  stall_lng?: number | null;
  stall_lat?: number | null;
  alt_waypoint_lng?: number | null;
  alt_waypoint_lat?: number | null;
  priority?: string | null;
  cargo?: string | null;
  sla_penalty_per_hour?: number | null;
  original_eta?: string | null;
  blizzard_corridor?: string | null;
  route_variants_json?: string | null;
  crm_timeline_json?: string | null;
  drop_offs_json?: string | null;
  optimizing_selected_route?: string | null;
  optimizing_route_opt_out?: number | null;
}): ActiveShipment {
  const fallback =
    row.origin_lng == null || row.dest_lng == null
      ? endpointsForLane(row.route_from, row.route_to, row.state)
      : null;
  return {
    id: row.id,
    state: row.state,
    region: row.region as USRegion,
    routeFrom: row.route_from,
    routeTo: row.route_to,
    status: row.status as ShipmentStatus,
    isPrimary: row.is_primary === 1,
    notes: row.notes ?? null,
    carrier: row.carrier ?? null,
    equipment: row.equipment ?? null,
    customerRef: row.customer_ref ?? null,
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    driverEmail: row.driver_email ?? null,
    driverOrg: row.driver_org ?? null,
    dispatcherName: row.dispatcher_name ?? null,
    dispatcherPhone: row.dispatcher_phone ?? null,
    dispatcherEmail: row.dispatcher_email ?? null,
    dispatcherOrg: row.dispatcher_org ?? null,
    originLng: row.origin_lng ?? fallback?.originLng ?? 0,
    originLat: row.origin_lat ?? fallback?.originLat ?? 0,
    destLng: row.dest_lng ?? fallback?.destLng ?? 0,
    destLat: row.dest_lat ?? fallback?.destLat ?? 0,
    originLabel: row.origin_label ?? null,
    destLabel: row.dest_label ?? null,
    hubLng: row.hub_lng ?? null,
    hubLat: row.hub_lat ?? null,
    hubLabel: row.hub_label ?? null,
    stallLng: row.stall_lng ?? null,
    stallLat: row.stall_lat ?? null,
    altWaypointLng: row.alt_waypoint_lng ?? null,
    altWaypointLat: row.alt_waypoint_lat ?? null,
    priority: row.priority ?? null,
    cargo: row.cargo ?? null,
    slaPenaltyPerHour: row.sla_penalty_per_hour ?? null,
    originalEta: row.original_eta ?? null,
    blizzardCorridor: row.blizzard_corridor ?? null,
    routeVariantsJson: row.route_variants_json ?? null,
    crmTimelineJson: row.crm_timeline_json ?? null,
    dropOffsJson: row.drop_offs_json ?? null,
    optimizingSelectedRoute: row.optimizing_selected_route ?? null,
    optimizingRouteOptOut: (row.optimizing_route_opt_out ?? 0) === 1,
  };
}

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM ships").get() as {
    c: number;
  };
  if (count.c > 0) return;

  const insert = db.prepare(`
    INSERT INTO ships (id, state, region, route_from, route_to, status, is_primary, notes, carrier, equipment, customer_ref,
      driver_name, driver_phone, driver_email, driver_org, dispatcher_name, dispatcher_phone, dispatcher_email, dispatcher_org,
      origin_lng, origin_lat, dest_lng, dest_lat, origin_label, dest_label,
      hub_lng, hub_lat, hub_label, stall_lng, stall_lat, alt_waypoint_lng, alt_waypoint_lat,
      priority, cargo, sla_penalty_per_hour, original_eta, blizzard_corridor, route_variants_json, crm_timeline_json, drop_offs_json,
      optimizing_selected_route, optimizing_route_opt_out)
    VALUES (@id, @state, @region, @route_from, @route_to, @status, @is_primary, @notes, @carrier, @equipment, @customer_ref,
      @driver_name, @driver_phone, @driver_email, @driver_org, @dispatcher_name, @dispatcher_phone, @dispatcher_email, @dispatcher_org,
      @origin_lng, @origin_lat, @dest_lng, @dest_lat, @origin_label, @dest_label,
      @hub_lng, @hub_lat, @hub_label, @stall_lng, @stall_lat, @alt_waypoint_lng, @alt_waypoint_lat,
      @priority, @cargo, @sla_penalty_per_hour, @original_eta, @blizzard_corridor, @route_variants_json, @crm_timeline_json, @drop_offs_json,
      @optimizing_selected_route, @optimizing_route_opt_out)
  `);

  const run = db.transaction(() => {
    for (const s of SHIP_SEED_ROWS) {
      insert.run(activeShipmentToParams(s));
    }
  });
  run();
}

function backfillDropOffsFromSeeds(db: Database.Database) {
  ensureShipmentGeoColumns(db);
  const seedById = new Map(SHIP_SEED_ROWS.map((s) => [s.id, s]));
  const rows = db
    .prepare(`SELECT id, drop_offs_json FROM ships`)
    .all() as Array<{ id: string; drop_offs_json: string | null }>;
  const stmt = db.prepare(
    `UPDATE ships SET drop_offs_json = @drop_offs_json WHERE id = @id`,
  );
  for (const row of rows) {
    if (row.drop_offs_json != null && row.drop_offs_json !== "") continue;
    const seed = seedById.get(row.id);
    if (seed?.dropOffsJson) {
      stmt.run({ id: row.id, drop_offs_json: seed.dropOffsJson });
    }
  }
}

/** One-time: demo driver + dispatcher names/phones from ``SHIP_SEED_ROWS`` (replaces null / placeholders). */
const MIGRATION_SEED_CRM_CONTACTS_KEY = "migration_seed_crm_contacts_20260412";

function migrateSeedCrmContactsFromSeeds(db: Database.Database) {
  ensureAppKvTable(db);
  const done = db
    .prepare(`SELECT 1 FROM app_kv WHERE key = ?`)
    .get(MIGRATION_SEED_CRM_CONTACTS_KEY) as { 1: number } | undefined;
  if (done) return;

  const updDriver = db.prepare(`
    UPDATE ships SET
      driver_name = @driver_name,
      driver_phone = @driver_phone,
      driver_email = @driver_email,
      driver_org = @driver_org
    WHERE id = @id AND (
      driver_name IS NULL
      OR TRIM(COALESCE(driver_name, '')) = ''
      OR driver_name = 'Assigned driver'
    )
  `);
  const updDispatch = db.prepare(`
    UPDATE ships SET
      dispatcher_name = @dispatcher_name,
      dispatcher_phone = @dispatcher_phone,
      dispatcher_email = @dispatcher_email,
      dispatcher_org = @dispatcher_org
    WHERE id = @id AND (
      dispatcher_name IS NULL
      OR TRIM(COALESCE(dispatcher_name, '')) = ''
      OR dispatcher_name = 'Floor dispatch'
    )
  `);

  const mark = db.prepare(
    `INSERT INTO app_kv (key, value) VALUES (?, ?)`,
  );
  const run = db.transaction(() => {
    for (const seed of SHIP_SEED_ROWS) {
      if (!seed.driverName?.trim()) continue;
      const p = activeShipmentToParams(seed);
      updDriver.run({
        id: p.id,
        driver_name: p.driver_name,
        driver_phone: p.driver_phone,
        driver_email: p.driver_email,
        driver_org: p.driver_org,
      });
      updDispatch.run({
        id: p.id,
        dispatcher_name: p.dispatcher_name,
        dispatcher_phone: p.dispatcher_phone,
        dispatcher_email: p.dispatcher_email,
        dispatcher_org: p.dispatcher_org,
      });
    }
    mark.run(MIGRATION_SEED_CRM_CONTACTS_KEY, "1");
  });
  run();
}

/** One-time: push multi mid-destination drop_offs_json from seeds to all known demo loads. */
const MIGRATION_MULTI_MID_DROPOFFS_KEY = "migration_drop_offs_multi_mid_20260412";

function migrateMultiMidDropOffsFromSeeds(db: Database.Database) {
  ensureAppKvTable(db);
  const done = db
    .prepare(`SELECT 1 FROM app_kv WHERE key = ?`)
    .get(MIGRATION_MULTI_MID_DROPOFFS_KEY) as { 1: number } | undefined;
  if (done) return;

  const stmt = db.prepare(
    `UPDATE ships SET drop_offs_json = @drop_offs_json WHERE id = @id`,
  );
  const mark = db.prepare(
    `INSERT INTO app_kv (key, value) VALUES (?, ?)`,
  );
  const run = db.transaction(() => {
    for (const seed of SHIP_SEED_ROWS) {
      if (!seed.dropOffsJson) continue;
      stmt.run({ id: seed.id, drop_offs_json: seed.dropOffsJson });
    }
    mark.run(MIGRATION_MULTI_MID_DROPOFFS_KEY, "1");
  });
  run();
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  seedIfEmpty(db);
  backfillShipmentGeometry(db);
  backfillDropOffsFromSeeds(db);
  migrateMultiMidDropOffsFromSeeds(db);
  migrateSeedCrmContactsFromSeeds(db);
  seedScenarioSettingsIfEmpty(db);
  dbInstance = db;
  return db;
}

const SHIP_SELECT = `
  id, state, region, route_from, route_to, status, is_primary,
  notes, carrier, equipment, customer_ref,
  driver_name, driver_phone, driver_email, driver_org,
  dispatcher_name, dispatcher_phone, dispatcher_email, dispatcher_org,
  origin_lng, origin_lat, dest_lng, dest_lat, origin_label, dest_label,
  hub_lng, hub_lat, hub_label, stall_lng, stall_lat, alt_waypoint_lng, alt_waypoint_lat,
  priority, cargo, sla_penalty_per_hour, original_eta, blizzard_corridor, route_variants_json, crm_timeline_json, drop_offs_json,
  optimizing_selected_route, optimizing_route_opt_out
`;

type ShipSqlRow = Parameters<typeof rowToShip>[0];

export function listShips(): ActiveShipment[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT ${SHIP_SELECT} FROM ships ORDER BY is_primary DESC, id ASC`)
    .all() as ShipSqlRow[];
  return rows.map(rowToShip);
}

export function getShip(id: string): ActiveShipment | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${SHIP_SELECT} FROM ships WHERE id = ?`)
    .get(id) as ShipSqlRow | undefined;
  return row ? rowToShip(row) : null;
}

function clearPrimaryExcept(db: Database.Database, exceptId?: string) {
  if (exceptId) {
    db.prepare("UPDATE ships SET is_primary = 0 WHERE id != ?").run(exceptId);
  } else {
    db.prepare("UPDATE ships SET is_primary = 0").run();
  }
}

export function insertShip(input: ActiveShipment): ActiveShipment {
  const end = endpointsForLane(input.routeFrom, input.routeTo, input.state);
  const merged: ActiveShipment = syncDestFromDropOffsJson({
    ...input,
    originLng: input.originLng || end.originLng,
    originLat: input.originLat || end.originLat,
    destLng: input.destLng || end.destLng,
    destLat: input.destLat || end.destLat,
  });
  const db = getDb();
  const run = db.transaction(() => {
    if (merged.isPrimary) {
      clearPrimaryExcept(db);
    }
    db.prepare(
      `
      INSERT INTO ships (id, state, region, route_from, route_to, status, is_primary, notes, carrier, equipment, customer_ref,
        driver_name, driver_phone, driver_email, driver_org, dispatcher_name, dispatcher_phone, dispatcher_email, dispatcher_org,
        origin_lng, origin_lat, dest_lng, dest_lat, origin_label, dest_label,
        hub_lng, hub_lat, hub_label, stall_lng, stall_lat, alt_waypoint_lng, alt_waypoint_lat,
        priority, cargo, sla_penalty_per_hour, original_eta, blizzard_corridor, route_variants_json, crm_timeline_json, drop_offs_json,
        optimizing_selected_route, optimizing_route_opt_out)
      VALUES (@id, @state, @region, @route_from, @route_to, @status, @is_primary, @notes, @carrier, @equipment, @customer_ref,
        @driver_name, @driver_phone, @driver_email, @driver_org, @dispatcher_name, @dispatcher_phone, @dispatcher_email, @dispatcher_org,
        @origin_lng, @origin_lat, @dest_lng, @dest_lat, @origin_label, @dest_label,
        @hub_lng, @hub_lat, @hub_label, @stall_lng, @stall_lat, @alt_waypoint_lng, @alt_waypoint_lat,
        @priority, @cargo, @sla_penalty_per_hour, @original_eta, @blizzard_corridor, @route_variants_json, @crm_timeline_json, @drop_offs_json,
        @optimizing_selected_route, @optimizing_route_opt_out)
    `,
    ).run(activeShipmentToParams(merged));
  });
  run();
  return getShip(merged.id)!;
}

export function updateShip(
  id: string,
  patch: Partial<Omit<ActiveShipment, "id">>,
  opts?: { skipRouteRevision?: boolean },
): ActiveShipment | null {
  const db = getDb();
  const existing = getShip(id);
  if (!existing) return null;

  const next: ActiveShipment = syncDestFromDropOffsJson({
    ...existing,
    ...patch,
    id,
  });

  const run = db.transaction(() => {
    if (patch.isPrimary === true) {
      clearPrimaryExcept(db, id);
    }
    db.prepare(
      `
      UPDATE ships SET
        state = @state,
        region = @region,
        route_from = @route_from,
        route_to = @route_to,
        status = @status,
        is_primary = @is_primary,
        notes = @notes,
        carrier = @carrier,
        equipment = @equipment,
        customer_ref = @customer_ref,
        driver_name = @driver_name,
        driver_phone = @driver_phone,
        driver_email = @driver_email,
        driver_org = @driver_org,
        dispatcher_name = @dispatcher_name,
        dispatcher_phone = @dispatcher_phone,
        dispatcher_email = @dispatcher_email,
        dispatcher_org = @dispatcher_org,
        origin_lng = @origin_lng,
        origin_lat = @origin_lat,
        dest_lng = @dest_lng,
        dest_lat = @dest_lat,
        origin_label = @origin_label,
        dest_label = @dest_label,
        hub_lng = @hub_lng,
        hub_lat = @hub_lat,
        hub_label = @hub_label,
        stall_lng = @stall_lng,
        stall_lat = @stall_lat,
        alt_waypoint_lng = @alt_waypoint_lng,
        alt_waypoint_lat = @alt_waypoint_lat,
        priority = @priority,
        cargo = @cargo,
        sla_penalty_per_hour = @sla_penalty_per_hour,
        original_eta = @original_eta,
        blizzard_corridor = @blizzard_corridor,
        route_variants_json = @route_variants_json,
        crm_timeline_json = @crm_timeline_json,
        drop_offs_json = @drop_offs_json,
        optimizing_selected_route = @optimizing_selected_route,
        optimizing_route_opt_out = @optimizing_route_opt_out
      WHERE id = @id
    `,
    ).run(activeShipmentToParams(next));
    if (
      !opts?.skipRouteRevision &&
      !routeSnapshotsEqual(existing, next)
    ) {
      insertRouteRevision(
        db,
        id,
        next,
        revisionSummaryFromDiff(existing, next),
      );
    }
  });
  run();
  return getShip(id);
}

export function deleteShip(id: string): boolean {
  const db = getDb();
  ensureShipRouteRevisionsTable(db);
  ensureDriverRouteAckTable(db);
  let removed = false;
  const run = db.transaction(() => {
    db.prepare("DELETE FROM ship_route_revisions WHERE ship_id = ?").run(id);
    db.prepare("DELETE FROM driver_route_notice_ack WHERE ship_id = ?").run(id);
    const r = db.prepare("DELETE FROM ships WHERE id = ?").run(id);
    removed = r.changes > 0;
  });
  run();
  return removed;
}

function rowToCompanyProfile(row: {
  company_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  hq_line1: string | null;
  hq_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  website: string | null;
  updated_at: string | null;
}): CompanyProfile {
  return {
    companyName: row.company_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    hqLine1: row.hq_line1,
    hqLine2: row.hq_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    website: row.website,
    updatedAt: row.updated_at,
  };
}

export function getCompanyProfile(): CompanyProfile {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT company_name, contact_email, contact_phone, hq_line1, hq_line2,
              city, state, postal_code, website, updated_at
       FROM company_profile WHERE id = 1`,
    )
    .get() as
    | {
        company_name: string;
        contact_email: string | null;
        contact_phone: string | null;
        hq_line1: string | null;
        hq_line2: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        website: string | null;
        updated_at: string | null;
      }
    | undefined;
  if (!row) return DEFAULT_COMPANY_PROFILE;
  return rowToCompanyProfile(row);
}

export function updateCompanyProfile(
  patch: Partial<CompanyProfile>,
): CompanyProfile {
  const db = getDb();
  const current = getCompanyProfile();
  const next: CompanyProfile = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `
    UPDATE company_profile SET
      company_name = @company_name,
      contact_email = @contact_email,
      contact_phone = @contact_phone,
      hq_line1 = @hq_line1,
      hq_line2 = @hq_line2,
      city = @city,
      state = @state,
      postal_code = @postal_code,
      website = @website,
      updated_at = @updated_at
    WHERE id = 1
  `,
  ).run({
    company_name: next.companyName,
    contact_email: next.contactEmail,
    contact_phone: next.contactPhone,
    hq_line1: next.hqLine1,
    hq_line2: next.hqLine2,
    city: next.city,
    state: next.state,
    postal_code: next.postalCode,
    website: next.website,
    updated_at: next.updatedAt,
  });
  return getCompanyProfile();
}

const WEATHER_EVENTS_SNAPSHOT_KEY = "weather_events_snapshot";

/** Persist last successful ``GET /api/weather-events`` JSON for offline path / attention UI. */
export function saveWeatherEventsSnapshot(payloadJson: string): void {
  const db = getDb();
  ensureAppKvTable(db);
  db.prepare(
    `
    INSERT INTO app_kv (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
  ).run(WEATHER_EVENTS_SNAPSHOT_KEY, payloadJson);
}

/** Raw JSON from ``saveWeatherEventsSnapshot``, or null if never refreshed. */
export function getWeatherEventsSnapshot(): string | null {
  const db = getDb();
  ensureAppKvTable(db);
  const row = db
    .prepare(`SELECT value FROM app_kv WHERE key = ?`)
    .get(WEATHER_EVENTS_SNAPSHOT_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}
