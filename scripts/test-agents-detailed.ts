/**
 * Detailed agent smoke test: full summary + key ``details`` for flow / UI mapping.
 *
 * Usage:
 *   npm run test:agents:detail
 *   AGENT_TEST_SHIPMENT_ID=CA-9901 AGENT_TEST_SCENARIO=blizzard npm run test:agents:detail
 */
import { ORCHESTRATE_AGENTS } from "@/lib/orchestrate-agents";
import { agentSummaryOneLiner, parsePivotAgentJson } from "@/lib/agent-json-summary";
import { runAgentJob } from "@/lib/agent-run-service";
import { listShips } from "@/lib/db/ships-db";

const SHIPMENT_ID = process.env.AGENT_TEST_SHIPMENT_ID ?? "CA-9901";
const SCENARIO = (process.env.AGENT_TEST_SCENARIO ?? "blizzard") as
  | "idle"
  | "blizzard"
  | "port_strike";

function printJson(label: string, v: unknown) {
  console.log(label);
  console.log(JSON.stringify(v, null, 2));
}

async function main() {
  const ships = listShips();
  const ship = ships.find((s) => s.id === SHIPMENT_ID);
  if (!ship) {
    console.error(
      `No shipment "${SHIPMENT_ID}" in DB. Available: ${ships.map((s) => s.id).join(", ")}`,
    );
    process.exit(1);
  }

  console.log("═".repeat(72));
  console.log(
    `EIS agent detailed test — load ${SHIPMENT_ID} (${ship.routeFrom} → ${ship.routeTo}), scenario=${SCENARIO}`,
  );
  console.log(
    `Stops: ${ship.dropOffsJson ? "multi-stop JSON present" : "none"} · hub: ${ship.hubLabel ?? "—"}`,
  );
  console.log("Flow mapping: summary → AgentRunSummaryBody / CRM one-liner / Driver modal");
  console.log("═".repeat(72));
  console.log("");

  let failed = 0;
  for (const meta of ORCHESTRATE_AGENTS) {
    const t0 = Date.now();
    console.log(`▶ ${meta.displayName} (${meta.id})`);
    try {
      const result = await runAgentJob({
        agentId: meta.id,
        shipmentId: SHIPMENT_ID,
        scenario: SCENARIO,
      });
      const ms = Date.now() - t0;
      const src = result.source === "orchestrate" ? "orchestrate" : "local";
      console.log(`  source: ${src} · ${ms}ms`);

      const parsed = parsePivotAgentJson(result.summary);
      if (parsed) {
        console.log(`  parsed agent field: ${String(parsed.agent ?? "—")}`);
        console.log(`  UI one-liner (CRM cell): ${agentSummaryOneLiner(result.summary)}`);
      } else {
        console.log(
          `  summary (non-JSON / preview): ${result.summary.slice(0, 200)}${result.summary.length > 200 ? "…" : ""}`,
        );
      }

      const d = result.details;

      if (meta.id === "routing_pivt") {
        console.log("  details.exception_trigger:", d.exception_trigger);
        console.log(
          "  details.alternate_routes (Google alternatives):",
          Array.isArray(d.alternate_routes) ? `${d.alternate_routes.length} route(s)` : "none",
        );
        if (Array.isArray(d.alternate_routes) && d.alternate_routes.length)
          printJson("  alternate_routes:", d.alternate_routes);
      }

      if (meta.id === "optimizing_pivt") {
        console.log("  details.source:", d.source ?? "—");
        if (Array.isArray(d.rows)) {
          printJson("  details.rows (Response flow table / route cards):", d.rows);
        }
        if (Array.isArray(d.computed)) {
          printJson(
            "  details.computed (Google Directions + cost model):",
            d.computed.map((c: Record<string, unknown>) => ({
              option: c.option,
              label: c.label,
              distanceMi: c.distanceMi,
              durationMin: c.durationMin,
              cost: c.cost,
              slaPenalty: c.slaPenalty,
              approved: c.approved,
              routeSummary: c.routeSummary,
            })),
          );
        }
        if (Array.isArray(d.alternate_routes) && d.alternate_routes.length)
          printJson("  details.alternate_routes:", d.alternate_routes);
        if (parsed && parsed.agent === "optimizing_pivt") {
          console.log(
            `  Orchestrate JSON recommended: ${String(parsed.recommended_option)} — ${String(parsed.recommended_label ?? "")}`,
          );
          if (Array.isArray(parsed.options))
            printJson("  Orchestrate JSON options:", parsed.options);
          console.log(
            `  trade_off_summary (first 240 chars): ${String(parsed.trade_off_summary ?? "").slice(0, 240)}…`,
          );
        }
      }

      if (meta.id === "facility_pivt" && d.facility) {
        printJson("  details.facility:", d.facility);
        if (d.facility_maps) printJson("  details.facility_maps:", d.facility_maps);
      }

      if (meta.id === "driver_pivt") {
        const draft =
          parsed && typeof parsed.draft_customer_notice === "string"
            ? parsed.draft_customer_notice
            : "";
        console.log(
          `  draft_customer_notice (first 180 chars): ${draft.slice(0, 180)}${draft.length > 180 ? "…" : ""}`,
        );
      }

      if (meta.id === "eis_orchestrator" && Array.isArray(d.pipeline)) {
        console.log(
          `  pipeline steps: ${d.pipeline.map((p: { id?: string }) => p.id).join(" → ")}`,
        );
      }

      console.log("");
    } catch (e) {
      console.log(`  FAIL: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
      console.log("");
    }
  }

  console.log("═".repeat(72));
  if (failed > 0) {
    console.error(`Done: ${failed} failure(s).`);
    process.exit(1);
  }
  console.log("Done: all agents completed for this load.");
}

void main();
