/**
 * Client-safe parsing of Pivt agent JSON summaries (same shape as Orchestrate output).
 */

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** Strip prose before JSON / optional markdown fences (client copy of orchestrate normalizer). */
export function normalizeAgentJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const fenced = trimmed.match(
    /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i,
  );
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    return inner.startsWith("{") ? inner : extractFirstJsonObject(inner) ?? inner;
  }
  const inlineFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (inlineFence?.[1]) {
    const inner = inlineFence[1].trim();
    if (inner.startsWith("{"))
      return extractFirstJsonObject(inner) ?? inner;
  }
  if (trimmed.startsWith("{")) return trimmed;
  return extractFirstJsonObject(trimmed) ?? trimmed;
}

export function parsePivotAgentJson(raw: string): Record<string, unknown> | null {
  const normalized = normalizeAgentJsonText(raw);
  if (!normalized.startsWith("{")) return null;
  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** One-line preview for CRM cells — never raw JSON blobs. */
export function agentSummaryOneLiner(raw: string, max = 130): string {
  const o = parsePivotAgentJson(raw);
  if (!o) {
    const t = raw.trim();
    if (t.startsWith("{"))
      return "Agent returned structured data — open Next steps to view.";
    return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
  }
  const agent = o.agent;
  let line = "";
  if (agent === "optimizing_pivt") {
    const opt = o.recommended_option != null ? String(o.recommended_option) : "—";
    const sum = String(o.trade_off_summary ?? "").replace(/\s+/g, " ").trim();
    line = `Recommended option ${opt}. ${sum}`;
  } else if (agent === "routing_pivt") {
    line = String(o.weather_summary ?? "Routing analysis complete");
  } else if (agent === "facility_pivt") {
    line = String(o.rationale ?? o.recommendation ?? "Facility review complete");
  } else if (agent === "driver_pivt") {
    const d = String(o.draft_customer_notice ?? "").replace(/\s+/g, " ").trim();
    line = d || "Driver comms draft ready.";
  } else if (agent === "disaster_management_pivt") {
    const prep = String(o.em_preparedness ?? "—");
    const focus = Array.isArray(o.continuity_focus)
      ? (o.continuity_focus as unknown[]).filter((x) => typeof x === "string").slice(0, 2)
      : [];
    line =
      `Preparedness ${prep}` +
      (focus.length ? ` · ${focus.join("; ")}` : "") +
      ".";
  } else if (agent === "eis_orchestrator") {
    line = String(o.executive_summary ?? "Pipeline summary ready");
  } else {
    line = "Agent result ready.";
  }
  line = line.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trim()}…` : line;
}
