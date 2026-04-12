/**
 * Context for Driver Pivt: committed Optimizing option (SQLite + Google) and/or
 * Facility Pivt guidance when no route letter is committed.
 */
import {
  buildFacilityMapsPlan,
  synthesizeFacilityCore,
  type FacilityAgentCore,
} from "@/lib/facility-maps-plan";
import { driverRouteFingerprint } from "@/lib/driver-route-fingerprint";
import { getDriverRouteAckMemory } from "@/lib/driver-notice-state";
import { computeRouteOptions } from "@/lib/google-route-options";
import type { ActiveShipment } from "@/lib/shipments";

export type OptimizingCommittedSnapshot = {
  option: string;
  label: string;
  routeSummary: string;
  distanceMi: number;
  durationMin: number;
  eta: string;
  cost: string;
  description: string;
};

export type DriverRouteGuidance = {
  optimizing_committed: OptimizingCommittedSnapshot | null;
  /** Present when facility Maps plan was evaluated for this draft. */
  facility: FacilityAgentCore | null;
  /** Text block appended to the Driver Pivt system prompt. */
  prompt_block: string;
  route_notice: {
    current_fingerprint: string;
    last_acknowledged_fingerprint: string | null;
    last_acknowledged_at: string | null;
    suppress_full_route_repeat: boolean;
  };
};

function buildPromptBlock(
  optimizing: OptimizingCommittedSnapshot | null,
  facility: FacilityAgentCore | null,
  ctx: {
    suppressFullRouteRepeat: boolean;
    lastAcknowledgedAt: string | null;
  },
): string {
  const lines: string[] = [
    "## Authorized route / fulfilment (must appear accurately in draft_customer_notice)",
    "### Tone and framing (required)",
    '- Do **not** say the driver was on a "wrong", "incorrect", or "bad" route. Plans change as ops and agents update — keep language neutral.',
    '- When the route or stops changed, open with something like: **"Your route has been updated. Please use the following new route:"** then the details.',
  ];

  if (ctx.suppressFullRouteRepeat) {
    const when = ctx.lastAcknowledgedAt
      ? ` (recorded **${ctx.lastAcknowledgedAt}**)`
      : "";
    lines.push(
      "## Operator memory — do not repeat the full route",
      `- A notice for **this same route** was already sent to the driver${when}.`,
      "- Draft a **short** follow-up only (check-in, timing, weather, confirmation). Do **not** restate the full highway-by-highway recap, full option comparison, or long stop list unless resolution/scenario clearly adds **new** facts.",
    );
    return lines.join("\n");
  }

  if (optimizing) {
    lines.push(
      `- **Committed route (Optimizing Pivt):** Option **${optimizing.option}** — ${optimizing.label}. ` +
        `Drive **${optimizing.routeSummary}**, about **${optimizing.distanceMi} mi**, **${optimizing.eta}** ETA, ` +
        `modeled cost **${optimizing.cost}**. ${optimizing.description}`,
    );
    lines.push(
      `- Instruct the driver to follow this option — present it as the **current / updated** plan, not a correction of a mistake.`,
    );
  }
  if (facility) {
    const m = facility.maps;
    lines.push(
      `- **Facility Pivt plan:** recommendation \`${facility.recommendation}\`, ` +
        `hub/anchor label **${facility.hub_label}**, hub_viable=${facility.hub_viable}. ` +
        `Mode: **${m.recommended_mode}**.`,
    );
    const rat = facility.rationale;
    lines.push(
      `- Summary: ${rat.length > 480 ? `${rat.slice(0, 477)}…` : rat}`,
    );
    if (m.best_relay) {
      lines.push(
        `- **Relay anchor (Google):** ${m.best_relay.code} — ${m.best_relay.summary}, ` +
          `${m.best_relay.distance_mi} mi, ~$${m.best_relay.total_cost_usd}, ${m.best_relay.duration_min} min.`,
      );
    }
    if (m.best_alternate) {
      lines.push(
        `- **Alternate mainline (Google):** #${m.best_alternate.routeIndex} ${m.best_alternate.summary}, ` +
          `~$${m.best_alternate.total_cost_usd}.`,
      );
    }
    if (m.best_stop_order) {
      lines.push(
        `- **Stop order (Google):** ${m.best_stop_order.stop_order.join(" → ")} ` +
          `(${m.best_stop_order.duration_min} min, ~$${m.best_stop_order.total_cost_usd}).`,
      );
    }
  }
  if (!optimizing && !facility) {
    lines.push(
      "- No committed optimizing option in the database and Maps context unavailable — " +
        "reference the lane only and ask the driver to await dispatch.",
    );
  }
  return lines.join("\n");
}

export async function buildDriverRouteGuidance(
  ship: ActiveShipment,
  fleet: ActiveShipment[],
  apiKey: string | null,
): Promise<DriverRouteGuidance> {
  let optimizing_committed: OptimizingCommittedSnapshot | null = null;
  const letter = ship.optimizingSelectedRoute?.trim().toUpperCase().slice(0, 1);
  if (letter && /^[A-Z]$/.test(letter) && apiKey) {
    const opts = await computeRouteOptions(ship, apiKey);
    const row = opts.find((o) => o.option === letter);
    if (row) {
      optimizing_committed = {
        option: row.option,
        label: row.label,
        routeSummary: row.routeSummary,
        distanceMi: row.distanceMi,
        durationMin: row.durationMin,
        eta: row.eta,
        cost: row.cost,
        description: row.description,
      };
    }
  }

  let facility: FacilityAgentCore | null = null;
  const runFacility =
    Boolean(apiKey) &&
    (ship.optimizingRouteOptOut ||
      !ship.optimizingSelectedRoute ||
      !optimizing_committed);
  if (runFacility && apiKey) {
    const mapsPlan = await buildFacilityMapsPlan(ship, fleet, apiKey);
    facility = synthesizeFacilityCore(ship, mapsPlan);
  }

  const current_fingerprint = driverRouteFingerprint(ship);
  const ack = await getDriverRouteAckMemory(ship.id);
  const suppress_full_route_repeat = Boolean(
    ack && ack.fingerprint === current_fingerprint,
  );

  return {
    optimizing_committed,
    facility,
    prompt_block: buildPromptBlock(optimizing_committed, facility, {
      suppressFullRouteRepeat: suppress_full_route_repeat,
      lastAcknowledgedAt: ack?.acknowledgedAt ?? null,
    }),
    route_notice: {
      current_fingerprint,
      last_acknowledged_fingerprint: ack?.fingerprint ?? null,
      last_acknowledged_at: ack?.acknowledgedAt ?? null,
      suppress_full_route_repeat,
    },
  };
}
