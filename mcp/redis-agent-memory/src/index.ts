/**
 * MCP server: Redis-backed long-term and session memory for EIS agents.
 * Log to stderr only — stdout is reserved for MCP JSON-RPC.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { agentIndexPattern, memoryKey } from "./keys.js";
import { getRedis } from "./redis.js";

const AGENT_IDS = [
  "routing_pivt",
  "facility_pivt",
  "optimizing_pivt",
  "cost_pivt",
  "driver_pivt",
  "eis_orchestrator",
] as const;

function ns(): string {
  return (process.env.MEMORY_NAMESPACE || "eis").trim() || "eis";
}

function textResult(obj: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2),
      },
    ],
  };
}

const server = new McpServer(
  {
    name: "eis-redis-agent-memory",
    version: "1.0.0",
  },
  {
    instructions: `Redis-backed agent memory for the EIS War Room. Valid agent_id values: ${AGENT_IDS.join(", ")}. Use session_id to isolate threads (default "global"). Keys are namespaced per agent.`,
  },
);

server.registerTool(
  "memory_get",
  {
    title: "Get agent memory",
    description:
      "Read a string value from Redis for an agent/session/key. Returns null if missing.",
    inputSchema: z.object({
      agent_id: z
        .string()
        .describe(`Agent id — one of: ${AGENT_IDS.join(", ")}`),
      session_id: z
        .string()
        .optional()
        .describe('Conversation scope, default "global"'),
      key: z.string().describe("Logical key, e.g. last_exception_summary"),
    }),
  },
  async ({ agent_id, session_id, key }) => {
    const r = await getRedis();
    const k = memoryKey(ns(), agent_id, session_id ?? "global", key);
    const v = await r.get(k);
    return textResult({ ok: true, redis_key: k, value: v });
  },
);

server.registerTool(
  "memory_set",
  {
    title: "Set agent memory",
    description: "Store a UTF-8 string in Redis for an agent/session/key.",
    inputSchema: z.object({
      agent_id: z.string(),
      session_id: z.string().optional(),
      key: z.string(),
      value: z.string(),
      ttl_seconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional TTL; omit for no expiry"),
    }),
  },
  async ({ agent_id, session_id, key, value, ttl_seconds }) => {
    const r = await getRedis();
    const k = memoryKey(ns(), agent_id, session_id ?? "global", key);
    if (ttl_seconds != null) {
      await r.set(k, value, { EX: ttl_seconds });
    } else {
      await r.set(k, value);
    }
    return textResult({ ok: true, redis_key: k, ttl_seconds: ttl_seconds ?? null });
  },
);

server.registerTool(
  "memory_delete",
  {
    title: "Delete agent memory key",
    description: "Remove one key for an agent/session.",
    inputSchema: z.object({
      agent_id: z.string(),
      session_id: z.string().optional(),
      key: z.string(),
    }),
  },
  async ({ agent_id, session_id, key }) => {
    const r = await getRedis();
    const k = memoryKey(ns(), agent_id, session_id ?? "global", key);
    const n = await r.del(k);
    return textResult({ ok: true, redis_key: k, deleted: n });
  },
);

server.registerTool(
  "memory_list_keys",
  {
    title: "List memory keys for an agent",
    description:
      "Scan Redis for keys under this agent (all sessions). Use for debugging or recall.",
    inputSchema: z.object({
      agent_id: z.string(),
      limit: z.number().int().positive().max(500).optional().default(100),
    }),
  },
  async ({ agent_id, limit }) => {
    const r = await getRedis();
    const pattern = agentIndexPattern(ns(), agent_id);
    const keys: string[] = [];
    for await (const k of r.scanIterator({ MATCH: pattern, COUNT: 50 })) {
      keys.push(k);
      if (keys.length >= limit) break;
    }
    return textResult({ ok: true, pattern, keys });
  },
);

server.registerTool(
  "memory_append_event",
  {
    title: "Append timeline event",
    description:
      "LPUSH a JSON event onto a capped list for audit / short-term recall (per agent session).",
    inputSchema: z.object({
      agent_id: z.string(),
      session_id: z.string().optional(),
      stream_key: z
        .string()
        .describe('Usually "timeline" or "events"'),
      event_json: z.string().describe("JSON string of the event"),
      max_len: z.number().int().positive().max(1000).optional().default(50),
    }),
  },
  async ({ agent_id, session_id, stream_key, event_json, max_len }) => {
    const r = await getRedis();
    const listKey = memoryKey(
      ns(),
      agent_id,
      session_id ?? "global",
      `list:${stream_key}`,
    );
    await r.lPush(listKey, event_json);
    await r.lTrim(listKey, 0, max_len - 1);
    return textResult({ ok: true, redis_key: listKey, max_len });
  },
);

server.registerTool(
  "memory_list_events",
  {
    title: "Read recent timeline events",
    description: "LRANGE the capped event list (newest first from LPUSH).",
    inputSchema: z.object({
      agent_id: z.string(),
      session_id: z.string().optional(),
      stream_key: z.string(),
      count: z.number().int().positive().max(200).optional().default(20),
    }),
  },
  async ({ agent_id, session_id, stream_key, count }) => {
    const r = await getRedis();
    const listKey = memoryKey(
      ns(),
      agent_id,
      session_id ?? "global",
      `list:${stream_key}`,
    );
    const items = await r.lRange(listKey, 0, count - 1);
    return textResult({ ok: true, redis_key: listKey, events: items });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[eis-redis-agent-memory] Connected (namespace=${ns()}, redis=${process.env.REDIS_URL || "redis://127.0.0.1:6379"})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
