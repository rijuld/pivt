"use client";

import type { UsMapDisplay } from "@/lib/weather-route-intersection";

/** Corridor polylines — single color for all affected routes. */
const ROUTE_STROKE = "#f43f5e";

/** NWS `severity`: Extreme, Severe, Moderate, Minor, Unknown */
function markerColorForSeverity(severity: string): string {
  const u = severity.toLowerCase();
  if (u === "extreme") return "#b91c1c";
  if (u === "severe") return "#ea580c";
  if (u === "moderate") return "#ca8a04";
  if (u === "minor") return "#22c55e";
  return "#94a3b8";
}

/** US Albers outline, affected corridor polylines, and alert markers. */
export function WeatherAlertsMap({ display }: { display: UsMapDisplay | null }) {
  if (!display) {
    return (
      <div className="flex min-h-[200px] items-center justify-center border border-dashed border-[var(--border)] bg-[var(--surface-card)] text-[12px] text-[var(--muted)]">
        Map unavailable.
      </div>
    );
  }

  const {
    viewBoxWidth,
    viewBoxHeight,
    landPathD,
    stateBordersPathD,
    routePaths,
    markers,
  } = display;
  const hasRoutes = routePaths.length > 0;
  const hasMarkers = markers.length > 0;

  return (
    <div className="relative w-full overflow-hidden border border-[var(--border)] bg-[#0a1628]">
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="h-auto w-full max-h-[min(50vh,520px)]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`United States map: ${markers.length} NWS alert(s) from the API; ${routePaths.length} disrupted corridor line(s)`}
      >
        <title>All active NWS alerts and disrupted fleet corridors</title>
        <rect width={viewBoxWidth} height={viewBoxHeight} fill="#0c1829" />

        <path
          d={landPathD}
          fill="#2a4054"
          stroke="#3d5a73"
          strokeWidth={0.75}
          strokeLinejoin="round"
        />

        {stateBordersPathD ? (
          <path
            d={stateBordersPathD}
            fill="none"
            stroke="#5a7a96"
            strokeWidth={0.45}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          >
            <title>State boundaries</title>
          </path>
        ) : null}

        {routePaths.map((rp) => (
          <path
            key={rp.shipmentId}
            d={rp.pathD}
            fill="none"
            stroke={ROUTE_STROKE}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          >
            <title>{`Corridor ${rp.shipmentId}`}</title>
          </path>
        ))}

        {!hasRoutes && !hasMarkers ? (
          <text
            x={viewBoxWidth / 2}
            y={viewBoxHeight / 2}
            textAnchor="middle"
            fill="#94a3b8"
            style={{ fontSize: "12px" }}
          >
            No active alerts from the API
          </text>
        ) : null}

        {markers.map((p, i) => {
          const fill = markerColorForSeverity(p.alertlevel);
          const key = `nws-${i}-${p.x.toFixed(1)}-${p.y.toFixed(1)}`;
          return (
            <g key={key} transform={`translate(${p.x},${p.y})`}>
              <title>{`${p.name} (${p.eventtype}) · ${p.alertlevel}`}</title>
              <circle r="16" fill="none" stroke={fill} strokeWidth="1.5" opacity={0.45}>
                <animate
                  attributeName="r"
                  values="5;20;5"
                  dur="2.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.85;0.08;0.85"
                  dur="2.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="5" fill={fill} stroke="#fecaca" strokeWidth="1.2" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
