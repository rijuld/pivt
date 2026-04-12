import { NextResponse } from "next/server";
import { getWeatherEventsSnapshot } from "@/lib/db/ships-db";

export const runtime = "nodejs";

/**
 * Returns the last persisted weather-events payload (no NWS call).
 * Populated when ``GET /api/weather-events`` succeeds (e.g. Weather tab refresh).
 */
export async function GET() {
  const raw = getWeatherEventsSnapshot();
  if (!raw) {
    return NextResponse.json({
      cached: false,
      fetchedAt: null,
      totalAlerts: 0,
      fleetRouteCount: 0,
      routesWithAlerts: 0,
      hits: [],
    });
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ...parsed, cached: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid weather snapshot in database" },
      { status: 500 },
    );
  }
}
