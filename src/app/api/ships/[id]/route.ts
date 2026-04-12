import { NextResponse } from "next/server";
import { deleteShip, getShip, updateShip } from "@/lib/db/ships-db";
import { parsePatchShip } from "@/lib/ship-validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    const existing = getShip(id);
    if (!existing) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parsePatchShip(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const ship = updateShip(id, parsed.data);
    if (!ship) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ship });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update ship" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);
    const existing = getShip(id);
    if (!existing) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 });
    }
    const ok = deleteShip(id);
    if (!ok) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete ship" }, { status: 500 });
  }
}
