import { NextResponse } from "next/server";
import { getScenarioSettings, insertShip, listShips } from "@/lib/db/ships-db";
import { parseCreateShip } from "@/lib/ship-validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ships = listShips();
    const scenario = getScenarioSettings();
    return NextResponse.json({ ships, scenario });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseCreateShip(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const ship = insertShip(parsed.data);
    return NextResponse.json({ ship }, { status: 201 });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return NextResponse.json(
        { error: "A ship with this id already exists." },
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json(
      { error: "Failed to create ship" },
      { status: 500 },
    );
  }
}
