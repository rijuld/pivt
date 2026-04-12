"use client";

import type { ReactNode } from "react";
import { parsePivotAgentJson } from "@/lib/agent-json-summary";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] first:mt-0">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-[var(--foreground)]">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

export function AgentRunSummaryBody({
  summary,
  omitRouteOptionsTable,
}: {
  summary: string;
  /** When true, Optimizing Pivt hides the HTML table (route cards live in the Next steps modal). */
  omitRouteOptionsTable?: boolean;
}) {
  const o = parsePivotAgentJson(summary);
  if (!o) {
    return (
      <p className="text-[12px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
        {summary}
      </p>
    );
  }

  const agent = String(o.agent ?? "");

  if (agent === "optimizing_pivt") {
    const options = Array.isArray(o.options)
      ? (o.options as Record<string, unknown>[])
      : [];
    const trade = String(o.trade_off_summary ?? "");
    const rec = o.recommended_option != null ? String(o.recommended_option) : "—";
    const recLabel = String(o.recommended_label ?? "");
    const source = String(o.source ?? "");

    return (
      <div className="space-y-1 text-[var(--foreground)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
          <span className="font-mono text-[11px] text-[var(--accent)]">
            {String(o.shipment_id ?? "—")}
          </span>
          <span className="text-[10px] text-[var(--muted)]">{String(o.scenario ?? "")}</span>
          {source ? (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-[var(--muted)]">
              {source}
            </span>
          ) : null}
        </div>
        <SectionTitle>Recommended</SectionTitle>
        <p className="text-[13px] font-semibold text-[var(--accent)]">
          Option {rec}
          {recLabel ? ` — ${recLabel}` : ""}
        </p>
        {options.length > 0 && !omitRouteOptionsTable ? (
          <>
            <SectionTitle>Route options</SectionTitle>
            <div className="overflow-x-auto rounded border border-[var(--border)]">
              <table className="w-full min-w-[280px] text-left text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <th className="px-2 py-1.5 font-semibold">Opt</th>
                    <th className="px-2 py-1.5 font-semibold">Label</th>
                    <th className="px-2 py-1.5 font-semibold">Cost</th>
                    <th className="px-2 py-1.5 font-semibold">ETA</th>
                    <th className="px-2 py-1.5 font-semibold">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((row, i) => {
                    const opt = String(row.option ?? "");
                    const isRec = opt === rec;
                    return (
                      <tr
                        key={i}
                        className={
                          isRec
                            ? "bg-[var(--accent)]/10"
                            : "border-t border-[var(--border)]/60"
                        }
                      >
                        <td className="px-2 py-1.5 font-mono">{opt}</td>
                        <td className="px-2 py-1.5">{String(row.label ?? "—")}</td>
                        <td className="px-2 py-1.5 font-mono">{String(row.cost ?? "—")}</td>
                        <td className="px-2 py-1.5">{String(row.eta ?? "—")}</td>
                        <td className="px-2 py-1.5">{String(row.sla_penalty ?? "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {trade ? (
          <>
            <SectionTitle>Trade-off</SectionTitle>
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">{trade}</p>
          </>
        ) : null}
        {o.notes != null && String(o.notes).trim() ? (
          <>
            <SectionTitle>Notes</SectionTitle>
            <p className="text-[11px] text-[var(--muted)]">{String(o.notes)}</p>
          </>
        ) : null}
      </div>
    );
  }

  if (agent === "routing_pivt") {
    const steps = Array.isArray(o.recommended_next_steps)
      ? (o.recommended_next_steps as string[]).filter((x) => typeof x === "string")
      : [];
    const evidence = Array.isArray(o.evidence)
      ? (o.evidence as string[]).filter((x) => typeof x === "string")
      : [];
    return (
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-[var(--foreground)]">
          {String(o.weather_summary ?? "—")}
        </p>
        <p className="text-[10px] text-[var(--muted)]">
          Exception trigger:{" "}
          <span
            className={
              o.exception_trigger === true ? "font-semibold text-rose-300" : "text-emerald-400/90"
            }
          >
            {o.exception_trigger === true ? "Yes" : "No"}
          </span>
          {" · "}
          Confidence: {String(o.confidence ?? "—")}
        </p>
        {evidence.length > 0 ? (
          <>
            <SectionTitle>Evidence</SectionTitle>
            <BulletList items={evidence} />
          </>
        ) : null}
        {steps.length > 0 ? (
          <>
            <SectionTitle>Next steps</SectionTitle>
            <BulletList items={steps} />
          </>
        ) : null}
      </div>
    );
  }

  if (agent === "facility_pivt") {
    const recOrder = Array.isArray(o.recommended_stop_order)
      ? (o.recommended_stop_order as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    return (
      <div className="space-y-2 text-[11px] leading-relaxed">
        <p>
          <span className="text-[var(--text-tertiary)]">Hub viable:</span>{" "}
          {o.hub_viable === true ? "Yes" : o.hub_viable === false ? "No" : "—"}
          {o.hub_label != null ? ` (${String(o.hub_label)})` : ""}
        </p>
        <p>
          <span className="text-[var(--text-tertiary)]">Recommendation:</span>{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {String(o.recommendation ?? "—")}
          </span>
        </p>
        {recOrder.length > 0 ? (
          <p>
            <span className="text-[var(--text-tertiary)]">
              Suggested stop sequence:
            </span>{" "}
            <span className="text-[var(--foreground)]">{recOrder.join(" → ")}</span>
          </p>
        ) : null}
        <p className="text-[var(--muted)]">{String(o.rationale ?? "")}</p>
      </div>
    );
  }

  if (agent === "disaster_management_pivt") {
    const staging = Array.isArray(o.staging_recommendations)
      ? (o.staging_recommendations as string[]).filter((x) => typeof x === "string")
      : [];
    const coord = Array.isArray(o.coordination_notes)
      ? (o.coordination_notes as string[]).filter((x) => typeof x === "string")
      : [];
    const continuity = Array.isArray(o.continuity_focus)
      ? (o.continuity_focus as string[]).filter((x) => typeof x === "string")
      : [];
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-[var(--muted)]">
          EM preparedness:{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {String(o.em_preparedness ?? "—")}
          </span>
        </p>
        {continuity.length > 0 ? (
          <>
            <SectionTitle>Continuity focus</SectionTitle>
            <BulletList items={continuity} />
          </>
        ) : null}
        {staging.length > 0 ? (
          <>
            <SectionTitle>Staging</SectionTitle>
            <BulletList items={staging} />
          </>
        ) : null}
        {coord.length > 0 ? (
          <>
            <SectionTitle>Coordination</SectionTitle>
            <BulletList items={coord} />
          </>
        ) : null}
        {o.public_safety_alignment ? (
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            <span className="text-[var(--text-tertiary)]">Public safety alignment: </span>
            {String(o.public_safety_alignment)}
          </p>
        ) : null}
        {o.mutual_aid_or_escalation ? (
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]">
            <span className="text-[var(--text-tertiary)]">Escalation: </span>
            {String(o.mutual_aid_or_escalation)}
          </p>
        ) : null}
      </div>
    );
  }

  if (agent === "driver_pivt") {
    const draft = String(o.draft_customer_notice ?? "");
    const checklist = Array.isArray(o.operator_checklist)
      ? (o.operator_checklist as string[]).filter((x) => typeof x === "string")
      : [];
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-[var(--muted)]">
          Notice ready: {o.notice_ready === true ? "Yes" : "No"}
        </p>
        {draft ? (
          <pre className="whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--surface)] p-3 font-sans text-[11px] leading-relaxed text-[var(--foreground)]">
            {draft}
          </pre>
        ) : null}
        {checklist.length > 0 ? (
          <>
            <SectionTitle>Operator checklist</SectionTitle>
            <BulletList items={checklist} />
          </>
        ) : null}
      </div>
    );
  }

  if (agent === "eis_orchestrator") {
    const risks = Array.isArray(o.key_risks)
      ? (o.key_risks as string[]).filter((x) => typeof x === "string")
      : [];
    const actions = Array.isArray(o.key_actions)
      ? (o.key_actions as string[]).filter((x) => typeof x === "string")
      : [];
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-[var(--muted)]">
          Pipeline: {String(o.pipeline_status ?? "—")}
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--foreground)]">
          {String(o.executive_summary ?? "")}
        </p>
        {risks.length > 0 ? (
          <>
            <SectionTitle>Key risks</SectionTitle>
            <BulletList items={risks} />
          </>
        ) : null}
        {actions.length > 0 ? (
          <>
            <SectionTitle>Next steps</SectionTitle>
            <BulletList items={actions} />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <p className="text-[11px] leading-relaxed text-[var(--muted)]">
      Structured agent response (unknown type).{" "}
      <span className="font-mono text-[10px] text-[var(--foreground)]">{agent || "—"}</span>
    </p>
  );
}
