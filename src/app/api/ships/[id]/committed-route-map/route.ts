import { NextResponse } from "next/server";
import { staticLetterToFallbackRouteMode } from "@/lib/committed-route-visual";
import type { ScenarioKind } from "@/lib/constants";
import { getShip } from "@/lib/db/ships-db";
import { isMultiStop, nextLegShipment } from "@/lib/drop-offs";
import { googleMapsServerApiKey } from "@/lib/google-directions-polyline";
import { computeRouteOptions } from "@/lib/google-route-options";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseScenario(raw: string | null): ScenarioKind {
  const s = raw?.trim().toLowerCase() ?? "";
  if (s === "blizzard" || s === "port_strike" || s === "idle") return s;
  return "idle";
}

/** Geometry / fallback mode for the Route tab map when a load has ``optimizingSelectedRoute``. */
export async function GET(request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    const { searchParams } = new URL(request.url);
    const scenario = parseScenario(searchParams.get("scenario"));

    const ship = getShip(id);
    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }

    const rawLetter = ship.optimizingSelectedRoute?.trim();
    if (!rawLetter) {
      return NextResponse.json(
        { error: "No committed route on this load" },
        { status: 404 },
      );
    }
    const letter = rawLetter.toUpperCase().slice(0, 1);

    const apiKey = googleMapsServerApiKey();
    const routeShip = isMultiStop(ship) ? nextLegShipment(ship) : ship;
    const computed = await computeRouteOptions(routeShip, apiKey);
    const row = computed.find((r) => r.option === letter);

    if (row?.encodedPolyline) {
      return NextResponse.json({
        source: "google_polyline",
        option: row.option,
        label: row.label,
        summary: row.routeSummary,
        encodedPolyline: row.encodedPolyline,
      });
    }

    return NextResponse.json({
      source: "fallback",
      option: letter,
      routeMode: staticLetterToFallbackRouteMode(scenario, letter, ship),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to resolve committed route map" },
      { status: 500 },
    );
  }
}
