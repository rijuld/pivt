/**
 * Tavily web search MCP — stderr only for logs; stdout is MCP JSON-RPC.
 * Requires TAVILY_API_KEY (Bearer token from https://tavily.com).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TAVILY_URL = "https://api.tavily.com/search";

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

const server = new McpServer(
  {
    name: "eis-tavily-web-search",
    version: "1.0.0",
  },
  {
    instructions:
      "Provides web search via Tavily. Call tavily_search with a natural-language query. " +
      "Use for weather context, carrier news, or lane risk — not as a substitute for NOAA/NWS API data.",
  },
);

server.registerTool(
  "tavily_search",
  {
    title: "Web search (Tavily)",
    description:
      "Search the public web using Tavily. Returns summarized results with source URLs. " +
      "Use when you need current events, industry news, or general context. " +
      "Requires TAVILY_API_KEY at server startup. " +
      "Prefer the War Room weather/shipment APIs for fleet-specific data.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe("Search query in natural language"),
      search_depth: z
        .enum(["basic", "advanced"])
        .optional()
        .default("advanced")
        .describe("Tavily search depth; advanced is slower but richer"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(8)
        .describe("Maximum result items to return"),
    }),
  },
  async ({ query, search_depth, max_results }) => {
    const key = process.env.TAVILY_API_KEY?.trim();
    if (!key) {
      return textResult(
        JSON.stringify({
          ok: false,
          error:
            "TAVILY_API_KEY is not set. Add it to the MCP server environment or watsonx Connection key-value pairs.",
        }),
      );
    }

    const body = {
      query,
      search_depth: search_depth ?? "advanced",
      max_results: max_results ?? 8,
    };

    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) {
      return textResult(
        JSON.stringify(
          {
            ok: false,
            status: res.status,
            body: raw.slice(0, 2000),
          },
          null,
          2,
        ),
      );
    }

    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      return textResult(JSON.stringify({ ok: true, ...data }, null, 2));
    } catch {
      return textResult(raw);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const hasKey = Boolean(process.env.TAVILY_API_KEY?.trim());
  console.error(
    `[eis-tavily-web-search] Ready (TAVILY_API_KEY ${hasKey ? "set" : "MISSING"})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
