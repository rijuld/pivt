"use client";

import dynamic from "next/dynamic";
import { greeting } from "@/lib/ui-copy";

const WarRoom = dynamic(() => import("@/components/WarRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#05080f] text-slate-400">
      <div className="flex flex-col items-center gap-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse bg-cyan-500" />
          {greeting.loading}
        </div>
        <p className="text-[11px] text-slate-500">Almost there…</p>
      </div>
    </div>
  ),
});

export function WarRoomLoader() {
  return <WarRoom />;
}
