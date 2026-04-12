import { NextResponse } from "next/server";
import { getCompanyProfile, updateCompanyProfile } from "@/lib/db/ships-db";
import { parseProfilePatch } from "@/lib/profile-validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile = getCompanyProfile();
    return NextResponse.json({ profile });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseProfilePatch(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const profile = updateCompanyProfile(parsed.data);
    return NextResponse.json({ profile });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
