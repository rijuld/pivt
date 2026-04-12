"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CompanyProfile } from "@/lib/company-profile";
import { profileModal } from "@/lib/ui-copy";

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

interface CompanyProfileModalProps {
  open: boolean;
  profile: CompanyProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CompanyProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: CompanyProfileModalProps) {
  const [form, setForm] = useState<CompanyProfile | null>(profile);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(profile ? { ...profile } : null);
  }, [open, profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = form ?? profile;
    if (!payload) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: payload.companyName.trim(),
          contactEmail: emptyToNull(payload.contactEmail ?? ""),
          contactPhone: emptyToNull(payload.contactPhone ?? ""),
          hqLine1: emptyToNull(payload.hqLine1 ?? ""),
          hqLine2: emptyToNull(payload.hqLine2 ?? ""),
          city: emptyToNull(payload.city ?? ""),
          state: emptyToNull(payload.state ?? ""),
          postalCode: emptyToNull(payload.postalCode ?? ""),
          website: emptyToNull(payload.website ?? ""),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save profile");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const f = form ?? profile;

  return (
    <AnimatePresence>
      {open && f && (
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
            className="relative z-10 flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-[15px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
                {profileModal.title}
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                {profileModal.subtitle}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4"
            >
              <div className="space-y-3">
                <Field label={profileModal.companyName}>
                  <input
                    type="text"
                    required
                    value={f.companyName}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? { ...prev, companyName: e.target.value }
                          : null,
                      )
                    }
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={profileModal.contactEmail}>
                    <input
                      type="email"
                      value={f.contactEmail ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, contactEmail: e.target.value || null }
                            : null,
                        )
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={profileModal.contactPhone}>
                    <input
                      type="text"
                      value={f.contactPhone ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, contactPhone: e.target.value || null }
                            : null,
                        )
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>

                <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                  {profileModal.optionalHeading}
                </p>
                <Field label={profileModal.hqLine1}>
                  <input
                    type="text"
                    value={f.hqLine1 ?? ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? { ...prev, hqLine1: e.target.value || null }
                          : null,
                      )
                    }
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  />
                </Field>
                <Field label={profileModal.hqLine2}>
                  <input
                    type="text"
                    value={f.hqLine2 ?? ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev
                          ? { ...prev, hqLine2: e.target.value || null }
                          : null,
                      )
                    }
                    className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={profileModal.city}>
                    <input
                      type="text"
                      value={f.city ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, city: e.target.value || null }
                            : null,
                        )
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={profileModal.state}>
                    <input
                      type="text"
                      maxLength={2}
                      value={f.state ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                state:
                                  e.target.value.toUpperCase().slice(0, 2) ||
                                  null,
                              }
                            : null,
                        )
                      }
                      placeholder="e.g. NY"
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] uppercase text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={profileModal.postalCode}>
                    <input
                      type="text"
                      value={f.postalCode ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, postalCode: e.target.value || null }
                            : null,
                        )
                      }
                      className="w-full border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] text-[var(--foreground)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                    />
                  </Field>
                  <Field label={profileModal.website}>
                    <input
                      type="url"
                      value={f.website ?? ""}
                      onChange={(e) =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, website: e.target.value || null }
                            : null,
                        )
                      }
                      placeholder="https://"
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
                  {profileModal.cancel}
                </button>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileTap={{ scale: submitting ? 1 : 0.98 }}
                  className="flex-1 bg-[var(--accent)] py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90 disabled:opacity-50"
                >
                  {submitting ? profileModal.saving : profileModal.save}
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
