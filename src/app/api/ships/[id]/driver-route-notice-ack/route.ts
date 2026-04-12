import { NextResponse } from "next/server";
import { getShip } from "@/lib/db/ships-db";
import { driverRouteFingerprint } from "@/lib/driver-route-fingerprint";
import { recordDriverRouteNoticeAck } from "@/lib/driver-notice-state";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    const ship = getShip(id);
    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }
    const fingerprint = driverRouteFingerprint(ship);
    const row = await recordDriverRouteNoticeAck(id, fingerprint);
    return NextResponse.json({
      ok: true,
      fingerprint: row.fingerprint,
      acknowledgedAt: row.acknowledgedAt,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to record route notice acknowledgment" },
      { status: 500 },
    );
  }
}
