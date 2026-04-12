import { NextResponse } from "next/server";
import { getShip, listShips } from "@/lib/db/ships-db";
import { googleMapsServerApiKey } from "@/lib/google-directions-polyline";
import {
  computeRouteOptions,
  toRouteOptionRows,
} from "@/lib/google-route-options";
import { routeOptionsForScenario } from "@/lib/routeOptions";
import { primaryShipment } from "@/lib/shipments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shipmentId = searchParams.get("shipmentId")?.trim() ?? null;

  const ship = shipmentId ? getShip(shipmentId) : null;
  if (!ship) {
    const fleet = listShips();
    const fallbackBundle = routeOptionsForScenario(
      "blizzard",
      0,
      primaryShipment(fleet),
    );
    return NextResponse.json({
      source: "fallback",
      shipmentId: null,
      rows: fallbackBundle.rows,
      riskBanner: fallbackBundle.riskBanner,
    });
  }

  const apiKey = googleMapsServerApiKey();
  const computed = await computeRouteOptions(ship, apiKey);

  if (computed.length === 0) {
    const fleet = listShips();
    const fallbackBundle = routeOptionsForScenario(
      "blizzard",
      0,
      primaryShipment(fleet),
    );
    return NextResponse.json({
      source: "fallback",
      shipmentId: ship.id,
      rows: fallbackBundle.rows,
      riskBanner: fallbackBundle.riskBanner,
    });
  }

  const rows = toRouteOptionRows(computed);
  const recommended = computed.find((r) => r.approved);
  const riskBanner = recommended
    ? `Recommended: Option ${recommended.option} (${recommended.label.split("—")[1]?.trim() ?? ""}). Cost ${recommended.cost}, ETA ${recommended.eta}. Routes ordered by total cost — cheapest first.`
    : "Review the options below and select a route.";

  return NextResponse.json({
    source: "google_maps",
    shipmentId: ship.id,
    rows,
    computed,
    riskBanner,
  });
}
