/**
 * Parse Driver Pivt Orchestrate JSON (see ``adk/agents/driver_pivt.yaml``).
 * Supports empty ``draft_customer_notice`` — we still extract contacts.
 */
export interface DriverPivtPayload {
  draft_customer_notice: string;
  driverName: string | null;
  driverPhone: string | null;
  notice_ready?: boolean;
  notes?: string | null;
  scenario?: string | null;
  shipment_id?: string | null;
  operator_checklist: string[];
}

function readDriverContacts(o: Record<string, unknown>): {
  driverName: string | null;
  driverPhone: string | null;
} {
  const contacts = o.contacts as Record<string, unknown> | undefined;
  const driver = contacts?.driver as Record<string, unknown> | undefined;
  const driverName =
    typeof driver?.name === "string" && driver.name.trim()
      ? driver.name.trim()
      : null;
  const driverPhone =
    typeof driver?.phone === "string" && driver.phone.trim()
      ? driver.phone.trim()
      : null;
  return { driverName, driverPhone };
}

/**
 * Parse agent JSON when it looks like a Driver Pivt payload (even if ``draft_customer_notice`` is empty).
 */
export function parseDriverPivtPayloadLoose(
  summary: string,
): DriverPivtPayload | null {
  const raw = summary.trim();
  if (!raw.startsWith("{")) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const looksLikeDriver =
      o.agent === "driver_pivt" ||
      Object.prototype.hasOwnProperty.call(o, "draft_customer_notice");
    if (!looksLikeDriver) return null;

    const draftRaw = o.draft_customer_notice;
    const draft =
      typeof draftRaw === "string" ? draftRaw.trim() : "";

    const checklistRaw = o.operator_checklist;
    const operator_checklist = Array.isArray(checklistRaw)
      ? checklistRaw.filter((x): x is string => typeof x === "string")
      : [];

    const { driverName, driverPhone } = readDriverContacts(o);

    return {
      draft_customer_notice: draft,
      driverName,
      driverPhone,
      notice_ready: typeof o.notice_ready === "boolean" ? o.notice_ready : undefined,
      notes: typeof o.notes === "string" ? o.notes : null,
      scenario: typeof o.scenario === "string" ? o.scenario : null,
      shipment_id: typeof o.shipment_id === "string" ? o.shipment_id : null,
      operator_checklist,
    };
  } catch {
    return null;
  }
}

/**
 * Human-readable message for the driver modal.
 * Always uses the Orchestrate agent's ``draft_customer_notice`` — never locally composed text.
 */
export function driverMessageToSend(summary: string): string {
  const p = parseDriverPivtPayloadLoose(summary);

  if (p?.draft_customer_notice?.trim()) {
    return p.draft_customer_notice.trim();
  }

  if (!p) {
    const t = summary.trim();
    if (!t.startsWith("{")) return t || "No message text returned by agent.";
  }

  return "The agent did not return a draft customer notice for this scenario. Try selecting a non-idle scenario (blizzard or port strike) in the footer and running Driver Pivt again.";
}

/** @deprecated Use ``parseDriverPivtPayloadLoose`` — kept for callers that only need a filled draft. */
export interface DriverPivtParsed {
  draft_customer_notice: string;
  driverName: string | null;
  driverPhone: string | null;
  notice_ready?: boolean;
  notes?: string | null;
}

export function parseDriverPivtJson(summary: string): DriverPivtParsed | null {
  const p = parseDriverPivtPayloadLoose(summary);
  if (!p || !p.draft_customer_notice.trim()) return null;
  return {
    draft_customer_notice: p.draft_customer_notice,
    driverName: p.driverName,
    driverPhone: p.driverPhone,
    notice_ready: p.notice_ready,
    notes: p.notes,
  };
}

/** Build ``tel:`` href from a human-readable phone string; returns null if unusable. */
export function phoneToTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length >= 10) return `tel:+${digits}`;
  return null;
}
