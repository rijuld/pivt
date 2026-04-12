import { NextResponse } from "next/server";
import { parseDropOffsFromJson } from "@/lib/drop-offs";
import {
  getShip,
  listShipRouteRevisions,
  revertShipRouteToRevision,
} from "@/lib/db/ships-db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function stopPreview(dropOffsJson: string | null): string {
  const stops = parseDropOffsFromJson(dropOffsJson);
  if (stops && stops.length > 0) return stops.map((s) => s.label).join(" → ");
  return "—";
}

/** List persisted route / stop-order snapshots for the Route updates tab. */
export async function GET(_request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    if (!getShip(id)) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }
    const revisions = listShipRouteRevisions(id).map((r) => ({
      id: r.id,
      shipId: r.shipId,
      createdAt: r.createdAt,
      summary: r.summary,
      dropOffsJson: r.dropOffsJson,
      stopPreview: stopPreview(r.dropOffsJson),
      optimizingSelectedRoute: r.optimizingSelectedRoute,
      optimizingRouteOptOut: r.optimizingRouteOptOut,
    }));
    return NextResponse.json({ revisions });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to list route revisions" },
      { status: 500 },
    );
  }
}

/** Restore ``dropOffsJson`` + committed route fields from a prior revision. */
export async function POST(request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    if (!getShip(id)) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }
    const body = (await request.json()) as { revisionId?: unknown };
    const revisionId = Number(body.revisionId);
    if (!Number.isInteger(revisionId) || revisionId < 1) {
      return NextResponse.json(
        { error: "revisionId must be a positive integer" },
        { status: 400 },
      );
    }
    const ship = revertShipRouteToRevision(id, revisionId);
    if (!ship) {
      return NextResponse.json(
        { error: "Revision not found for this load" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ship });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to revert route revision" },
      { status: 500 },
    );
  }
}
