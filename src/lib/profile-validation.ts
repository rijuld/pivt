import type { CompanyProfile } from "@/lib/company-profile";

function optNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

export function parseProfilePatch(
  body: Record<string, unknown>,
):
  | { ok: true; data: Partial<CompanyProfile> }
  | { ok: false; error: string } {
  const out: Partial<CompanyProfile> = {};

  if (Object.prototype.hasOwnProperty.call(body, "companyName")) {
    const t = String(body.companyName ?? "").trim();
    if (!t) return { ok: false, error: "companyName is required and cannot be empty." };
    out.companyName = t;
  }
  if (Object.prototype.hasOwnProperty.call(body, "contactEmail")) {
    out.contactEmail = optNullableString(body.contactEmail);
  }
  if (Object.prototype.hasOwnProperty.call(body, "contactPhone")) {
    out.contactPhone = optNullableString(body.contactPhone);
  }
  if (Object.prototype.hasOwnProperty.call(body, "hqLine1")) {
    out.hqLine1 = optNullableString(body.hqLine1);
  }
  if (Object.prototype.hasOwnProperty.call(body, "hqLine2")) {
    out.hqLine2 = optNullableString(body.hqLine2);
  }
  if (Object.prototype.hasOwnProperty.call(body, "city")) {
    out.city = optNullableString(body.city);
  }
  if (Object.prototype.hasOwnProperty.call(body, "state")) {
    const s = optNullableString(body.state);
    out.state = s ? s.toUpperCase().slice(0, 2) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "postalCode")) {
    out.postalCode = optNullableString(body.postalCode);
  }
  if (Object.prototype.hasOwnProperty.call(body, "website")) {
    out.website = optNullableString(body.website);
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "No valid fields to update." };
  }

  return { ok: true, data: out };
}
