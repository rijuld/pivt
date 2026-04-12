/** Shared with ADK Python tools — keep in sync with adk/tools/redis_agent_memory.py */

export const DEFAULT_SESSION = "global";

export function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export function memoryKey(
  namespace: string,
  agentId: string,
  sessionId: string,
  key: string,
): string {
  const ns = sanitizeSegment(namespace);
  const agent = sanitizeSegment(agentId);
  const sess = sanitizeSegment(sessionId || DEFAULT_SESSION);
  const k = sanitizeSegment(key);
  return `${ns}:agent:${agent}:${sess}:${k}`;
}

export function agentIndexPattern(namespace: string, agentId: string): string {
  const ns = sanitizeSegment(namespace);
  const agent = sanitizeSegment(agentId);
  return `${ns}:agent:${agent}:*`;
}
