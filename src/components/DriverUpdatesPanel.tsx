"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ActiveShipment } from "@/lib/shipments";
import {
  getDriverCrmForActiveShipment,
  kindLabel,
  type TimelineEntry,
} from "@/lib/driver-crm";
import type { ResolutionOutput } from "@/lib/simulation";
import { main } from "@/lib/ui-copy";

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function smsHref(phone: string) {
  const n = phone.replace(/[^\d+]/g, "");
  return `sms:${n}`;
}

interface OutboundMsg {
  id: string;
  shipmentId: string;
  channel: "message" | "email";
  body: string;
  at: string;
}

interface DriverUpdatesPanelProps {
  fleet: ActiveShipment[];
  selectedShipmentId: string | null;
  onSelectShipment: (id: string) => void;
  resolution: ResolutionOutput | null;
  emailSent: boolean;
  onSendCustomerDraft: () => void;
}

export function DriverUpdatesPanel({
  fleet,
  selectedShipmentId,
  onSelectShipment,
  resolution,
  emailSent,
  onSendCustomerDraft,
}: DriverUpdatesPanelProps) {
  const loadIds = useMemo(
    () => fleet.map((s) => s.id).sort(),
    [fleet],
  );

  const selectedId =
    selectedShipmentId && fleet.some((s) => s.id === selectedShipmentId)
      ? selectedShipmentId
      : (fleet[0]?.id ?? "");

  const [composer, setComposer] = useState("");
  const [outbound, setOutbound] = useState<OutboundMsg[]>([]);

  const crm = useMemo(() => {
    const ship =
      fleet.find((s) => s.id === selectedId) ?? fleet[0]!;
    return getDriverCrmForActiveShipment(ship);
  }, [fleet, selectedId]);

  const mergedTimeline = useMemo(() => {
    const rows: TimelineEntry[] = [...crm.timeline];
    for (const m of outbound) {
      if (m.shipmentId !== selectedId) continue;
      rows.push({
        id: m.id,
        kind: m.channel === "email" ? "email" : "sms",
        direction: "out",
        summary:
          m.channel === "email"
            ? `Email queued — ${m.body.slice(0, 80)}${m.body.length > 80 ? "…" : ""}`
            : `Text sent — ${m.body.slice(0, 80)}${m.body.length > 80 ? "…" : ""}`,
        at: m.at,
        party: "You",
      });
    }
    return rows;
  }, [crm.timeline, outbound, selectedId]);

  if (fleet.length === 0) {
    return (
      <p className="border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        {main.driverCrmEmptyFleet}
      </p>
    );
  }

  function sendToDriver(channel: "message" | "email") {
    const t = composer.trim();
    if (!t) return;
    setOutbound((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        shipmentId: selectedId,
        channel,
        body: t,
        at: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setComposer("");
  }

  const singleLoad = fleet.length === 1;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {main.driverCrmLoadLabel}
        </label>
        {singleLoad ? (
          <p className="border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[12px] font-semibold text-[var(--foreground)]">
            {fleet[0].id}
            {fleet[0].isPrimary ? (
              <span className="ml-1.5 text-[10px] font-normal text-[var(--muted)]">
                · featured
              </span>
            ) : null}
          </p>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => onSelectShipment(e.target.value)}
            className="w-full max-w-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
          >
            {loadIds.map((id) => {
              const ship = fleet.find((s) => s.id === id);
              return (
                <option key={id} value={id}>
                  {id}
                  {ship?.isPrimary ? " · featured" : ""}
                </option>
              );
            })}
          </select>
        )}
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {main.driverCrmDriverCard}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-tight text-[var(--foreground)]">
            {crm.driver.name}
          </p>
          <p className="text-[10px] text-[var(--muted)]">{crm.driver.org}</p>
          <p className="mt-1.5 font-mono text-[11px] text-[var(--foreground)]">
            {crm.driver.phone}
          </p>
          <p className="font-mono text-[11px] text-[var(--accent)]">
            {crm.driver.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ActionLink href={telHref(crm.driver.phone)} label={main.driverCrmCall} />
            <ActionLink href={smsHref(crm.driver.phone)} label={main.driverCrmText} />
            <ActionLink
              href={`mailto:${crm.driver.email}?subject=Load%20${encodeURIComponent(selectedId)}`}
              label={main.driverCrmEmail}
            />
          </div>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {main.driverCrmDispatchCard}
          </p>
          <p className="mt-1 text-[14px] font-semibold leading-tight text-[var(--foreground)]">
            {crm.dispatcher.name}
          </p>
          <p className="text-[10px] text-[var(--muted)]">{crm.dispatcher.org}</p>
          <p className="mt-1.5 font-mono text-[11px] text-[var(--foreground)]">
            {crm.dispatcher.phone}
          </p>
          <p className="font-mono text-[11px] text-[var(--accent)]">
            {crm.dispatcher.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ActionLink
              href={telHref(crm.dispatcher.phone)}
              label={main.driverCrmCallDispatch}
            />
            <ActionLink
              href={`mailto:${crm.dispatcher.email}?subject=Load%20${encodeURIComponent(selectedId)}`}
              label={main.driverCrmEmail}
            />
          </div>
        </div>
      </div>

      <div className="border border-[var(--border)] bg-[var(--surface-card)] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {main.driverCrmComposerLabel}
        </p>
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          rows={2}
          placeholder={main.driverCrmComposerPlaceholder}
          className="mt-1.5 w-full resize-y border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => sendToDriver("message")}
            disabled={!composer.trim()}
            className="bg-[var(--accent)] px-4 py-1.5 text-[11px] font-semibold text-[var(--accent-foreground)] disabled:opacity-40"
          >
            {main.driverCrmSendMessage}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => sendToDriver("email")}
            disabled={!composer.trim()}
            className="border border-[var(--foreground)] px-4 py-1.5 text-[11px] font-medium text-[var(--foreground)] disabled:opacity-40"
          >
            {main.driverCrmQueueEmail}
          </motion.button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {main.driverCrmTimelineTitle}
        </p>
        <div className="space-y-1 border border-[var(--border)] bg-[var(--surface)] p-2">
          {mergedTimeline.map((row) => (
            <div
              key={row.id}
              className="flex gap-2 border-b border-[var(--border)]/60 py-1.5 last:border-0"
            >
              <span className="w-12 shrink-0 font-mono text-[9px] text-[var(--muted)]">
                {row.at}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="bg-white/8 px-1.5 py-0.5 text-[8px] font-medium uppercase text-[var(--muted)]">
                    {kindLabel(row.kind)}
                  </span>
                  <span className="text-[9px] text-[var(--text-tertiary)]">
                    {row.direction === "in" ? "In" : "Out"} · {row.party}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--foreground)]">
                  {row.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/[0.05] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]">
          {main.driverCrmCustomerDraftTitle}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
          {main.driverCrmCustomerDraftHint}
        </p>
        {resolution ? (
          <div className="mt-2 space-y-2">
            <div className="border border-[var(--border)] bg-[var(--surface)] p-2">
              <p className="whitespace-pre-line font-mono text-[10px] leading-relaxed text-[var(--muted)]">
                {resolution.customerComms}
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={onSendCustomerDraft}
              disabled={emailSent}
              className={`w-full border border-transparent py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                emailSent
                  ? "border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90"
              }`}
            >
              {emailSent ? main.driverCrmCustomerSent : main.driverCrmCustomerSend}
            </motion.button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
            {main.driverCrmCustomerDraftEmpty}
          </p>
        )}
      </div>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex border border-[var(--border)] bg-[var(--surface-card)] px-2.5 py-1 text-[10px] font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
    >
      {label}
    </a>
  );
}
