/**
 * Server-only Tavily web search — same contract as ``mcp/tavily-web-search`` / ``adk/tools/tavily_search.py``.
 *
 * Tavily Search API: POST https://api.tavily.com/search — Bearer ``TAVILY_API_KEY``,
 * body: ``query``, ``search_depth``, ``max_results``; optional ``include_answer`` for an LLM-style summary.
 * @see https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
import type { ScenarioKind } from "@/lib/constants";
import type { ActiveShipment } from "@/lib/shipments";

const TAVILY_URL = "https://api.tavily.com/search";

export function tavilyApiKey(): string | null {
  const k = process.env.TAVILY_API_KEY?.trim();
  return k || null;
}

export type TavilyResultItem = {
  title: string;
  url: string;
  content: string;
};

export type TavilyWeatherNewsOk = {
  ok: true;
  query: string;
  answer: string | null;
  results: TavilyResultItem[];
};

export type TavilyWeatherNewsErr = {
  ok: false;
  error: string;
  query?: string;
};

export type TavilyWeatherNewsPayload = TavilyWeatherNewsOk | TavilyWeatherNewsErr;

type TavilySearchOptions = {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  /** When true, Tavily may return an ``answer`` field summarizing results. */
  includeAnswer?: boolean;
};

/**
 * Run a raw Tavily search (any query). Used by the disaster chatbot and other callers.
 */
export async function fetchTavilySearchQuery(
  query: string,
  options?: TavilySearchOptions,
): Promise<TavilyWeatherNewsPayload> {
  const key = tavilyApiKey();
  const q = query.trim();
  if (!q) {
    return { ok: false, error: "Empty search query" };
  }
  if (!key) {
    return { ok: false, error: "TAVILY_API_KEY is not set", query: q };
  }

  const maxResults = Math.min(15, Math.max(1, options?.maxResults ?? 8));
  const searchDepth = options?.searchDepth ?? "advanced";
  const includeAnswer = options?.includeAnswer ?? true;

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: q,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: includeAnswer,
      }),
      cache: "no-store",
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Tavily HTTP ${res.status}: ${raw.slice(0, 280)}`,
        query: q,
      };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Invalid JSON from Tavily", query: q };
    }

    const answer =
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer.trim()
        : null;

    const rawResults = data.results;
    const results: TavilyResultItem[] = [];
    if (Array.isArray(rawResults)) {
      for (const item of rawResults) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title : "";
        const url = typeof o.url === "string" ? o.url : "";
        const content =
          typeof o.content === "string"
            ? o.content
            : typeof o.raw_content === "string"
              ? o.raw_content
              : "";
        if (title || url || content) {
          results.push({
            title: title || url || "Result",
            url: url || "#",
            content: content.slice(0, 2000),
          });
        }
      }
    }

    return { ok: true, query: q, answer, results };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tavily request failed";
    return { ok: false, error: msg, query: q };
  }
}

/** Build a lane- and scenario-aware query for public weather / freight headlines. */
export function buildWeatherNewsTavilyQuery(
  scenario: ScenarioKind,
  ship: ActiveShipment | null,
): string {
  const origin =
    ship?.originLabel?.split(",")[0]?.trim() ||
    ship?.routeFrom?.split(",")[0]?.trim() ||
    "";
  const dest =
    ship?.destLabel?.split(",")[0]?.trim() ||
    ship?.routeTo?.split(",")[0]?.trim() ||
    "";
  const st = ship?.state?.trim() || "";
  const lane =
    origin && dest
      ? `${origin} ${dest}`
      : origin || dest || "United States";

  if (scenario === "port_strike") {
    return `latest weather news East Coast port freight shipping delays trucking ${lane}`.replace(
      /\s+/g,
      " ",
    );
  }
  if (scenario === "blizzard") {
    return `winter storm severe weather interstate road conditions trucking freight news ${st} ${lane}`.replace(
      /\s+/g,
      " ",
    );
  }
  return `US weather forecast severe storms trucking freight road conditions news ${lane}`.replace(
    /\s+/g,
    " ",
  );
}

/**
 * Run a Tavily search. Returns a normalized payload; does not throw on HTTP errors.
 */
export async function fetchTavilyWeatherNews(
  scenario: ScenarioKind,
  ship: ActiveShipment | null,
  options?: { maxResults?: number; searchDepth?: "basic" | "advanced" },
): Promise<TavilyWeatherNewsPayload> {
  const query = buildWeatherNewsTavilyQuery(scenario, ship);
  return fetchTavilySearchQuery(query, {
    maxResults: options?.maxResults ?? 8,
    searchDepth: options?.searchDepth ?? "advanced",
    includeAnswer: true,
  });
}

/**
 * Build a Tavily query for disaster / emergency-management context (War Room chatbot).
 * Grounds search in scenario and lane when available.
 */
export function buildDisasterManagementTavilyQuery(
  userMessage: string,
  scenario: ScenarioKind | undefined,
  ship: ActiveShipment | null,
): string {
  const user = userMessage.trim().slice(0, 500);
  const scen =
    scenario === "blizzard"
      ? "winter storm blizzard interstate road emergency"
      : scenario === "port_strike"
        ? "port strike maritime supply chain freight disruption"
        : "disaster management emergency operations continuity";
  const geoParts = [
    ship?.state?.trim(),
    ship?.routeFrom?.trim(),
    ship?.routeTo?.trim(),
  ].filter(Boolean);
  const geo = geoParts.length ? geoParts.join(" ") : "United States";

  const core =
    "latest disaster management emergency preparedness ICS NIMS freight trucking logistics";
  if (user) {
    return `${core} ${scen} ${geo} — user question: ${user}`.replace(/\s+/g, " ").trim();
  }
  return `${core} ${scen} ${geo} news advisories`.replace(/\s+/g, " ").trim();
}
