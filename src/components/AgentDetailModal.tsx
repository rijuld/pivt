"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import {
  rosterStatus,
  type RosterAgent,
  type StatusVariant,
} from "@/lib/agents";

interface AgentDetailModalProps {
  open: boolean;
  agent: RosterAgent | null;
  phase: MapPhase;
  scenario: ScenarioKind;
  isRunning: boolean;
  onClose: () => void;
}

export function AgentDetailModal({
  open,
  agent,
  phase,
  scenario,
  isRunning,
  onClose,
}: AgentDetailModalProps) {
  const st = agent
    ? rosterStatus(agent.key, phase, scenario, isRunning)
    : { label: "", variant: "neutral" as StatusVariant };

  return (
    <AnimatePresence>
      {open && agent && (
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
            aria-labelledby="agent-detail-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
            className="relative z-10 flex max-h-[min(85vh,560px)] w-full max-w-md flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center bg-gradient-to-br text-[12px] font-bold text-white ${agent.accent}`}
                >
                  {agent.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="agent-detail-title"
                    className="text-[16px] font-semibold uppercase tracking-wide text-[var(--foreground)]"
                  >
                    {agent.name}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                    {agent.role}
                  </p>
                  <div className="mt-2">
                    <StatusPill label={st.label} variant={st.variant} />
                    <span className="ml-2 text-[11px] text-[var(--muted)]">
                      Status in this session
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[13px] leading-relaxed text-[var(--foreground)]">
                {agent.detail}
              </p>
            </div>
            <div className="shrink-0 border-t border-[var(--border)] p-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[var(--accent)] py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: StatusVariant;
}) {
  const styles: Record<StatusVariant, string> = {
    danger:
      "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
    warning:
      "bg-[var(--warn)]/15 text-[var(--warn)] ring-1 ring-[var(--warn)]/25",
    success:
      "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/30",
    neutral:
      "bg-white/8 text-[var(--muted)] ring-1 ring-white/10",
    info: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 text-[10px] font-medium ${styles[variant]}`}
    >
      {label}
    </span>
  );
}
