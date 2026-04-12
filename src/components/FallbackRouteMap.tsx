"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import { orderedDeliveryStops } from "@/lib/drop-offs";
import { parseRouteVariantsJson } from "@/lib/route-variants";
import type { ActiveShipment } from "@/lib/shipments";
import { buildCallerHeatmapGeoJSON, primaryShipment, shipRouteMidpoint } from "@/lib/shipments";

/** Continental US (lower 48) — matches Mapbox default overview. */
const LNG_MIN = -128;
const LNG_MAX = -65;
const LAT_MIN = 23;
const LAT_MAX = 50;

function project(lng: number, lat: number, w: number, h: number) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * h;
  return { x, y };
}

function pathD(coords: readonly [number, number][], w: number, h: number) {
  if (coords.length === 0) return "";
  const pts = coords.map(([lng, lat]) => project(lng, lat, w, h));
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

interface FallbackRouteMapProps {
  phase: MapPhase;
  scenario: ScenarioKind;
  fleet: ActiveShipment[];
  portStrikeEpicenter?: { lng: number; lat: number } | null;
}

export function FallbackRouteMap({
  phase,
  scenario,
  fleet,
  portStrikeEpicenter = null,
}: FallbackRouteMapProps) {
  const w = 1100;
  const h = 680;

  const primary = useMemo(() => primaryShipment(fleet), [fleet]);
  const v = useMemo(
    () => parseRouteVariantsJson(primary?.routeVariantsJson ?? null),
    [primary?.routeVariantsJson],
  );

  const nominalCoords = v?.nominal ?? [];
  const resCoords = useMemo(() => {
    if (!v) return [];
    return scenario === "port_strike" ? v.portResolution : v.resolution;
  }, [v, scenario]);

  const ny = primary
    ? project(primary.originLng, primary.originLat, w, h)
    : { x: 0, y: 0 };
  const deliveryStops = primary ? orderedDeliveryStops(primary) : [];
  const hub =
    primary?.hubLng != null && primary.hubLat != null
      ? project(primary.hubLng, primary.hubLat, w, h)
      : { x: 0, y: 0 };
  const truck =
    primary?.stallLng != null && primary.stallLat != null
      ? project(primary.stallLng, primary.stallLat, w, h)
      : { x: 0, y: 0 };

  const hasThreat = phase !== "nominal";
  const isThinking = phase === "thinking";
  const isResolved = phase === "resolved";

  const heatGeo = buildCallerHeatmapGeoJSON(
    fleet,
    scenario,
    phase,
    portStrikeEpicenter,
  );
  const heatFeatures = heatGeo.features.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Point> =>
      f.geometry?.type === "Point",
  );

  const originLabel = primary?.routeFrom ?? "—";
  const laneDest = primary?.routeTo ?? "—";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c1021]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
        }}
      />

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="relative h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="heatRadial" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#f97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g opacity={heatFeatures.length > 0 ? 1 : 0}>
          {heatFeatures.map((f, i) => {
            const coords = f.geometry.coordinates;
            const weight = Number(
              f.properties && "weight" in f.properties
                ? f.properties.weight
                : 4,
            );
            const p = project(coords[0]!, coords[1]!, w, h);
            const r = 6 + weight * 1.1;
            const op = Math.min(0.45, 0.04 + weight * 0.028);
            return (
              <circle
                key={`heat-${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill="url(#heatRadial)"
                opacity={op}
              />
            );
          })}
        </g>

        {fleet.map((s) => {
          const c = shipRouteMidpoint(s);
          const p = project(c.lng, c.lat, w, h);
          const isPrimary = s.isPrimary;
          return (
            <circle
              key={s.id}
              cx={p.x}
              cy={p.y}
              r={isPrimary ? 5 : 3.2}
              fill={isPrimary ? "#22d3ee" : "#475569"}
              stroke="#0c1021"
              strokeWidth={1}
            />
          );
        })}

        {nominalCoords.length >= 2 ? (
          <motion.path
            d={pathD(nominalCoords, w, h)}
            fill="none"
            stroke="#64748b"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: phase === "nominal" ? 0.65 : 0.22 }}
            transition={{ duration: 0.6 }}
          />
        ) : null}

        <AnimatePresence>
          {(isThinking || isResolved) && resCoords.length >= 2 && (
            <motion.path
              key="thinking"
              d={pathD(resCoords, w, h)}
              fill="none"
              stroke="#eab308"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="12 8"
              filter="url(#glow-yellow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: 1,
                opacity: isResolved ? 0 : 0.85,
              }}
              exit={{ opacity: 0 }}
              transition={{
                pathLength: { duration: 1.2 },
                opacity: { duration: 0.5 },
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isResolved && resCoords.length >= 2 && (
            <motion.path
              key="resolved"
              d={pathD(resCoords, w, h)}
              fill="none"
              stroke="#4ade80"
              strokeWidth={4}
              strokeLinecap="round"
              filter="url(#glow-green)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {primary ? (
          <>
            <circle
              cx={ny.x}
              cy={ny.y}
              r={6}
              fill="#0c1021"
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <text
              x={ny.x}
              y={ny.y - 12}
              textAnchor="middle"
              className="fill-slate-400 text-[11px] font-medium"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {originLabel}
            </text>

            {deliveryStops.map((stop, idx) => {
              const pt = project(stop.lng, stop.lat, w, h);
              const short =
                stop.label.split(",")[0]?.trim() || laneDest;
              const isFinal = idx === deliveryStops.length - 1;
              return (
                <g key={`drop-${idx}-${stop.lng}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={6}
                    fill="#0c1021"
                    stroke={isFinal ? "#cbd5e1" : "#94a3b8"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 12}
                    textAnchor="middle"
                    className="fill-slate-400 text-[11px] font-medium"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    {isFinal ? laneDest : short}
                  </text>
                </g>
              );
            })}
          </>
        ) : null}

        <AnimatePresence>
          {hasThreat && primary?.stallLng != null && primary.stallLat != null && (
            <motion.g
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <circle
                cx={truck.x}
                cy={truck.y}
                r={16}
                fill="none"
                stroke="#ef4444"
                strokeWidth={2}
                className="pulse-ring"
                opacity={0.5}
              />
              <circle
                cx={truck.x}
                cy={truck.y}
                r={7}
                fill={isResolved ? "#0c1021" : "#ef4444"}
                stroke={isResolved ? "#64748b" : "#ef4444"}
                strokeWidth={2}
                style={{ transition: "fill 0.6s, stroke 0.6s" }}
              />
              {!isResolved && (
                <text
                  x={truck.x}
                  y={truck.y - 14}
                  textAnchor="middle"
                  className="fill-red-300 text-[10px] font-medium"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  STALLED
                </text>
              )}
            </motion.g>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isResolved &&
            scenario !== "port_strike" &&
            primary?.hubLng != null &&
            primary.hubLat != null && (
            <motion.g
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <circle
                cx={hub.x}
                cy={hub.y}
                r={5}
                fill="#0c1021"
                stroke="#fbbf24"
                strokeWidth={2}
              />
              <text
                x={hub.x}
                y={hub.y - 10}
                textAnchor="middle"
                className="fill-amber-300/80 text-[10px]"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                Hub
              </text>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
}
