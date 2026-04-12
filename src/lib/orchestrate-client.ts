/**
 * Server-only: calls IBM watsonx Orchestrate Chat Completions API.
 *
 * SaaS endpoint:  POST {SERVICE_INSTANCE_URL}/v1/orchestrate/{agentUuid}/chat/completions
 * Auth:           Bearer {JWT from MCSP or IAM}
 *
 * Agent names are resolved to UUIDs by querying the instance's agent list.
 * Request body includes ``context.environment_id`` (``live`` by default; override with
 * ``ORCHESTRATE_ENVIRONMENT_ID=draft``) so deployed agents are invoked per ADK docs.
 */
import {
  getIamBearerToken,
  clearIamTokenCache,
  ibmApiKey,
} from "@/lib/ibm-iam-token";
import { normalizeAgentJsonText } from "@/lib/agent-json-summary";
import type { OrchestrateAgentId } from "@/lib/orchestrate-agents";
import { ORCHESTRATE_AGENTS } from "@/lib/orchestrate-agents";

const ORCHESTRATE_TIMEOUT_MS = 45_000;

/** SaaS: use ``live`` after agents are deployed; ``draft`` for undeployed / dev. */
function orchestrateEnvironmentId(): "draft" | "live" {
  const raw = process.env.ORCHESTRATE_ENVIRONMENT_ID?.trim().toLowerCase();
  return raw === "draft" ? "draft" : "live";
}

function serviceInstanceUrl(): string | null {
  return process.env.SERVICE_INSTANCE_URL?.trim() || null;
}

/** Whether the IBM Orchestrate connection is configured (keys + URL present). */
export function orchestrateConfigured(): boolean {
  return Boolean(ibmApiKey() && serviceInstanceUrl());
}

export interface OrchestrateMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OrchestrateChatResponse {
  ok: true;
  agentId: OrchestrateAgentId;
  content: string;
  raw: Record<string, unknown>;
}

export interface OrchestrateChatError {
  ok: false;
  agentId: OrchestrateAgentId;
  error: string;
  status?: number;
}

export type OrchestrateChatResult =
  | OrchestrateChatResponse
  | OrchestrateChatError;

/* ---------- Agent UUID resolution ---------- */

let agentUuidCache: Map<string, string> | null = null;
let agentUuidCacheAt = 0;
const UUID_CACHE_TTL_MS = 10 * 60 * 1000;

async function resolveAgentUuid(
  agentName: string,
  token: string,
): Promise<string | null> {
  if (
    agentUuidCache &&
    Date.now() - agentUuidCacheAt < UUID_CACHE_TTL_MS &&
    agentUuidCache.has(agentName)
  ) {
    return agentUuidCache.get(agentName)!;
  }

  const baseUrl = serviceInstanceUrl();
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/orchestrate/agents`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const agents = (await res.json()) as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.name, a.id);
    agentUuidCache = map;
    agentUuidCacheAt = Date.now();
    return map.get(agentName) ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a message to a watsonx Orchestrate agent via Chat Completions.
 *
 * Retries once on 401 (expired token).
 */
export async function callOrchestrateAgent(
  agentId: OrchestrateAgentId,
  messages: OrchestrateMessage[],
  options?: { threadId?: string },
): Promise<OrchestrateChatResult> {
  const baseUrl = serviceInstanceUrl();
  if (!baseUrl) {
    return { ok: false, agentId, error: "SERVICE_INSTANCE_URL is not set" };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let token: string;
    try {
      token = await getIamBearerToken();
    } catch (e) {
      return {
        ok: false,
        agentId,
        error: e instanceof Error ? e.message : "Token exchange failed",
      };
    }

    const uuid = await resolveAgentUuid(agentId, token);
    if (!uuid) {
      return {
        ok: false,
        agentId,
        error: `Agent "${agentId}" not found on Orchestrate instance`,
      };
    }

    const url = `${baseUrl}/v1/orchestrate/${uuid}/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (options?.threadId) {
      headers["X-IBM-THREAD-ID"] = options.threadId;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages,
          stream: false,
          context: { environment_id: orchestrateEnvironmentId() },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(ORCHESTRATE_TIMEOUT_MS),
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        agentId,
        error: msg.includes("timeout")
          ? `Orchestrate timed out after ${ORCHESTRATE_TIMEOUT_MS / 1000}s`
          : `Network error calling Orchestrate: ${msg}`,
      };
    }

    if (res.status === 401 && attempt === 0) {
      clearIamTokenCache();
      continue;
    }

    const body = await res.text().catch(() => "");

    if (!res.ok) {
      return {
        ok: false,
        agentId,
        error: `Orchestrate HTTP ${res.status}: ${body.slice(0, 600)}`,
        status: res.status,
      };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        agentId,
        error: `Invalid JSON from Orchestrate: ${body.slice(0, 400)}`,
      };
    }

    const content = normalizeAgentJsonText(extractAssistantContent(data));
    return { ok: true, agentId, content, raw: data };
  }

  return {
    ok: false,
    agentId,
    error: "Orchestrate call failed after retries",
  };
}

/**
 * Extract the assistant message text from an OpenAI-compatible chat response.
 *
 * Shape:  { choices: [{ message: { role, content } }] }
 */
function extractAssistantContent(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const msg = first?.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string") return msg.content;
  }
  if (typeof data.content === "string") return data.content;
  if (typeof data.output === "string") return data.output;
  return JSON.stringify(data);
}

/** @see {@link normalizeAgentJsonText} in ``agent-json-summary`` — re-export for server callers. */
export { normalizeAgentJsonText as normalizeOrchestrateAssistantText } from "@/lib/agent-json-summary";

/** Look up display name for an agent id. */
export function orchestrateDisplayName(agentId: OrchestrateAgentId): string {
  return (
    ORCHESTRATE_AGENTS.find((a) => a.id === agentId)?.displayName ?? agentId
  );
}
