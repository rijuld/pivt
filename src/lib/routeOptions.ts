import type { ScenarioKind } from "./constants";
import type { ActiveShipment } from "./shipments";
import { routesIntel } from "./ui-copy";

export interface RouteOptionRow {
  option: string;
  label: string;
  description: string;
  eta: string;
  cost: string;
  slaPenalty: string;
  approved: boolean;
}

export interface RouteOptionsBundle {
  title: string;
  subtitle: string;
  rows: RouteOptionRow[];
  riskBanner: string;
}

function parseEtaHours(eta: string): number | null {
  const m = eta.trim().match(/^\+(\d+)\s*h$/i);
  return m ? parseInt(m[1], 10) : null;
}

function formatEtaHours(h: number): string {
  return `+${Math.max(4, Math.round(h))} h`;
}

function parseUsd(cost: string): number {
  const n = parseInt(cost.replace(/[$,]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Deterministic nudge from suggestion pass + row index (roughly ±4–8%). */
function varyUsd(base: number, pass: number, idx: number): number {
  const pct = (((pass * 17 + idx * 23) % 9) - 4) / 100;
  return Math.max(1, Math.round(base * (1 + pct)));
}

function varyEtaHours(base: number, pass: number, idx: number): number {
  const dh = ((pass * 5 + idx * 7) % 7) - 3;
  return base + dh;
}

function applySuggestionPass(
  base: RouteOptionsBundle,
  pass: number,
  kind: ScenarioKind,
): RouteOptionsBundle {
  if (pass <= 0) return base;

  const rows: RouteOptionRow[] = base.rows.map((row, idx) => {
    const h0 = parseEtaHours(row.eta);
    const eta =
      h0 != null
        ? formatEtaHours(varyEtaHours(h0, pass, idx))
        : row.eta;
    const usd = parseUsd(row.cost);
    const cost = usd ? formatUsd(varyUsd(usd, pass, idx)) : row.cost;
    return {
      ...row,
      eta,
      cost,
      description:
        row.description +
        (pass > 0 ? ` (Optimizing Pivt refresh #${pass})` : ""),
    };
  });

  const balanced = rows.find((r) => r.approved) ?? rows[2];
  const isPort = kind === "port_strike";
  const riskBanner =
    isPort
      ? `${routesIntel.riskPrefix}Pass ${pass} refresh: balanced track (${balanced.option}) is ${balanced.cost} · ${balanced.eta}. Port constraints unchanged — confirm before approving.`
      : `${routesIntel.riskPrefix}Pass ${pass} refresh: balanced track (${balanced.option}) is ${balanced.cost} · ${balanced.eta}. Re-check against SLA before approving.`;

  return {
    ...base,
    rows,
    subtitle: `${base.subtitle} · Refresh #${pass}`,
    riskBanner,
  };
}

function laneLabels(primary: ActiveShipment | null): {
  id: string;
  origin: string;
  dest: string;
} {
  if (!primary) {
    return { id: "—", origin: "Origin", dest: "Destination" };
  }
  const origin =
    primary.originLabel?.split(",")[0]?.trim() ?? primary.routeFrom;
  const dest = primary.destLabel?.split(",")[0]?.trim() ?? primary.routeTo;
  return { id: primary.id, origin, dest };
}

function baseBundleForScenario(
  kind: ScenarioKind,
  primary: ActiveShipment | null,
): RouteOptionsBundle {
  const k = kind === "idle" ? "blizzard" : kind;
  const { id, origin, dest } = laneLabels(primary);

  if (k === "port_strike") {
    return {
      title: routesIntel.title,
      subtitle: `For load ${id} · ${origin} to ${dest} (port disruption)`,
      rows: [
        {
          option: "A",
          label: "A — Cheapest",
          description: "Rail to Chicago — lowest cost, longest ETA window.",
          eta: "+32 h",
          cost: "$890",
          slaPenalty: "$6,000",
          approved: false,
        },
        {
          option: "B",
          label: "B — Fastest",
          description: "Air freight uplift — premium spend vs penalty.",
          eta: "+8 h",
          cost: "$9,200",
          slaPenalty: "$6,000",
          approved: false,
        },
        {
          option: "C",
          label: "C — Balanced",
          description: "Philly truck + Columbus hub relay — SLA-safe.",
          eta: "+18 h",
          cost: "$2,100",
          slaPenalty: "$6,000",
          approved: true,
        },
      ],
      riskBanner:
        `${routesIntel.riskPrefix}The port situation rules out the coastal plan. Option C’s cost ($2.1k) is still below the late fee we modeled — flying everything wasn’t worth it.`,
    };
  }

  return {
    title: routesIntel.title,
    subtitle: `For load ${id} · ${origin} to ${dest}`,
    rows: [
      {
        option: "A",
        label: "A — Fastest",
        description: "Air uplift + truck — minimizes ETA, highest premium.",
        eta: "+14 h",
        cost: "$4,800",
        slaPenalty: "$4,000",
        approved: false,
      },
      {
        option: "B",
        label: "B — Cheapest",
        description: "Ground-only — lowest cost, misses SLA window.",
        eta: "+38 h",
        cost: "$640",
        slaPenalty: "$4,000",
        approved: false,
      },
      {
        option: "C",
        label: "C — Balanced",
        description: "Hub relay via Columbus — best penalty vs premium tradeoff.",
        eta: "+22 h",
        cost: "$1,200",
        slaPenalty: "$4,000",
        approved: true,
      },
    ],
    riskBanner:
      `${routesIntel.riskPrefix}Option C keeps the extra cost ($1.2k) below the late fee we expect (~$4k). The fastest air option was set aside unless you override as VIP.`,
  };
}

/**
 * Route alternatives for the active scenario. `suggestionPass` &gt; 0 applies a
 * deterministic “refresh” (nudged ETA/cost) so Optimizing Pivt can suggest new routes.
 */
export function routeOptionsForScenario(
  kind: ScenarioKind,
  suggestionPass = 0,
  primary: ActiveShipment | null = null,
): RouteOptionsBundle {
  const effective: ScenarioKind = kind === "idle" ? "blizzard" : kind;
  const base = baseBundleForScenario(kind, primary);
  return applySuggestionPass(base, suggestionPass, effective);
}
