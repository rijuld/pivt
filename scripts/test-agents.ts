/**
 * Smoke-test every Orchestrate-backed agent via ``runAgentJob`` (same as POST /api/agent-run).
 *
 * Usage: `npm run test:agents` or `npx tsx scripts/test-agents.ts`
 */
import { ORCHESTRATE_AGENTS } from "@/lib/orchestrate-agents";
import { runAgentJob } from "@/lib/agent-run-service";
import { listShips } from "@/lib/db/ships-db";

const SHIPMENT_ID = process.env.AGENT_TEST_SHIPMENT_ID ?? "NY-8472";
const SCENARIO = (process.env.AGENT_TEST_SCENARIO ?? "blizzard") as
  | "idle"
  | "blizzard"
  | "port_strike";

async function main() {
  const ships = listShips();
  const ship = ships.find((s) => s.id === SHIPMENT_ID);
  if (!ship) {
    console.error(`No shipment "${SHIPMENT_ID}" in DB. Available: ${ships.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(
    `Testing ${ORCHESTRATE_AGENTS.length} agents (shipment=${SHIPMENT_ID}, scenario=${SCENARIO})\n`,
  );

  let failed = 0;
  for (const meta of ORCHESTRATE_AGENTS) {
    const t0 = Date.now();
    try {
      const result = await runAgentJob({
        agentId: meta.id,
        shipmentId: SHIPMENT_ID,
        scenario: SCENARIO,
      });
      const ms = Date.now() - t0;
      const ok =
        typeof result.summary === "string" &&
        result.summary.length > 0 &&
        result.details &&
        typeof result.details === "object";
      if (!ok) {
        console.log(`FAIL  ${meta.id}  (${ms}ms) — invalid result shape`);
        failed++;
        continue;
      }
      const src = result.source === "orchestrate" ? "orchestrate" : "local";
      const sumPreview =
        result.summary.length > 160
          ? `${result.summary.slice(0, 157)}…`
          : result.summary;
      console.log(`PASS  ${meta.id}  (${ms}ms)  [${src}]`);
      console.log(`      ${sumPreview.replace(/\s+/g, " ").trim()}`);
    } catch (e) {
      const ms = Date.now() - t0;
      console.log(`FAIL  ${meta.id}  (${ms}ms)`);
      console.log(`      ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`Done: ${failed} failure(s).`);
    process.exit(1);
  }
  console.log("Done: all agents passed.");
}

void main();
