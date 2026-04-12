This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## IBM watsonx Orchestrate (ADK)

Agent specs and Python tools live under [`adk/`](./adk/). Use **Python 3.11 or 3.12** for the `ibm-watsonx-orchestrate` CLI. Set `IBM_API_KEY` and `SERVICE_INSTANCE_URL` (see `.env.local`), start the app, then run:

```bash
cd adk && ./deploy.sh
```

Set `APP_BASE_URL` (default `http://127.0.0.1:3000`) so tools call the live Next.js APIs. If `deploy.sh` fails to authenticate, set `ORCHESTRATE_AUTH_TYPE` to `ibm_iam` or `mcsp` to match your instance (the CLI usually infers the correct type from the service URL).

Set `REDIS_URL` when importing **`redis_memory.py`** tools so Pivt agents can read/write shared agent memory. Examples: local `redis://127.0.0.1:6379` (e.g. `docker compose up -d redis`), or **Redis Cloud** `redis://default:<password>@<host>:<port>`. If the provider requires TLS, use `rediss://...`. Put the URL in **`.env.local`** (already sourced by `adk/deploy.sh`); do not commit credentials. **Driver Pivt** is configured to call the `redis_memory_*` tools with `agent_id` = `driver_pivt`.

### Redis agent memory (MCP + Orchestrate)

- **Cursor / MCP clients:** [`mcp/redis-agent-memory`](./mcp/redis-agent-memory/) — stdio MCP server (`memory_get`, `memory_set`, `memory_delete`, `memory_list_keys`, `memory_append_event`, `memory_list_events`). Build once: `cd mcp/redis-agent-memory && npm install && npm run build`. Project [`.cursor/mcp.json`](./.cursor/mcp.json) points at `dist/index.js`; set **`REDIS_URL`** (and optional **`MEMORY_NAMESPACE`**, default `eis`) in that file’s `env` block or override in Cursor MCP settings — use the **same** URL as Orchestrate (e.g. Redis Cloud) if you want one backing store.
- **watsonx Orchestrate:** Python tools in [`adk/tools/redis_memory.py`](./adk/tools/redis_memory.py) use the **same Redis key layout** as the MCP server. Re-run `adk/deploy.sh` after starting Redis.

### Web search (Tavily)

- **MCP:** [`mcp/tavily-web-search`](./mcp/tavily-web-search/) — tool `tavily_search` (POST `https://api.tavily.com/search` with `Authorization: Bearer <key>`). Build: `cd mcp/tavily-web-search && npm install && npm run build`. Set **`TAVILY_API_KEY`** in the environment (or Cursor MCP server env) before starting the server.
- **Orchestrate (Python):** [`adk/tools/tavily_search.py`](./adk/tools/tavily_search.py) — same API; deploy with `adk/deploy.sh` and set `TAVILY_API_KEY` where tools run.

### Importing MCP toolkits into watsonx Orchestrate

Orchestrate can attach **Node** or **Python** MCP servers (often via `npx` / `uvx`) and imports them as a **toolkit**. Before import:

1. Ensure **every tool has a description** (required for import).
2. Put secrets in a **Connection** (App ID) as **key-value** pairs (e.g. `TAVILY_API_KEY`, `REDIS_URL`) so the process sees them at startup.
3. Plan for **manual reimport** if tool lists change (no automatic refresh).
4. Unsupported: OAuth 2.1 / DCR, Docker image import, resources/prompts import, cancelling mid-execution, elicitation/annotation on tools.

Use **ADK “Managing toolkits”** or the Orchestrate UI **Import tools from an MCP server** to register the stdio servers above.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
