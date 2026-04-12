/**
 * Server-only: exchanges IBM_API_KEY for a JWT bearer token.
 *
 * watsonx Orchestrate on AWS uses MCSP authentication:
 *   POST https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token
 *   Body: { "apikey": "<IBM_API_KEY>" }
 *
 * watsonx Orchestrate on IBM Cloud uses IAM authentication:
 *   POST https://iam.cloud.ibm.com/identity/token
 *   Body: grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=<key>
 *
 * The key format is auto-detected: base64-encoded MCSP keys decode to "k1:usr_...".
 */

const MCSP_TOKEN_URL =
  "https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token";
const IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token";

let cached: { token: string; expiresAt: number } | null = null;

export function ibmApiKey(): string | null {
  return process.env.IBM_API_KEY?.trim() || null;
}

function isMcspKey(key: string): boolean {
  try {
    const decoded = Buffer.from(key, "base64").toString("utf-8");
    return decoded.startsWith("k1:");
  } catch {
    return false;
  }
}

async function exchangeMcsp(apiKey: string): Promise<string> {
  const res = await fetch(MCSP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ apikey: apiKey }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `MCSP token exchange failed (HTTP ${res.status}): ${body.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as { token?: string; jwt?: string };
  const token = data.token ?? data.jwt;
  if (!token) {
    throw new Error(
      `MCSP response missing token field: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return token;
}

async function exchangeIam(apiKey: string): Promise<string> {
  const res = await fetch(IAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(apiKey)}`,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `IAM token exchange failed (HTTP ${res.status}): ${body.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("IAM response missing access_token");
  return data.access_token;
}

export async function getIamBearerToken(): Promise<string> {
  const apiKey = ibmApiKey();
  if (!apiKey) throw new Error("IBM_API_KEY is not set in the environment.");

  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const token = isMcspKey(apiKey)
    ? await exchangeMcsp(apiKey)
    : await exchangeIam(apiKey);

  const bufferMs = 5 * 60 * 1000;
  const defaultTtlMs = 2 * 60 * 60 * 1000;
  cached = {
    token,
    expiresAt: Date.now() + defaultTtlMs - bufferMs,
  };

  return token;
}

/** Invalidate the cached token (e.g. on 401). */
export function clearIamTokenCache(): void {
  cached = null;
}
