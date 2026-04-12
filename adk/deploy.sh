#!/usr/bin/env bash
# Deploy EIS War Room agents + tools to IBM watsonx Orchestrate via ADK CLI.
# Prerequisites: Python 3.11+, Next.js app optional but recommended for live tools (set APP_BASE_URL).
set -euo pipefail

ADK_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ADK_ROOT"

ENV_NAME="${ORCHESTRATE_ENV_NAME:-eis}"
VENV="${ADK_ROOT}/.venv"

# Load credentials from repo .env.local if present (IBM_API_KEY, SERVICE_INSTANCE_URL).
ENV_FILE="${ADK_ROOT}/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${IBM_API_KEY:-}" ]] || [[ -z "${SERVICE_INSTANCE_URL:-}" ]]; then
  echo "Error: IBM_API_KEY and SERVICE_INSTANCE_URL must be set (e.g. in ../.env.local)." >&2
  exit 1
fi

# Prefer 3.12 when available — some hosts default to a Python without ADK wheels (e.g. 3.14).
if [[ -n "${PYTHON:-}" ]]; then
  PY="$PYTHON"
elif command -v python3.12 >/dev/null 2>&1; then
  PY="python3.12"
else
  PY="python3"
fi
if ! "$PY" -c 'import sys; assert sys.version_info[:2] >= (3, 11)' 2>/dev/null; then
  echo "Warning: Python 3.11+ recommended for ibm-watsonx-orchestrate wheels." >&2
fi

if [[ ! -d "$VENV" ]]; then
  "$PY" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "${VENV}/bin/activate"

pip install --upgrade pip
pip install -r "${ADK_ROOT}/requirements.txt"

# Register remote Orchestrate environment (idempotent).
# Many SaaS URLs infer MCSP; IBM Cloud often needs ibm_iam. Override with ORCHESTRATE_AUTH_TYPE if needed.
_env_add() {
  if [[ -n "${ORCHESTRATE_AUTH_TYPE:-}" ]]; then
    orchestrate env add -n "${ENV_NAME}" -u "${SERVICE_INSTANCE_URL}" --type "${ORCHESTRATE_AUTH_TYPE}"
  else
    orchestrate env add -n "${ENV_NAME}" -u "${SERVICE_INSTANCE_URL}"
  fi
}
if orchestrate env list 2>/dev/null | grep -qF "${ENV_NAME}"; then
  echo "Environment '${ENV_NAME}' already exists."
else
  _env_add
fi

orchestrate env activate "${ENV_NAME}" --api-key "${IBM_API_KEY}"

REQ="${ADK_ROOT}/requirements.txt"
TOOLS_DIR="${ADK_ROOT}/tools"

TOOL_FILES=(
  fetch_fleet_status.py
  check_weather_alerts.py
  detect_exception.py
  check_hub_inventory.py
  generate_route_options.py
  evaluate_route_financials.py
  get_driver_contacts.py
  draft_customer_notice.py
  get_company_profile.py
  redis_memory.py
  tavily_search.py
)

echo "=== Importing Python tools ==="
for f in "${TOOL_FILES[@]}"; do
  echo "-- tools/${f}"
  orchestrate tools import -k python -f "${TOOLS_DIR}/${f}" -r "$REQ"
done

echo "=== Importing agents (collaborators before orchestrator) ==="
AGENT_FILES=(
  routing_pivt.yaml
  facility_pivt.yaml
  optimizing_pivt.yaml
  driver_pivt.yaml
  disaster_management_pivt.yaml
  eis_orchestrator.yaml
)

for f in "${AGENT_FILES[@]}"; do
  echo "-- agents/${f}"
  orchestrate agents import -f "${ADK_ROOT}/agents/${f}"
done

echo "Done. Active environment: ${ENV_NAME}"
echo "Tip: export APP_BASE_URL=http://127.0.0.1:3000 when your Next.js dev server is running so tools resolve live data."
echo "Tip: export REDIS_URL for redis_memory_* tools (local: redis://127.0.0.1:6379; Redis Cloud: redis://default:SECRET@host:port — use rediss:// if your provider requires TLS). Never commit secrets; use .env.local (sourced above)."
echo "Tip: export TAVILY_API_KEY for tavily_search (web context). Import Tavily MCP on **EIS Orchestrator** (or Disaster Management Pivt) in Orchestrate UI if you want web search there."
