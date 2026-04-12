import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function getRedis(): Promise<RedisClientType> {
  if (client?.isOpen) return client;
  const url = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  client = createClient({ url });
  client.on("error", (err: Error) => {
    console.error("[redis-agent-memory] Redis error:", err.message);
  });
  await client.connect();
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
  }
  client = null;
}
