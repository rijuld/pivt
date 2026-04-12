"use client";

import { AnimatePresence, motion } from "framer-motion";
import { phoneToTelHref } from "@/lib/driver-pivt-parse";

function smsComposeHref(phone: string, body: string): string | null {
  const n = phone.replace(/[^\d+]/g, "");
  if (n.replace(/\D/g, "").length < 10) return null;
  const t = body.trim();
  if (!t) return `sms:${n}`;
  return `sms:${n}?body=${encodeURIComponent(t.slice(0, 1800))}`;
}

export interface DriverPivtCommsModalProps {
  open: boolean;
  shipmentId: string;
  driverName: string;
  /** Message script (from agent JSON or fallback). */
  message: string;
  driverPhone: string;
  onClose: () => void;
}

export function DriverPivtCommsModal({
  open,
  shipmentId,
  driverName,
  message,
  driverPhone,
  onClose,
}: DriverPivtCommsModalProps) {
  const telHref = phoneToTelHref(driverPhone);
  const smsHref = smsComposeHref(driverPhone, message);

  function logRouteNoticeAck() {
    void fetch(
      `/api/ships/${encodeURIComponent(shipmentId)}/driver-route-notice-ack`,
      { method: "POST" },
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-pivt-modal-title"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.22, duration: 0.42 }}
            className="relative z-10 flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
              <h2
                id="driver-pivt-modal-title"
                className="text-[15px] font-semibold uppercase tracking-wide text-[var(--foreground)]"
              >
                Driver Pivt
              </h2>
              <p className="mt-1 font-mono text-[11px] text-[var(--accent)]">
                {shipmentId}
                <span className="mx-1.5 text-[var(--border)]">·</span>
                <span className="text-[var(--foreground)]">{driverName}</span>
              </p>
              <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
                Copy or read this aloud when you call or text the driver.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Send message
              </p>
              <div className="mt-2 whitespace-pre-wrap break-words rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px] leading-relaxed text-[var(--foreground)]">
                {message}
              </div>
            </div>
            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-card)] px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] text-[var(--muted)]">
                  {driverPhone ? (
                    <>
                      <span className="text-[var(--text-tertiary)]">On file:</span>{" "}
                      <span className="font-mono text-[var(--foreground)]">
                        {driverPhone}
                      </span>
                    </>
                  ) : (
                    "No driver phone on file — add one in CRM or the agent context."
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {telHref ? (
                    <a
                      href={telHref}
                      className="inline-flex min-h-[2.25rem] items-center justify-center border border-emerald-500/50 bg-emerald-500/15 px-4 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                      Call driver
                    </a>
                  ) : (
                    <span className="inline-flex min-h-[2.25rem] cursor-not-allowed items-center justify-center border border-[var(--border)] px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      Call unavailable
                    </span>
                  )}
                  {smsHref ? (
                    <a
                      href={smsHref}
                      onClick={logRouteNoticeAck}
                      className="inline-flex min-h-[2.25rem] items-center justify-center border border-transparent bg-[var(--accent)] px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90"
                    >
                      Send message
                    </a>
                  ) : driverPhone.trim() ? (
                    <span className="inline-flex min-h-[2.25rem] cursor-not-allowed items-center justify-center border border-[var(--border)] px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      Text unavailable
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex min-h-[2.25rem] items-center justify-center border border-[var(--border)] bg-[var(--surface)] px-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)]/40"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
