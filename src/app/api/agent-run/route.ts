import { NextResponse } from "next/server";
import { runAgentJob } from "@/lib/agent-run-service";
import { isOrchestrateAgentId } from "@/lib/orchestrate-agents";
import type { ScenarioKind } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCENARIOS: ScenarioKind[] = ["idle", "blizzard", "port_strike"];

function parseScenario(v: unknown): ScenarioKind {
  if (typeof v === "string" && SCENARIOS.includes(v as ScenarioKind)) {
    return v as ScenarioKind;
  }
  return "idle";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      agentId?: string;
      shipmentId?: string | null;
      scenario?: string;
    };
    const agentId = body.agentId?.trim();
    if (!agentId || !isOrchestrateAgentId(agentId)) {
      return NextResponse.json(
        { error: "Invalid or missing agentId" },
        { status: 400 },
      );
    }
    const scenario = parseScenario(body.scenario);
    const shipmentId =
      typeof body.shipmentId === "string" && body.shipmentId.trim()
        ? body.shipmentId.trim()
        : null;

    const result = await runAgentJob({
      agentId,
      shipmentId,
      scenario,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Agent run failed",
      },
      { status: 500 },
    );
  }
}
