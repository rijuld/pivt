<p align="center">
  <img src="./public/pivt-logo.png" alt="Pivt" width="140" />
</p>

# Pivt — Truck Rerouting Agents

Pivt is a logistics **exception intelligence system (EIS)**: a Next.js "War Room" that watches a
live fleet, detects when a shipment is about to break (severe weather, port action, long delay),
and runs a pipeline of **IBM watsonx Orchestrate** agents that reroute the load, check hub
inventory, price the alternatives against the SLA penalty, and draft the driver/customer notice.

The UI is a map-driven operations console — live shipments, NWS weather alerts intersected with
route geometry, Google-derived route alternatives, a CRM-style response board, and a per-agent run
panel that shows the raw JSON each agent returned.

## The agent roster

Agent specs live in [`adk/agents/`](./adk/agents/) and are deployed to watsonx Orchestrate; the app
calls them through `POST /api/agent-run`. Every agent is instructed to return a **single strict JSON
object** so the UI can render it structurally.

| Agent | Role | What it does |
| --- | --- | --- |
| `routing_pivt` | Early warning & route triggers | Parses shipment telemetry + NWS intersections and fires `EXCEPTION_TRIGGER` |
| `facility_pivt` | Inventory & fulfilment brain | Asks whether closer stock exists — fulfilment **swap** vs **reroute** vs **hold** |
| `optimizing_pivt` | Route options & financial guardrail | Ranks route alternatives, rejecting premiums that exceed the SLA penalty |
| `driver_pivt` | Driver & customer voice | Drafts an empathetic, blame-free route-update notice; reads/writes Redis memory |
| `disaster_management_pivt` | Continuity overlay | NIMS/ICS-style staging, coordination and public-messaging alignment |
| `eis_orchestrator` | Executive summary | Synthesizes all step outputs into one pipeline verdict |

Scenarios driving the simulation: `idle`, `blizzard`, `port_strike`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** this repo tracks **Next.js 16 / React 19**. Conventions differ from older Next.js — see
> [`AGENTS.md`](./AGENTS.md) and the guides in `node_modules/next/dist/docs/` before writing code.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run test:agents` | Exercise every Orchestrate agent end-to-end (`.env.local` required) |
| `npm run test:agents:detail` | Same, with full request/response detail |
| `npm run generate:world-path` | Regenerate the pre-baked world land path used by the maps |

`test:agents` honours `AGENT_TEST_SCENARIO` and `AGENT_TEST_SHIPMENT_ID`.

### Environment

Put these in **`.env.local`** (git-ignored — never commit credentials):

| Variable | Used for |
| --- | --- |
| `IBM_API_KEY`, `SERVICE_INSTANCE_URL` | watsonx Orchestrate auth (also read by `adk/deploy.sh`) |
| `ORCHESTRATE_ENVIRONMENT_ID` | Target Orchestrate environment |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Directions + map rendering |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL basemap |
| `NWS_USER_AGENT` | Required contact string for the api.weather.gov client |
| `REDIS_URL` | Shared agent memory (MCP server + `redis_memory_*` tools) |
| `TAVILY_API_KEY` | Web search for the disaster chatbot / Tavily tools |

Fleet state is stored in a local SQLite DB under [`data/`](./data/) (`*.db` is git-ignored).

## HTTP API

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/agent-run` | POST | Run one Orchestrate agent for a `{ agentId, shipmentId, scenario }` |
| `/api/ships` | GET, POST | List / create shipments |
| `/api/ships/[id]` | PATCH, DELETE | Update or remove a shipment |
| `/api/ships/[id]/route-revisions` | GET, POST | Route revision history for a load |
| `/api/ships/[id]/committed-route-map` | GET | Static map of the committed route |
| `/api/ships/[id]/driver-route-notice-ack` | POST | Driver acknowledgement of a route update |
| `/api/route-options` | GET | Route alternatives (Google Directions, with fallback bundles) |
| `/api/weather-events`, `/api/weather-snapshot` | GET | NWS alerts and route-intersection snapshot |
| `/api/profile` | GET, PATCH | Company profile used for messaging context |
| `/api/disaster-chat` | POST | Tavily-backed disaster Q&A chatbot |

## Layout

```
src/app            Next.js App Router — War Room page + /api routes
src/components     Map, war-room panels, CRM board, agent run/detail modals
src/lib            Agent orchestration, route geometry, NWS, Redis memory, SQLite
adk/agents         watsonx Orchestrate agent YAML specs
adk/tools          Python tools exposed to those agents
mcp/               Stdio MCP servers (Redis agent memory, Tavily web search)
documentation/     Vendored watsonx Orchestrate reference docs
scripts/           Agent test harnesses + map data generation
```

## IBM watsonx Orchestrate (ADK)

Agent specs and Python tools live under [`adk/`](./adk/). Use **Python 3.11 or 3.12** for the
`ibm-watsonx-orchestrate` CLI. Set `IBM_API_KEY` and `SERVICE_INSTANCE_URL` (see `.env.local`),
start the app, then run:

```bash
cd adk && ./deploy.sh
```

Set `APP_BASE_URL` (default `http://127.0.0.1:3000`) so tools call the live Next.js APIs. If
`deploy.sh` fails to authenticate, set `ORCHESTRATE_AUTH_TYPE` to `ibm_iam` or `mcsp` to match your
instance (the CLI usually infers the correct type from the service URL).

Set `REDIS_URL` when importing **`redis_memory.py`** tools so Pivt agents can read/write shared
agent memory. Examples: local `redis://127.0.0.1:6379` (e.g. `docker compose up -d redis`), or
**Redis Cloud** `redis://default:<password>@<host>:<port>`. If the provider requires TLS, use
`rediss://...`. Put the URL in **`.env.local`** (already sourced by `adk/deploy.sh`); do not commit
credentials. **Driver Pivt** is configured to call the `redis_memory_*` tools with `agent_id` =
`driver_pivt`.

### Redis agent memory (MCP + Orchestrate)

- **Cursor / MCP clients:** [`mcp/redis-agent-memory`](./mcp/redis-agent-memory/) — stdio MCP server
  (`memory_get`, `memory_set`, `memory_delete`, `memory_list_keys`, `memory_append_event`,
  `memory_list_events`). Build once: `cd mcp/redis-agent-memory && npm install && npm run build`.
  Project [`.cursor/mcp.json`](./.cursor/mcp.json) points at `dist/index.js`; set **`REDIS_URL`**
  (and optional **`MEMORY_NAMESPACE`**, default `eis`) in that file's `env` block or override in
  Cursor MCP settings — use the **same** URL as Orchestrate (e.g. Redis Cloud) if you want one
  backing store.
- **watsonx Orchestrate:** Python tools in [`adk/tools/redis_memory.py`](./adk/tools/redis_memory.py)
  use the **same Redis key layout** as the MCP server. Re-run `adk/deploy.sh` after starting Redis.

### Web search (Tavily)

- **MCP:** [`mcp/tavily-web-search`](./mcp/tavily-web-search/) — tool `tavily_search` (POST
  `https://api.tavily.com/search` with `Authorization: Bearer <key>`). Build:
  `cd mcp/tavily-web-search && npm install && npm run build`. Set **`TAVILY_API_KEY`** in the
  environment (or Cursor MCP server env) before starting the server.
- **Orchestrate (Python):** [`adk/tools/tavily_search.py`](./adk/tools/tavily_search.py) — same API;
  deploy with `adk/deploy.sh` and set `TAVILY_API_KEY` where tools run.

### Importing MCP toolkits into watsonx Orchestrate

Orchestrate can attach **Node** or **Python** MCP servers (often via `npx` / `uvx`) and imports them
as a **toolkit**. Before import:

1. Ensure **every tool has a description** (required for import).
2. Put secrets in a **Connection** (App ID) as **key-value** pairs (e.g. `TAVILY_API_KEY`,
   `REDIS_URL`) so the process sees them at startup.
3. Plan for **manual reimport** if tool lists change (no automatic refresh).
4. Unsupported: OAuth 2.1 / DCR, Docker image import, resources/prompts import, cancelling
   mid-execution, elicitation/annotation on tools.

Use **ADK "Managing toolkits"** or the Orchestrate UI **Import tools from an MCP server** to
register the stdio servers above.

## Deploy

The app deploys as a standard Next.js application — see the
[Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying). Note that
`/api/agent-run` uses the Node.js runtime with a 60s max duration, and the SQLite fleet DB expects a
writable `data/` directory, so a serverless target needs external state.
