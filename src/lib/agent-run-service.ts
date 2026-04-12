/**
 * Server-only: gathers structured data locally (SQLite, NWS, Google Maps, Tavily,
 * CRM helpers) then calls IBM watsonx Orchestrate Chat Completions for LLM-backed
 * analysis.  Falls back to a local summary when Orchestrate is unreachable.
 */
import type { ScenarioKind } from "@/lib/constants";
import { getDriverCrmForActiveShipment } from "@/lib/driver-crm";
import {
  getCompanyProfile,
  getScenarioSettings,
  listShips,
} from "@/lib/db/ships-db";
import { fetchNwsActiveAlerts, summarizeNwsAlert } from "@/lib/nws-alerts";
import { routeOptionsForScenario } from "@/lib/routeOptions";
import {
  computeRouteOptions,
  fetchAlternateRoutes,
  toRouteOptionRows,
  type AlternateRouteInfo,
  type ComputedRouteOption,
} from "@/lib/google-route-options";
import { googleMapsServerApiKey } from "@/lib/google-directions-polyline";
import { resolutionForShipment } from "@/lib/simulation";
import {
  primaryShipment,
  type ActiveShipment,
} from "@/lib/shipments";
import { intersectRoutesWithAlertFeatures } from "@/lib/weather-route-intersection";
import { fetchTavilyWeatherNews } from "@/lib/tavily-search";
import { isMultiStop, nextLegShipment, orderedDeliveryStops } from "@/lib/drop-offs";
import {
  buildFacilityMapsPlan,
  synthesizeFacilityCore,
} from "@/lib/facility-maps-plan";
import { buildDriverRouteGuidance } from "@/lib/driver-route-guidance";
import type { OrchestrateAgentId } from "@/lib/orchestrate-agents";
import {
  callOrchestrateAgent,
  orchestrateConfigured,
  orchestrateDisplayName,
  type OrchestrateMessage,
} from "@/lib/orchestrate-client";

export interface AgentRunResult {
  agentId: OrchestrateAgentId;
  displayName: string;
  ranAt: string;
  summary: string;
  /** "orchestrate" when the summary came from IBM watsonx, "local" otherwise */
  source: "orchestrate" | "local";
  details: Record<string, unknown>;
}

/* ---------- helpers ---------- */

function effectiveRouteScenario(scenario: ScenarioKind): Exclude<ScenarioKind, "idle"> {
  return scenario === "idle" ? "blizzard" : scenario;
}

function pickShip(
  fleet: ActiveShipment[],
  shipmentId: string | null,
): ActiveShipment | null {
  if (shipmentId) {
    return fleet.find((s) => s.id === shipmentId) ?? null;
  }
  return primaryShipment(fleet);
}

function runCostCore(
  ship: ActiveShipment,
  kind: "blizzard" | "port_strike",
): Record<string, unknown> {
  const priority = (ship.priority ?? "").toUpperCase();
  const vip = priority.includes("VIP");
  if (kind === "port_strike") {
    const rows = [
      { option: "A", premium: 890, penalty: 6000 },
      { option: "B", premium: 9200, penalty: 6000 },
      { option: "C", premium: 2100, penalty: 6000 },
    ];
    const fastest = "B";
    const balanced = "C";
    const recommended = vip ? fastest : balanced;
    return {
      scenario: kind,
      vip,
      recommended_option: recommended,
      decisions: rows.map((r) => ({
        ...r,
        status: vip
          ? "approved_vip_override"
          : r.premium <= r.penalty
            ? "approved"
            : "rejected_over_penalty",
      })),
      narrative:
        "Contract penalty ~$6k; Route C premium $2.1k within guardrail unless VIP chooses fastest (B).",
    };
  }
  const rows = [
    { option: "A", premium: 4800, penalty: 4000 },
    { option: "B", premium: 640, penalty: 4000 },
    { option: "C", premium: 1200, penalty: 4000 },
  ];
  const fastest = "A";
  const balanced = "C";
  const recommended = vip ? fastest : balanced;
  return {
    scenario: kind,
    vip,
    recommended_option: recommended,
    decisions: rows.map((r) => ({
      ...r,
      status: vip
        ? "approved_vip_override"
        : r.premium <= r.penalty
          ? "approved"
          : "rejected_over_penalty",
    })),
    narrative:
      "SLA ~$4k; standard loads favor balanced Route C; VIP may take fastest (A).",
  };
}

/* ---------- Orchestrate summarization ---------- */

/**
 * Call watsonx Orchestrate Chat Completions with the gathered data as context,
 * returning the LLM response text or null on failure.
 */
async function orchestrateSummarize(
  agentId: OrchestrateAgentId,
  messages: OrchestrateMessage[],
): Promise<string | null> {
  if (!orchestrateConfigured()) return null;
  try {
    const result = await callOrchestrateAgent(agentId, messages);
    if (result.ok) return result.content;
    console.warn(
      `[orchestrate] ${agentId} returned error: ${result.error}`,
    );
    return null;
  } catch (e) {
    console.warn(`[orchestrate] ${agentId} threw:`, e);
    return null;
  }
}

function shipContext(ship: ActiveShipment | null): string {
  if (!ship) return "No shipment in focus.";
  return (
    `Shipment ${ship.id}: ${ship.routeFrom} → ${ship.routeTo}, ` +
    `status=${ship.status}, priority=${ship.priority ?? "standard"}, ` +
    `cargo=${ship.cargo ?? "—"}, carrier=${ship.carrier ?? "—"}, ` +
    `hub=${ship.hubLabel ?? "none"}, SLA penalty/hr=$${ship.slaPenaltyPerHour ?? 0}.`
  );
}

/* ---------- main entry point ---------- */

export async function runAgentJob(input: {
  agentId: OrchestrateAgentId;
  shipmentId: string | null;
  scenario: ScenarioKind;
}): Promise<AgentRunResult> {
  const { agentId, shipmentId, scenario } = input;
  const fleet = listShips();
  const ship = pickShip(fleet, shipmentId);
  const routeKind = effectiveRouteScenario(scenario);
  const meta = {
    ranAt: new Date().toISOString(),
    focusedShipmentId: ship?.id ?? null,
    scenario,
    routeScenario: routeKind,
  };

  switch (agentId) {
    /* ─── Routing Pivt ─── */
    case "routing_pivt": {
      const focusShip = ship ?? primaryShipment(fleet);
      const apiKey = googleMapsServerApiKey();

      const [collection, tavilyWeatherNews, alternateRoutes] = await Promise.all([
        fetchNwsActiveAlerts(),
        fetchTavilyWeatherNews(scenario, focusShip, {
          maxResults: 8,
          searchDepth: "advanced",
        }),
        focusShip && apiKey
          ? fetchAlternateRoutes(focusShip, apiKey)
          : Promise.resolve([] as AlternateRouteInfo[]),
      ]);
      const { hits: allHits, totalFeatures } = intersectRoutesWithAlertFeatures(
        fleet,
        collection,
        summarizeNwsAlert,
      );
      const target = focusShip;
      const relevant = target
        ? allHits.filter((h) => h.shipmentId === target.id)
        : allHits;
      const eventCount = relevant.reduce(
        (n, h) => n + (h.events?.length ?? 0),
        0,
      );
      const trigger = eventCount > 0;

      let localSummary = trigger
        ? `EXCEPTION_TRIGGER likely — ${eventCount} alert intersection event(s) on focused corridor scope.`
        : "No NWS alert intersection on the modeled scope for this check.";

      if (tavilyWeatherNews.ok) {
        const n = tavilyWeatherNews.results.length;
        localSummary += ` Tavily: ${n} weather-related web result${n === 1 ? "" : "s"}.`;
        if (tavilyWeatherNews.answer) {
          localSummary += ` Brief: ${tavilyWeatherNews.answer.slice(0, 220)}${tavilyWeatherNews.answer.length > 220 ? "…" : ""}`;
        }
      } else {
        localSummary += ` Web news: ${tavilyWeatherNews.error}`;
      }

      if (alternateRoutes.length > 0) {
        localSummary += ` ${alternateRoutes.length} alternate route(s) available via Google Maps.`;
      }

      const alternateRoutesBlock = alternateRoutes.length > 0
        ? `\nGoogle Maps alternate routes to same destination:\n` +
          alternateRoutes
            .map(
              (r) =>
                `  Route ${r.routeIndex} via ${r.summary}: ${r.distanceMi} mi, ${r.durationMin} min, est. cost $${r.costUsd}`,
            )
            .join("\n") +
          `\n\n`
        : `\nNo Google Maps alternate routes available.\n\n`;

      const orchestratePrompt: OrchestrateMessage[] = [
        {
          role: "user",
          content:
            `You are Routing Pivt analyzing the EIS War Room. Scenario: ${scenario}.\n\n` +
            `${shipContext(focusShip)}\n\n` +
            `NOAA/NWS data: ${totalFeatures} total active alert features. ` +
            `Shipment-relevant hits: ${eventCount} event(s) across ${relevant.length} corridor(s).\n` +
            `Exception trigger warranted: ${trigger ? "YES" : "NO"}.\n\n` +
            alternateRoutesBlock +
            (tavilyWeatherNews.ok
              ? `Tavily web search (${tavilyWeatherNews.results.length} results): ` +
                `Answer: ${tavilyWeatherNews.answer ?? "none"}\n` +
                `Top headlines: ${tavilyWeatherNews.results.slice(0, 3).map((r) => r.title).join("; ")}\n\n`
              : `Tavily web search unavailable: ${tavilyWeatherNews.error}\n\n`) +
            `Provide a concise operational summary. State whether EXCEPTION_TRIGGER should fire, ` +
            `cite the weather/hazard evidence, mention relevant Tavily findings, and if alternate ` +
            `routes are available recommend which route avoids the hazard. Include route distance/cost ` +
            `in your recommendation.`,
        },
      ];
      const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

      return {
        agentId,
        displayName: "Routing Pivt",
        ranAt: meta.ranAt,
        summary: llmSummary ?? localSummary,
        source: llmSummary ? "orchestrate" : "local",
        details: {
          ...meta,
          totalNwsFeatures: totalFeatures,
          exception_trigger: trigger,
          weather_event_count: eventCount,
          sample_hits: relevant.slice(0, 5),
          tavily_weather_news: tavilyWeatherNews,
          alternate_routes: alternateRoutes,
        },
      };
    }

    /* ─── Facility Pivt ─── */
    case "facility_pivt": {
      if (!ship) {
        return {
          agentId,
          displayName: "Facility Pivt",
          ranAt: meta.ranAt,
          summary: "No shipment selected — choose a load in the sidebar.",
          source: "local",
          details: { ...meta, error: "no_shipment" },
        };
      }
      const apiKey = googleMapsServerApiKey();
      const mapsPlan = await buildFacilityMapsPlan(ship, fleet, apiKey);
      const core = synthesizeFacilityCore(ship, mapsPlan);
      const localSummary = core.rationale;

      const facilityStops = orderedDeliveryStops(ship);
      const multiStopFacility = facilityStops.length >= 2;
      const stopReorderBlock = multiStopFacility
        ? `\n** This load has ${facilityStops.length} delivery destinations. ` +
          `All ${facilityStops.length} destinations must be kept (no adding or removing stops). ` +
          `Your job is to recommend the best ORDER of all stops. ` +
          `Current order: ${facilityStops.map((s) => s.label).join(" → ")}. ` +
          `See \`maps.stop_order_options\` and \`maps.best_stop_order\` for Google-costed permutations. **\n\n`
        : "";

      const orchestratePrompt: OrchestrateMessage[] = [
        {
          role: "user",
          content:
            `You are Facility Pivt (inventory + fulfilment + corridor planning). Scenario: ${scenario}.\n\n` +
            `${shipContext(ship)}\n\n` +
            stopReorderBlock +
            `Structured plan from Google Maps Directions, NWS corridor intersection, and anchor relay search:\n` +
            `${JSON.stringify({ ...core, maps: mapsPlan }, null, 2)}\n\n` +
            `Instructions:\n` +
            `- Ground every claim in the JSON (distances, minutes, modeled USD, route summaries, alert names).\n` +
            `- When SQLite has no hub coordinates but \`maps.best_relay\` or \`maps.best_alternate\` or ` +
            `\`maps.best_stop_order\` materially improves cost or avoids weather vs \`maps.google_direct\`, ` +
            `treat operational pivots as viable — do NOT say the hub is "undefined" as a dead end; name the relay code or alternate.\n` +
            (multiStopFacility
              ? `- For multi-stop loads, prioritize recommending a new delivery order if \`maps.best_stop_order\` ` +
                `saves cost or time vs the current sequence. The total number of stops (${facilityStops.length}) MUST stay the same.\n`
              : "") +
            `- Output valid JSON only with keys: ` +
            `"agent":"facility_pivt","shipment_id","hub_viable" (boolean),"hub_label" (string),` +
            `"recommendation" (short enum-like string),` +
            (multiStopFacility
              ? `"recommended_stop_order" (array of stop labels in recommended sequence),`
              : "") +
            `"rationale" (2-4 sentences referencing Google + NWS evidence)."\n` +
            `If \`maps.source\` is insufficient_data, say API key is missing and keep recommendations conservative.`,
        },
      ];
      const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

      return {
        agentId,
        displayName: "Facility Pivt",
        ranAt: meta.ranAt,
        summary: llmSummary ?? localSummary,
        source: llmSummary ? "orchestrate" : "local",
        details: {
          ...meta,
          facility: core,
          facility_maps: mapsPlan,
          shipmentId: ship.id,
        },
      };
    }

    /* ─── Optimizing Pivt ─── */
    case "optimizing_pivt": {
      const focus = ship ?? primaryShipment(fleet) ?? fleet[0] ?? null;
      const apiKey = googleMapsServerApiKey();

      const multiStop = focus ? isMultiStop(focus) : false;
      const routingTarget = focus && multiStop
        ? nextLegShipment(focus)
        : focus;

      const allStops = focus ? orderedDeliveryStops(focus) : [];

      const [computed, alternateRoutes] = await Promise.all([
        routingTarget && apiKey
          ? computeRouteOptions(routingTarget, apiKey)
          : Promise.resolve([] as ComputedRouteOption[]),
        routingTarget && apiKey
          ? fetchAlternateRoutes(routingTarget, apiKey)
          : Promise.resolve([] as AlternateRouteInfo[]),
      ]);

      if (computed.length > 0) {
        const rows = toRouteOptionRows(computed);
        const recommended = computed.find((r) => r.approved);

        const nextDest = allStops[0];
        const nextLegNote = multiStop && nextDest
          ? `\n** Multi-destination load (${allStops.length} stops). Route options below cover only the NEXT leg: ` +
            `origin → ${nextDest.label}. Remaining stops (${allStops.slice(1).map((s) => s.label).join(", ")}) ` +
            `are unchanged and will be served in order after the next leg is completed. **\n`
          : "";

        const stopsBlock = allStops.length >= 2
          ? `\nAll delivery stops on this lane (${allStops.length} total):\n` +
            allStops.map((s, i) => `  ${i + 1}. ${s.label} (${s.lat}, ${s.lng})`).join("\n") + "\n"
          : "";

        const altRoutesBlock = alternateRoutes.length > 0
          ? `\nGoogle Maps alternate routes (alternatives=true):\n` +
            alternateRoutes
              .map(
                (r) =>
                  `  Alt ${r.routeIndex} via ${r.summary}: ${r.distanceMi} mi, ${r.durationMin} min, est. cost $${r.costUsd}`,
              )
              .join("\n") + "\n"
          : "";

        const legLabel = multiStop && nextDest
          ? `next leg to ${nextDest.label}`
          : `${focus!.routeFrom} → ${focus!.routeTo}`;
        const localSummary =
          `Route options for ${focus!.id} (${legLabel}), ordered by cost. ` +
          (multiStop ? `Total stops: ${allStops.length}. ` : "") +
          `Recommended: Option ${recommended?.option ?? "—"} (${recommended?.label ?? "—"}) at ${recommended?.cost ?? "—"}, ETA ${recommended?.eta ?? "—"}.`;

        const orchestratePrompt: OrchestrateMessage[] = [
          {
            role: "user",
            content:
              `You are Optimizing Pivt providing route-cost analysis. Scenario: ${scenario}.\n\n` +
              `${shipContext(focus)}\n` +
              nextLegNote +
              stopsBlock +
              `\nGoogle Maps Directions computed ${computed.length} route strategy options` +
              (multiStop ? ` for the NEXT LEG ONLY (origin → ${nextDest?.label ?? "next stop"})` : "") +
              `:\n` +
              computed
                .map(
                  (r) =>
                    `  Option ${r.option} "${r.label}": ${r.description}. ` +
                    `Distance ${r.distanceMi} mi, ${r.durationMin} min, route via ${r.routeSummary}. ` +
                    `Cost ${r.cost}, SLA penalty ${r.slaPenalty}. ` +
                    `${r.approved ? "** PRE-RECOMMENDED **" : ""}`,
                )
                .join("\n") +
              altRoutesBlock +
              `\n\nCost model: $1.82/mi fuel+wear, $12/100mi tolls, $38/hr truck time, ` +
              `SLA penalty rate: $${focus?.slaPenaltyPerHour ?? 0}/hr over 24h baseline.\n\n` +
              (multiStop
                ? `IMPORTANT: The route options above cover only the leg from origin to the NEXT destination. ` +
                  `The remaining ${allStops.length - 1} stop(s) are NOT being re-routed — they stay in their current order. ` +
                  `Facility Pivt handles stop reordering separately.\n\n`
                : "") +
              `Analyze ALL options. Quote exact dollar amounts and ETAs. ` +
              `Decide which option is recommended (set "recommended_option" and "recommended_label"). ` +
              `Explain the cost-vs-speed trade-off: which saves money, which meets SLA best, ` +
              `and what the penalty exposure is. Consider the alternate routes from Google Maps as well.`,
          },
        ];
        const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

        return {
          agentId,
          displayName: "Optimizing Pivt",
          ranAt: meta.ranAt,
          summary: llmSummary ?? localSummary,
          source: llmSummary ? "orchestrate" : "local",
          details: {
            ...meta,
            source: "google_maps",
            shipmentId: focus!.id,
            computed,
            rows,
            alternate_routes: alternateRoutes,
            riskBanner: recommended
              ? `Recommended: Option ${recommended.option}. Cost ${recommended.cost}, ETA ${recommended.eta}. Routes ordered by total cost — cheapest first.`
              : "Review the options below and select a route.",
          },
        };
      }

      const primary = primaryShipment(fleet);
      const bundle = routeOptionsForScenario(routeKind, 0, primary);
      let localSummary = `${bundle.title} — ${bundle.subtitle}. Balanced track: ${bundle.rows.find((r) => r.approved)?.label ?? "—"}.`;
      const details: Record<string, unknown> = { ...meta, source: "fallback", bundle };
      if (focus) {
        const cost = runCostCore(
          focus,
          routeKind === "port_strike" ? "port_strike" : "blizzard",
        );
        localSummary += ` Financial: option ${String(cost.recommended_option)} — ${String(cost.narrative)}`;
        details.financial = cost;
        details.financialShipmentId = focus.id;
      }
      return {
        agentId,
        displayName: "Optimizing Pivt",
        ranAt: meta.ranAt,
        summary: localSummary,
        source: "local",
        details,
      };
    }

    /* ─── Driver Pivt ─── */
    case "driver_pivt": {
      if (!ship) {
        return {
          agentId,
          displayName: "Driver Pivt",
          ranAt: meta.ranAt,
          summary: "No shipment selected — choose a load in the sidebar.",
          source: "local",
          details: { ...meta, error: "no_shipment" },
        };
      }
      const crm = getDriverCrmForActiveShipment(ship);
      const res =
        scenario === "idle"
          ? null
          : resolutionForShipment(scenario, ship.id);
      const profile = getCompanyProfile();
      const apiKeyDriver = googleMapsServerApiKey();
      const routeGuidance = await buildDriverRouteGuidance(
        ship,
        fleet,
        apiKeyDriver,
      );
      const routeHint =
        routeGuidance.optimizing_committed != null
          ? `Route: Optimizing option ${routeGuidance.optimizing_committed.option} (${routeGuidance.optimizing_committed.routeSummary}).`
          : routeGuidance.facility != null
            ? `Route: Facility plan — ${routeGuidance.facility.hub_label} (${routeGuidance.facility.recommendation}).`
            : "Route: use lane default until dispatch commits a Maps option.";
      const localSummary = res
        ? `Draft notice ready for ${ship.id} (${scenario}). ${routeHint} Contacts: ${crm.driver.name}, ${crm.dispatcher.name}.`
        : `CRM loaded for ${ship.id}. ${routeHint} Pick a non-idle scenario in the footer to draft a resolution notice.`;

      const orchestratePrompt: OrchestrateMessage[] = [
        {
          role: "user",
          content:
            `You are Driver Pivt drafting customer communications. Scenario: ${scenario}.\n\n` +
            `${shipContext(ship)}\n\n` +
            `CRM contacts:\n` +
            `  Driver: ${crm.driver.name} (phone: ${crm.driver.phone ?? "—"}, email: ${crm.driver.email ?? "—"})\n` +
            `  Dispatcher: ${crm.dispatcher.name} (phone: ${crm.dispatcher.phone ?? "—"}, email: ${crm.dispatcher.email ?? "—"})\n` +
            `  Company: ${profile.companyName}\n\n` +
            (res
              ? `Resolution draft available:\n${JSON.stringify(res, null, 2)}\n\n`
              : `No resolution scenario active (scenario=${scenario}). `) +
            `${routeGuidance.prompt_block}\n\n` +
            `IMPORTANT: You MUST always provide a non-empty "draft_customer_notice" field. ` +
            `Write a complete, ready-to-send message addressed to the driver (${crm.driver.name}) about shipment ${ship.id}. ` +
            `The message should be empathetic, blame-free, and include clear next steps. ` +
            `Never tell the driver they were on a "wrong" or "incorrect" route; if the plan changed, say the route was **updated** ` +
            `and give the new instruction (e.g. open with "Your route has been updated. Please use the following new route:"). ` +
            (routeGuidance.route_notice.suppress_full_route_repeat
              ? `Operator memory: a notice for this same route was already sent — keep this draft **short**; do not repeat the full highway-by-highway recap. `
              : `When the "Authorized route" section above names a committed Optimizing **option** and **highway summary**, ` +
                `repeat those exact facts in plain language (option letter, road names, ETA/cost if given). ` +
                `When only Facility guidance is present, describe that path (relay airport code, alternate route name, or stop order) ` +
                `as the driver's current instruction. `) +
            `Even if scenario is idle, draft a brief check-in message for the driver with current status.`,
        },
      ];
      const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

      return {
        agentId,
        displayName: "Driver Pivt",
        ranAt: meta.ranAt,
        summary: llmSummary ?? localSummary,
        source: llmSummary ? "orchestrate" : "local",
        details: {
          ...meta,
          crm,
          resolutionDraft: res,
          company: profile.companyName,
          driver_route_guidance: routeGuidance,
        },
      };
    }

    /* ─── Disaster Management Pivt ─── */
    case "disaster_management_pivt": {
      if (!ship) {
        return {
          agentId,
          displayName: "Disaster Management Pivt",
          ranAt: meta.ranAt,
          summary: "No shipment selected — choose a load in the sidebar.",
          source: "local",
          details: { ...meta, error: "no_shipment" },
        };
      }
      const res =
        scenario === "idle"
          ? null
          : resolutionForShipment(scenario, ship.id);
      const scenarioSettings = getScenarioSettings();
      const localSummary =
        scenario === "idle"
          ? `Continuity / EM overlay for ${ship.id} (idle scenario — limited exception context).`
          : `Disaster & continuity assessment for ${ship.id} (${scenario}).`;

      const orchestratePrompt: OrchestrateMessage[] = [
        {
          role: "user",
          content:
            `You are Disaster Management Pivt for the EIS War Room. Scenario: ${scenario}.\n\n` +
            `${shipContext(ship)}\n\n` +
            `Port strike reference epicenter (if relevant): lng=${scenarioSettings.portStrikeEpicenter.lng}, lat=${scenarioSettings.portStrikeEpicenter.lat}\n\n` +
            (res
              ? `Resolution / simulation context:\n${JSON.stringify(res, null, 2)}\n\n`
              : `No resolution block (scenario may be idle).\n\n`) +
            `Produce the JSON response per your agent specification. Emphasize freight continuity, ` +
            `staging, escalation paths, and alignment with public-safety messaging — without inventing agencies or closures.`,
        },
      ];
      const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

      return {
        agentId,
        displayName: "Disaster Management Pivt",
        ranAt: meta.ranAt,
        summary: llmSummary ?? localSummary,
        source: llmSummary ? "orchestrate" : "local",
        details: {
          ...meta,
          resolutionDraft: res,
          portStrikeEpicenter: scenarioSettings.portStrikeEpicenter,
        },
      };
    }

    /* ─── EIS Orchestrator ─── */
    case "eis_orchestrator": {
      const steps: AgentRunResult[] = [];
      const r1 = await runAgentJob({
        agentId: "routing_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r1);
      const r2 = await runAgentJob({
        agentId: "facility_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r2);
      const r3 = await runAgentJob({
        agentId: "optimizing_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r3);
      const r4 = await runAgentJob({
        agentId: "driver_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r4);
      const r5 = await runAgentJob({
        agentId: "disaster_management_pivt",
        shipmentId,
        scenario,
      });
      steps.push(r5);

      const scenarioSettings = getScenarioSettings();

      const localSummary = `Pipeline complete: ${steps.map((s) => s.displayName).join(" → ")}. Open each card above to inspect step output.`;

      const orchestratePrompt: OrchestrateMessage[] = [
        {
          role: "user",
          content:
            `You are the EIS Orchestrator. The full exception pipeline just completed for scenario: ${scenario}.\n\n` +
            `${shipContext(ship)}\n\n` +
            `Step results:\n` +
            steps
              .map(
                (s) =>
                  `${s.displayName} (source: ${s.source}): ${s.summary}`,
              )
              .join("\n\n") +
            `\n\nOutput JSON per your specification. Provide a concise executive_summary (2–5 sentences). ` +
            `Fill steps.routing, steps.facility, steps.optimizing, steps.driver, and steps.disaster_management ` +
            `each with a short summary string derived from the matching step above and source: "context". ` +
            `Highlight exception trigger, facility and route posture, driver comms readiness, and disaster / continuity posture.`,
        },
      ];
      const llmSummary = await orchestrateSummarize(agentId, orchestratePrompt);

      return {
        agentId,
        displayName: "EIS Orchestrator",
        ranAt: meta.ranAt,
        summary: llmSummary ?? localSummary,
        source: llmSummary ? "orchestrate" : "local",
        details: {
          ...meta,
          portStrikeEpicenter: scenarioSettings.portStrikeEpicenter,
          pipeline: steps.map((s) => ({
            id: s.agentId,
            summary: s.summary,
            details: s.details,
          })),
        },
      };
    }

    default: {
      const _exhaustive: never = agentId;
      return _exhaustive;
    }
  }
}
