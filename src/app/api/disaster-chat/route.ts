import { NextResponse } from "next/server";
import type { ScenarioKind } from "@/lib/constants";
import { getShip } from "@/lib/db/ships-db";
import {
  buildDisasterManagementTavilyQuery,
  fetchTavilySearchQuery,
  type TavilyResultItem,
  type TavilyWeatherNewsOk,
} from "@/lib/tavily-search";

export const runtime = "nodejs";

const SCENARIOS = new Set<string>(["idle", "blizzard", "port_strike"]);

function formatAssistantPayload(result: TavilyWeatherNewsOk): {
  assistantText: string;
  sources: TavilyResultItem[];
} {
  const lines: string[] = [];
  if (result.answer) {
    lines.push(result.answer);
  } else if (result.results.length > 0) {
    lines.push("Here are the most relevant current items:");
    for (const r of result.results.slice(0, 5)) {
      const snippet = r.content.replace(/\s+/g, " ").trim().slice(0, 320);
      lines.push(`• ${r.title}${snippet ? ` — ${snippet}${r.content.length > 320 ? "…" : ""}` : ""}`);
    }
  } else {
    lines.push(
      "No web results returned. Try a shorter question or check your Tavily API quota.",
    );
  }
  return {
    assistantText: lines.join("\n\n"),
    sources: result.results.filter((r) => r.url && r.url !== "#").slice(0, 10),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      shipmentId?: string | null;
      scenario?: string;
    };
    const message = typeof body.message === "string" ? body.message : "";
    const shipmentId =
      typeof body.shipmentId === "string" && body.shipmentId.trim()
        ? body.shipmentId.trim()
        : null;
    const scenarioRaw = body.scenario;
    const scenario: ScenarioKind | undefined =
      typeof scenarioRaw === "string" && SCENARIOS.has(scenarioRaw)
        ? (scenarioRaw as ScenarioKind)
        : undefined;

    const ship = shipmentId ? getShip(shipmentId) : null;
    const query = buildDisasterManagementTavilyQuery(message, scenario, ship);
    const result = await fetchTavilySearchQuery(query, {
      maxResults: 10,
      searchDepth: "advanced",
      includeAnswer: true,
    });

    if (!result.ok) {
      const status = result.error.includes("TAVILY_API_KEY") ? 503 : 502;
      return NextResponse.json(
        { error: result.error, query: result.query },
        { status },
      );
    }

    const { assistantText, sources } = formatAssistantPayload(result);

    return NextResponse.json({
      queryUsed: result.query,
      assistantText,
      sources,
      disclaimer:
        "Results are from live web search (Tavily). Verify time-sensitive or safety-critical information with official sources (FEMA, NWS, state DOT, carrier ops).",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to run disaster information search." },
      { status: 500 },
    );
  }
}
