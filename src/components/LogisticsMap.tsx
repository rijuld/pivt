"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type MapRef,
} from "react-map-gl/mapbox";
import type {
  CircleLayerSpecification,
  HeatmapLayerSpecification,
  LineLayerSpecification,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FallbackRouteMap } from "./FallbackRouteMap";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import { orderedDeliveryStops } from "@/lib/drop-offs";
import { parseRouteVariantsJson } from "@/lib/route-variants";
import type { ActiveShipment } from "@/lib/shipments";
import {
  alertEpicenter,
  buildCallerHeatmapGeoJSON,
  primaryShipment,
  shipRouteMidpoint,
} from "@/lib/shipments";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function lineFeature(
  routeId: string,
  coords: readonly [number, number][],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: { routeId },
    geometry: { type: "LineString", coordinates: [...coords] },
  };
}

function pointFeature(
  lng: number,
  lat: number,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    properties: { kind: "truck" },
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

interface LogisticsMapProps {
  phase: MapPhase;
  scenario: ScenarioKind;
  fleet: ActiveShipment[];
  /** From SQLite `app_kv` via GET /api/ships — required for port scenario heatmaps. */
  portStrikeEpicenter?: { lng: number; lat: number } | null;
}

export function LogisticsMap({
  phase,
  scenario,
  fleet,
  portStrikeEpicenter = null,
}: LogisticsMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);

  const primary = useMemo(() => primaryShipment(fleet), [fleet]);
  const v = useMemo(
    () => parseRouteVariantsJson(primary?.routeVariantsJson ?? null),
    [primary?.routeVariantsJson],
  );

  const nominalCoords = useMemo(() => v?.nominal ?? [], [v]);
  const resolutionCoords = useMemo(() => {
    if (!v) return [];
    return scenario === "port_strike" ? v.portResolution : v.resolution;
  }, [v, scenario]);

  const collection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        lineFeature("nominal", nominalCoords),
        lineFeature("thinking", resolutionCoords),
        lineFeature("resolution", resolutionCoords),
      ],
    }),
    [nominalCoords, resolutionCoords],
  );

  const truckPoint = useMemo(() => {
    const lng = primary?.stallLng;
    const lat = primary?.stallLat;
    if (lng == null || lat == null) {
      return { type: "FeatureCollection" as const, features: [] };
    }
    return {
      type: "FeatureCollection" as const,
      features: [pointFeature(lng, lat)],
    };
  }, [primary?.stallLng, primary?.stallLat]);

  const fleetPoints = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: fleet.map((s) => {
        const p = shipRouteMidpoint(s);
        return {
          type: "Feature" as const,
          properties: { primary: s.isPrimary ? 1 : 0 },
          geometry: {
            type: "Point" as const,
            coordinates: [p.lng, p.lat] as [number, number],
          },
        };
      }),
    }),
    [fleet],
  );

  const heatData = useMemo(
    () =>
      buildCallerHeatmapGeoJSON(fleet, scenario, phase, portStrikeEpicenter),
    [fleet, scenario, phase, portStrikeEpicenter],
  );
  const heatActive = heatData.features.length > 0;

  const hasThreat = phase !== "nominal";
  const isThinking = phase === "thinking";
  const isResolved = phase === "resolved";

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    if (phase === "nominal" && scenario === "idle") {
      map.flyTo({
        center: [-98.5, 39.8],
        zoom: 3.85,
        duration: 2000,
        essential: true,
      });
      return;
    }

    if (phase !== "nominal") {
      const c = alertEpicenter(scenario, primary, portStrikeEpicenter);
      if (c) {
        map.flyTo({
          center: [c.lng, c.lat],
          zoom: scenario === "port_strike" ? 6.8 : 6.2,
          duration: 2400,
          essential: true,
        });
      }
    }
  }, [mapReady, phase, scenario, primary, portStrikeEpicenter]);

  const nominalLayer: LineLayerSpecification = {
    id: "route-nominal",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "routeId"], "nominal"],
    paint: {
      "line-color": "#475569",
      "line-width": 3,
      "line-opacity": phase === "nominal" ? 0.7 : 0.2,
    },
  };

  const thinkingLayer: LineLayerSpecification = {
    id: "route-thinking",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "routeId"], "thinking"],
    paint: {
      "line-color": "#eab308",
      "line-width": 4,
      "line-opacity": isThinking ? 0.9 : 0,
      "line-dasharray": [3, 2],
    },
  };

  const resolutionLayer: LineLayerSpecification = {
    id: "route-resolution",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "routeId"], "resolution"],
    paint: {
      "line-color": "#4ade80",
      "line-width": 5,
      "line-opacity": isResolved ? 1 : 0,
    },
  };

  const truckGlow: CircleLayerSpecification = {
    id: "truck-glow",
    type: "circle",
    source: "truck",
    paint: {
      "circle-radius": hasThreat && !isResolved ? 20 : 0,
      "circle-color": "#ef4444",
      "circle-opacity": 0.15,
      "circle-blur": 1,
    },
  };

  const truckDot: CircleLayerSpecification = {
    id: "truck-dot",
    type: "circle",
    source: "truck",
    paint: {
      "circle-radius": hasThreat ? 6 : 0,
      "circle-color": isResolved ? "#64748b" : "#ef4444",
      "circle-stroke-width": 2,
      "circle-stroke-color": isResolved ? "#475569" : "#ef4444",
    },
  };

  const fleetLayer: CircleLayerSpecification = {
    id: "fleet-dots",
    type: "circle",
    source: "fleet",
    paint: {
      "circle-radius": ["case", ["==", ["get", "primary"], 1], 7, 4],
      "circle-color": [
        "case",
        ["==", ["get", "primary"], 1],
        "#22d3ee",
        "#475569",
      ],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0c1021",
    },
  };

  const heatmapLayer: HeatmapLayerSpecification = {
    id: "caller-heatmap",
    type: "heatmap",
    source: "caller-heat",
    maxzoom: 18,
    paint: {
      "heatmap-weight": [
        "interpolate",
        ["linear"],
        ["get", "weight"],
        0,
        0,
        12,
        1,
      ],
      "heatmap-intensity": heatActive ? 1.1 : 0,
      "heatmap-radius": 38,
      "heatmap-opacity": heatActive ? 0.72 : 0,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(59,130,246,0)",
        0.25,
        "rgba(251,146,60,0.35)",
        0.55,
        "rgba(239,68,68,0.55)",
        0.85,
        "rgba(220,38,38,0.65)",
        1,
        "rgba(185,28,28,0.5)",
      ],
    },
  };

  if (!TOKEN) {
    return (
      <FallbackRouteMap
        phase={phase}
        scenario={scenario}
        fleet={fleet}
        portStrikeEpicenter={portStrikeEpicenter}
      />
    );
  }

  const originLabel = primary?.routeFrom ?? "Origin";
  const deliveryStops = primary ? orderedDeliveryStops(primary) : [];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{
          longitude: -98.5,
          latitude: 39.8,
          zoom: 3.85,
          pitch: 0,
          bearing: 0,
        }}
        onLoad={() => setMapReady(true)}
        attributionControl={false}
        reuseMaps
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="caller-heat" type="geojson" data={heatData}>
          <Layer {...heatmapLayer} />
        </Source>

        <Source id="fleet" type="geojson" data={fleetPoints}>
          <Layer {...fleetLayer} />
        </Source>

        <Source id="routes" type="geojson" data={collection}>
          <Layer {...nominalLayer} />
          <Layer {...thinkingLayer} />
          <Layer {...resolutionLayer} />
        </Source>

        <Source id="truck" type="geojson" data={truckPoint}>
          <Layer {...truckGlow} />
          <Layer {...truckDot} />
        </Source>

        {primary ? (
          <>
            <Marker
              longitude={primary.originLng}
              latitude={primary.originLat}
              anchor="center"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-300 backdrop-blur">
                  {originLabel}
                </span>
                <div className="h-2.5 w-2.5 border border-slate-500 bg-slate-900" />
              </div>
            </Marker>

            {deliveryStops.map((stop, idx) => {
              const short =
                stop.label.split(",")[0]?.trim() ||
                primary.routeTo ||
                "Drop";
              const isFinal = idx === deliveryStops.length - 1;
              return (
                <Marker
                  key={`drop-${primary.id}-${idx}-${stop.lng}`}
                  longitude={stop.lng}
                  latitude={stop.lat}
                  anchor="center"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-medium backdrop-blur ${
                        isFinal ? "text-slate-200" : "text-slate-300"
                      }`}
                    >
                      {isFinal ? primary.routeTo ?? short : short}
                    </span>
                    <div
                      className={`h-2.5 w-2.5 border bg-slate-900 ${
                        isFinal ? "border-slate-400" : "border-slate-500"
                      }`}
                    />
                  </div>
                </Marker>
              );
            })}

            {isResolved &&
              scenario !== "port_strike" &&
              primary.hubLng != null &&
              primary.hubLat != null && (
                <Marker
                  longitude={primary.hubLng}
                  latitude={primary.hubLat}
                  anchor="center"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-medium text-amber-300 backdrop-blur">
                      Hub
                    </span>
                    <div className="h-2.5 w-2.5 border border-amber-400 bg-slate-900" />
                  </div>
                </Marker>
              )}
          </>
        ) : null}
      </Map>
    </div>
  );
}
