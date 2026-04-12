"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { endpointsForLane } from "@/lib/db/airport-coords";
import { parseDropOffsFromJson } from "@/lib/drop-offs";
import type { ActiveShipment, ShipmentStatus, USRegion } from "@/lib/shipments";
import { REGIONS } from "@/lib/ship-validation";
import { loadStatusLabel, shipModal } from "@/lib/ui-copy";

type Mode = "create" | "edit";

const STATUSES: ShipmentStatus[] = ["nominal", "at_risk", "exception"];

type DropOffDraft = {
  key: string;
  label: string;
  lat: string;
  lng: string;
};

function newDraftKey() {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function draftsFromShipJson(raw: string | null, idPrefix: string): DropOffDraft[] {
  const parsed = parseDropOffsFromJson(raw);
  if (!parsed?.length) return [];
  return parsed.map((p, i) => ({
    key: `${idPrefix}-${i}-${p.lng}`,
    label: p.label,
    lat: String(p.lat),
    lng: String(p.lng),
  }));
}

/**
 * Returns JSON for the API, or null if no multi-stop data.
 * Sets `error` when a row is partially filled.
 */
function serializeDropOffsJson(
  drafts: DropOffDraft[],
): { json: string | null; error: string | null } {
  const built: { label: string; lat: number; lng: number; sequence: number }[] =
    [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    const label = d.label.trim();
    const latS = d.lat.trim();
    const lngS = d.lng.trim();
    const empty = !label && !latS && !lngS;
    if (empty) continue;

    const lat = Number.parseFloat(latS);
    const lng = Number.parseFloat(lngS);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (label && !hasCoords) {
      return {
        json: null,
        error: `Stop ${i + 1}: enter latitude and longitude, or clear the row.`,
      };
    }
    if ((latS || lngS) && !label) {
      return {
        json: null,
        error: `Stop ${i + 1}: add a place name for every stop with coordinates.`,
      };
    }
    if (!hasCoords || !label) {
      return {
        json: null,
        error: `Stop ${i + 1}: complete place name, latitude, and longitude, or remove the row.`,
      };
    }

    built.push({
      label,
      lat,
      lng,
      sequence: built.length + 1,
    });
  }

  if (built.length === 0) return { json: null, error: null };
  return { json: JSON.stringify(built), error: null };
}

function emptyToNull(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function defaultsForCreate(): ActiveShipment {
  const e = endpointsForLane("NYC", "ORD", "NY");
  return {
    id: "",
    state: "NY",
    region: "Northeast",
    routeFrom: "NYC",
    routeTo: "ORD",
    status: "nominal",
    isPrimary: false,
    notes: null,
    carrier: null,
    equipment: null,
    customerRef: null,
    driverName: null,
    driverPhone: null,
    driverEmail: null,
    driverOrg: null,
    dispatcherName: null,
    dispatcherPhone: null,
    dispatcherEmail: null,
    dispatcherOrg: null,
    originLng: e.originLng,
    originLat: e.originLat,
    destLng: e.destLng,
    destLat: e.destLat,
    originLabel: null,
    destLabel: null,
    hubLng: null,
    hubLat: null,
    hubLabel: null,
    stallLng: null,
    stallLat: null,
    altWaypointLng: null,
    altWaypointLat: null,
    priority: null,
    cargo: null,
    slaPenaltyPerHour: null,
    originalEta: null,
    blizzardCorridor: null,
    routeVariantsJson: null,
    crmTimelineJson: null,
    dropOffsJson: null,
    optimizingSelectedRoute: null,
    optimizingRouteOptOut: false,
  };
}

interface ShipEditorModalProps {
  open: boolean;
  mode: Mode;
  ship: ActiveShipment | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ShipEditorModal({
  open,
  mode,
  ship,
  onClose,
  onSaved,
}: ShipEditorModalProps) {
  const [form, setForm] = useState<ActiveShipment>(defaultsForCreate());
  const [dropOffDrafts, setDropOffDrafts] = useState<DropOffDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && ship) {
      setForm({ ...ship });
      setDropOffDrafts(draftsFromShipJson(ship.dropOffsJson, ship.id));
    } else {
      setForm(defaultsForCreate());
      setDropOffDrafts([]);
    }
  }, [open, mode, ship]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { json: dropOffsJson, error: dropErr } =
      serializeDropOffsJson(dropOffDrafts);
    if (dropErr) {
      setError(dropErr);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/ships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: form.id.trim(),
            state: form.state,
            region: form.region,
            routeFrom: form.routeFrom,
            routeTo: form.routeTo,
            status: form.status,
            isPrimary: form.isPrimary,
            notes: emptyToNull(form.notes),
            carrier: emptyToNull(form.carrier),
            equipment: emptyToNull(form.equipment),
            customerRef: emptyToNull(form.customerRef),
            driverName: emptyToNull(form.driverName),
            driverPhone: emptyToNull(form.driverPhone),
            driverEmail: emptyToNull(form.driverEmail),
            driverOrg: emptyToNull(form.driverOrg),
            dispatcherName: emptyToNull(form.dispatcherName),
            dispatcherPhone: emptyToNull(form.dispatcherPhone),
            dispatcherEmail: emptyToNull(form.dispatcherEmail),
            dispatcherOrg: emptyToNull(form.dispatcherOrg),
            dropOffsJson,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not create ship");
          return;
        }
      } else if (ship) {
        const res = await fetch(
          `/api/ships/${encodeURIComponent(ship.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: form.state,
              region: form.region,
              routeFrom: form.routeFrom,
              routeTo: form.routeTo,
              status: form.status,
              isPrimary: form.isPrimary,
              notes: emptyToNull(form.notes),
              carrier: emptyToNull(form.carrier),
              equipment: emptyToNull(form.equipment),
              customerRef: emptyToNull(form.customerRef),
              driverName: emptyToNull(form.driverName),
              driverPhone: emptyToNull(form.driverPhone),
              driverEmail: emptyToNull(form.driverEmail),
              driverOrg: emptyToNull(form.driverOrg),
              dispatcherName: emptyToNull(form.dispatcherName),
              dispatcherPhone: emptyToNull(form.dispatcherPhone),
              dispatcherEmail: emptyToNull(form.dispatcherEmail),
              dispatcherOrg: emptyToNull(form.dispatcherOrg),
              dropOffsJson,
            }),
          },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not update ship");
          return;
        }
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
            className="relative z-10 flex max-h-[min(92vh,800px)] w-full max-w-2xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-[15px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
                {mode === "create" ? shipModal.addTitle : shipModal.editTitle}
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                {shipModal.addSubtitle}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4"
            >
              <div className="space-y-3">
                <Field label={shipModal.refId}>
                  <input
                    type="text"
                    required
                    disabled={mode === "edit"}
                    value={form.id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        id: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="NY-8472"
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.state}>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      value={form.state}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          state: e.target.value.toUpperCase().slice(0, 2),
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] uppercase text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.region}>
                    <select
                      value={form.region}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          region: e.target.value as USRegion,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.from}>
                    <input
                      type="text"
                      required
                      value={form.routeFrom}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, routeFrom: e.target.value }))
                      }
                      placeholder="NYC"
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.to}>
                    <input
                      type="text"
                      required
                      value={form.routeTo}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, routeTo: e.target.value }))
                      }
                      placeholder="ORD"
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>

                <div className="rounded border border-[var(--border)] bg-[var(--surface-card)]/80 p-3">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {shipModal.dropOffsSection}
                      </p>
                      <p className="mt-1 max-w-xl text-[11px] leading-snug text-[var(--muted)]">
                        {shipModal.dropOffsHint}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDropOffDrafts((rows) => [
                          ...rows,
                          {
                            key: newDraftKey(),
                            label: "",
                            lat: "",
                            lng: "",
                          },
                        ])
                      }
                      className="shrink-0 border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-white/5"
                    >
                      {shipModal.addDropOff}
                    </button>
                  </div>

                  {dropOffDrafts.length === 0 ? (
                    <p className="py-2 text-[12px] text-[var(--muted)]">
                      No extra stops — this load uses one destination from the
                      lane ({shipModal.to}: {form.routeTo}).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dropOffDrafts.map((row, index) => (
                        <li
                          key={row.key}
                          className="border border-[var(--border)] bg-[var(--surface-elevated)] p-3"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                              Stop {index + 1}
                              {index === dropOffDrafts.length - 1 ? " — final" : ""}
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                disabled={index === 0}
                                title={shipModal.moveStopUp}
                                onClick={() =>
                                  setDropOffDrafts((rows) => {
                                    if (index <= 0) return rows;
                                    const next = [...rows];
                                    [next[index - 1], next[index]] = [
                                      next[index]!,
                                      next[index - 1]!,
                                    ];
                                    return next;
                                  })
                                }
                                className="border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={index >= dropOffDrafts.length - 1}
                                title={shipModal.moveStopDown}
                                onClick={() =>
                                  setDropOffDrafts((rows) => {
                                    if (index >= rows.length - 1) return rows;
                                    const next = [...rows];
                                    [next[index], next[index + 1]] = [
                                      next[index + 1]!,
                                      next[index]!,
                                    ];
                                    return next;
                                  })
                                }
                                className="border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDropOffDrafts((rows) =>
                                    rows.filter((r) => r.key !== row.key),
                                  )
                                }
                                className="border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-300/90 hover:bg-rose-500/10"
                              >
                                {shipModal.removeDropOff}
                              </button>
                            </div>
                          </div>
                          <Field label={shipModal.placeLabel}>
                            <input
                              type="text"
                              value={row.label}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDropOffDrafts((rows) =>
                                  rows.map((r) =>
                                    r.key === row.key ? { ...r, label: v } : r,
                                  ),
                                );
                              }}
                              placeholder="e.g. Cleveland, OH"
                              className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                            />
                          </Field>
                          <div className="mt-2 grid grid-cols-2 gap-3">
                            <Field label={shipModal.latitude}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.lat}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDropOffDrafts((rows) =>
                                    rows.map((r) =>
                                      r.key === row.key ? { ...r, lat: v } : r,
                                    ),
                                  );
                                }}
                                placeholder="41.4993"
                                className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                              />
                            </Field>
                            <Field label={shipModal.longitude}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.lng}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDropOffDrafts((rows) =>
                                    rows.map((r) =>
                                      r.key === row.key ? { ...r, lng: v } : r,
                                    ),
                                  );
                                }}
                                placeholder="-81.6944"
                                className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                              />
                            </Field>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Field label={shipModal.status}>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as ShipmentStatus,
                      }))
                    }
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {loadStatusLabel[s]}
                      </option>
                    ))}
                  </select>
                </Field>

                <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                  {shipModal.optionalHeading}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.carrier}>
                    <input
                      type="text"
                      value={form.carrier ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          carrier: e.target.value || null,
                        }))
                      }
                      placeholder="e.g. ACME Freight"
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.equipment}>
                    <input
                      type="text"
                      value={form.equipment ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          equipment: e.target.value || null,
                        }))
                      }
                      placeholder="Dry van, reefer…"
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
                <Field label={shipModal.customerRef}>
                  <input
                    type="text"
                    value={form.customerRef ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        customerRef: e.target.value || null,
                      }))
                    }
                    placeholder="PO-2026-0142"
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  />
                </Field>
                <Field label={shipModal.notes}>
                  <textarea
                    rows={3}
                    value={form.notes ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        notes: e.target.value || null,
                      }))
                    }
                    placeholder="Special handling, dock hours, HazMat…"
                    className="w-full resize-y border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  />
                </Field>

                <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                  {shipModal.driverDispatchHeading}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.driverName}>
                    <input
                      type="text"
                      value={form.driverName ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          driverName: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.driverOrg}>
                    <input
                      type="text"
                      value={form.driverOrg ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          driverOrg: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.driverPhone}>
                    <input
                      type="text"
                      value={form.driverPhone ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          driverPhone: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.driverEmail}>
                    <input
                      type="email"
                      value={form.driverEmail ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          driverEmail: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.dispatcherName}>
                    <input
                      type="text"
                      value={form.dispatcherName ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dispatcherName: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.dispatcherOrg}>
                    <input
                      type="text"
                      value={form.dispatcherOrg ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dispatcherOrg: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={shipModal.dispatcherPhone}>
                    <input
                      type="text"
                      value={form.dispatcherPhone ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dispatcherPhone: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={shipModal.dispatcherEmail}>
                    <input
                      type="email"
                      value={form.dispatcherEmail ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dispatcherEmail: e.target.value || null,
                        }))
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
              </div>

              {error && (
                <p className="mt-3 border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  {error}
                </p>
              )}

              <div className="mt-5 flex shrink-0 gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-[var(--foreground)] py-2.5 text-[12px] font-medium text-[var(--muted)] transition hover:bg-white/5"
                >
                  {shipModal.cancel}
                </button>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileTap={{ scale: submitting ? 1 : 0.98 }}
                  className="flex-1 bg-[var(--accent)] py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90 disabled:opacity-50"
                >
                  {submitting
                    ? shipModal.saving
                    : mode === "create"
                      ? shipModal.create
                      : shipModal.save}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}
