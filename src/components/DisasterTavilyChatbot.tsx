"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ScenarioKind } from "@/lib/constants";
import { disasterChat } from "@/lib/ui-copy";

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Array<{ title: string; url: string }>;
  queryUsed?: string;
  disclaimer?: string;
}

interface DisasterTavilyChatbotProps {
  scenario: ScenarioKind;
  shipmentId: string | null;
}

export function DisasterTavilyChatbot({
  scenario,
  shipmentId,
}: DisasterTavilyChatbotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: disasterChat.introAssistant,
      },
    ]);
  }, [open, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/disaster-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          shipmentId,
          scenario,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        assistantText?: string;
        sources?: Array<{ title: string; url: string }>;
        queryUsed?: string;
        disclaimer?: string;
      };
      if (!res.ok) {
        const err =
          data.error ??
          (res.status === 503 ? disasterChat.noApiKey : "Search failed.");
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: err,
          },
        ]);
        return;
      }
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.assistantText ?? "No summary returned.",
          sources: data.sources,
          queryUsed: data.queryUsed,
          disclaimer: data.disclaimer,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Network error — try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, scenario, shipmentId]);

  return (
    <>
      <motion.button
        type="button"
        aria-label={disasterChat.fabAria}
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-[180] flex h-12 max-w-[min(100vw-2rem,14rem)] items-center gap-2 rounded-full border border-orange-500/40 bg-[var(--surface-elevated)] px-4 py-2 text-left shadow-lg ring-1 ring-orange-500/20 transition hover:border-orange-500/60 hover:bg-[var(--surface-card)] ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        initial={false}
        animate={{ scale: open ? 0.9 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)]">
          {disasterChat.title}
        </span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label={disasterChat.title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.38 }}
            className="fixed bottom-5 right-5 z-[181] flex h-[min(520px,calc(100vh-6rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl"
          >
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-card)] px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">
                    {disasterChat.title}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">{disasterChat.subtitle}</p>
                </div>
                <button
                  type="button"
                  aria-label={disasterChat.closeAria}
                  onClick={() => setOpen(false)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md px-3 py-2 text-[11px] leading-relaxed ${
                    m.role === "user"
                      ? "ml-6 border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
                      : "mr-4 border border-orange-500/20 bg-orange-500/[0.06] text-[var(--foreground)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.queryUsed ? (
                    <p className="mt-2 border-t border-[var(--border)]/60 pt-2 font-mono text-[9px] text-[var(--text-tertiary)]">
                      Query: {m.queryUsed.slice(0, 280)}
                      {m.queryUsed.length > 280 ? "…" : ""}
                    </p>
                  ) : null}
                  {m.disclaimer ? (
                    <p className="mt-1 text-[9px] text-[var(--muted)]">{m.disclaimer}</p>
                  ) : null}
                  {m.sources && m.sources.length > 0 ? (
                    <div className="mt-2 border-t border-[var(--border)]/60 pt-2">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                        {disasterChat.sourcesHeading}
                      </p>
                      <ul className="space-y-1">
                        {m.sources.map((s, i) => (
                          <li key={`${s.url}-${i}`}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-[var(--accent)] underline-offset-2 hover:underline"
                            >
                              {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
              {loading ? (
                <p className="text-[11px] text-[var(--muted)]">{disasterChat.thinking}</p>
              ) : null}
              <div ref={endRef} />
            </div>

            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-card)] p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={disasterChat.placeholder}
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--foreground)] outline-none ring-[var(--accent)]/30 focus:ring-2"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded bg-orange-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  {disasterChat.send}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
