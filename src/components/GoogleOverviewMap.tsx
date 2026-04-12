"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import type { FallbackRouteMode } from "@/lib/committed-route-visual";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import {
  intermediateDropCoordinates,
  orderedDeliveryStops,
  shipRouteMidpointWithDrops,
} from "@/lib/drop-offs";
import type { ActiveShipment } from "@/lib/shipments";

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

const MAP_CONTAINER_STYLE: CSSProperties = {
  width: "100%",
  height: "min(48vh, 480px)",
  minHeight: 360,
};

function polylineForPhase(phase: MapPhase): {
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  zIndex: number;
} {
  switch (phase) {
    case "nominal":
      return {
        strokeColor: "#a3a3a3",
        strokeWeight: 5,
        strokeOpacity: 0.95,
        zIndex: 1,
      };
    case "threat":
      return {
        strokeColor: "#ef4444",
        strokeWeight: 6,
        strokeOpacity: 0.95,
        zIndex: 2,
      };
    case "thinking":
      return {
        strokeColor: "#fbbf24",
        strokeWeight: 6,
        strokeOpacity: 0.95,
        zIndex: 2,
      };
    case "resolved":
      return {
        strokeColor: "#d8f966",
        strokeWeight: 6,
        strokeOpacity: 0.95,
        zIndex: 3,
      };
    default:
      return {
        strokeColor: "#a3a3a3",
        strokeWeight: 5,
        strokeOpacity: 0.9,
        zIndex: 1,
      };
  }
}

interface GoogleOverviewMapLoadedProps {
  apiKey: string;
  phase: MapPhase;
  scenario: ScenarioKind;
  shipment: ActiveShipment;
}

function GoogleOverviewMapLoaded({
  apiKey,
  phase,
  scenario,
  shipment,
}: GoogleOverviewMapLoadedProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "war-room-google-maps",
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  /** Server-resolved path for the committed Optimizing option (Google or fallback). */
  const [committedEncoded, setCommittedEncoded] = useState<string | null>(null);
  const [committedFallback, setCommittedFallback] =
    useState<FallbackRouteMode | null>(null);

  const origin = useMemo(
    () => ({ lat: shipment.originLat, lng: shipment.originLng }),
    [shipment.originLat, shipment.originLng],
  );
  const destination = useMemo(
    () => ({ lat: shipment.destLat, lng: shipment.destLng }),
    [shipment.destLat, shipment.destLng],
  );

  const hub = useMemo((): google.maps.LatLngLiteral | null => {
    if (shipment.hubLng == null || shipment.hubLat == null) return null;
    return { lat: shipment.hubLat, lng: shipment.hubLng };
  }, [shipment.hubLat, shipment.hubLng]);

  const stall = useMemo((): google.maps.LatLngLiteral | null => {
    if (shipment.stallLng == null || shipment.stallLat == null) return null;
    return { lat: shipment.stallLat, lng: shipment.stallLng };
  }, [shipment.stallLat, shipment.stallLng]);

  const altWaypoint = useMemo((): google.maps.LatLngLiteral | null => {
    if (shipment.altWaypointLng == null || shipment.altWaypointLat == null) {
      return null;
    }
    return { lat: shipment.altWaypointLat, lng: shipment.altWaypointLng };
  }, [shipment.altWaypointLat, shipment.altWaypointLng]);

  const directionsRouteKey = useMemo(():
    | "direct"
    | "via-cmh"
    | "via-phl"
    | "avoid-hw" => {
    if (committedFallback === "via_hub") return "via-cmh";
    if (committedFallback === "via_alt") return "via-phl";
    if (committedFallback === "avoid_highways") return "avoid-hw";
    if (committedFallback === "direct") return "direct";
    if (committedEncoded) return "direct";
    if (phase !== "resolved") return "direct";
    if (scenario === "blizzard" && hub) return "via-cmh";
    if (scenario === "port_strike" && altWaypoint) return "via-phl";
    return "direct";
  }, [
    committedEncoded,
    committedFallback,
    phase,
    scenario,
    hub,
    altWaypoint,
  ]);

  const committedDecodedPath = useMemo((): google.maps.LatLngLiteral[] | null => {
    if (!isLoaded || !committedEncoded || typeof google === "undefined") {
      return null;
    }
    try {
      const path = google.maps.geometry.encoding.decodePath(committedEncoded);
      if (path.length === 0) return null;
      return path.map((p) => {
        const ll = p as google.maps.LatLng;
        return { lat: ll.lat(), lng: ll.lng() };
      });
    } catch {
      return null;
    }
  }, [isLoaded, committedEncoded]);

  const deliveryStops = useMemo(
    () => orderedDeliveryStops(shipment),
    [shipment],
  );

  /**
   * After committing an Optimizing next-leg polyline, show the rest of the lane
   * as a muted driving path (first delivery stop → … → final stop).
   */
  const [remainderPath, setRemainderPath] = useState<
    google.maps.LatLngLiteral[] | null
  >(null);

  useEffect(() => {
    const letter = shipment.optimizingSelectedRoute?.trim();
    if (!letter) {
      setCommittedEncoded(null);
      setCommittedFallback(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/ships/${encodeURIComponent(shipment.id)}/committed-route-map?scenario=${encodeURIComponent(scenario)}`,
          { signal: ac.signal },
        );
        const data = (await res.json()) as {
          source?: string;
          encodedPolyline?: string;
          routeMode?: FallbackRouteMode;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setCommittedEncoded(null);
          // Keep a non-null fallback so we do not block client Directions forever
          // (``waitingCommitted`` requires both encoded and fallback null).
          setCommittedFallback("direct");
          return;
        }
        if (data.source === "google_polyline" && data.encodedPolyline) {
          setCommittedEncoded(data.encodedPolyline);
          setCommittedFallback(null);
        } else if (data.source === "fallback" && data.routeMode) {
          setCommittedEncoded(null);
          setCommittedFallback(data.routeMode);
        } else {
          setCommittedEncoded(null);
          setCommittedFallback("direct");
        }
      } catch {
        if (!ac.signal.aborted) {
          setCommittedEncoded(null);
          setCommittedFallback(null);
        }
      }
    })();
    return () => ac.abort();
  }, [
    shipment.id,
    shipment.optimizingSelectedRoute,
    shipment.dropOffsJson,
    shipment.destLat,
    shipment.destLng,
    scenario,
  ]);

  useEffect(() => {
    if (!isLoaded || typeof google === "undefined") {
      setRemainderPath(null);
      return;
    }
    if (!committedDecodedPath?.length) {
      setRemainderPath(null);
      return;
    }
    if (deliveryStops.length < 2) {
      setRemainderPath(null);
      return;
    }
    const first = deliveryStops[0]!;
    const last = deliveryStops[deliveryStops.length - 1]!;
    const mid = deliveryStops.slice(1, -1).map((s) => ({
      location: { lat: s.lat, lng: s.lng } as google.maps.LatLngLiteral,
      stopover: true as const,
    }));
    let cancelled = false;
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin: { lat: first.lat, lng: first.lng },
        destination: { lat: last.lat, lng: last.lng },
        waypoints: mid.length > 0 ? mid : undefined,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (cancelled) return;
        if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.[0]) {
          setRemainderPath(null);
          return;
        }
        const route = result.routes[0]!;
        const overview = route.overview_path ?? [];
        const literals: google.maps.LatLngLiteral[] = overview.map((p) => ({
          lat: p.lat(),
          lng: p.lng(),
        }));
        setRemainderPath(literals.length > 0 ? literals : null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isLoaded, committedDecodedPath, deliveryStops]);

  const fetchRoute = useCallback(() => {
    if (!isLoaded || typeof google === "undefined") return;

    const dropWps = intermediateDropCoordinates(shipment).map((w) => ({
      location: w as google.maps.LatLngLiteral,
      stopover: true as const,
    }));

    const svc = new google.maps.DirectionsService();
    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
    };

    if (directionsRouteKey === "avoid-hw") {
      request.avoidHighways = true;
    }

    if (dropWps.length > 0) {
      request.waypoints = dropWps;
    } else if (directionsRouteKey === "via-cmh" && hub) {
      request.waypoints = [{ location: hub, stopover: true }];
    } else if (directionsRouteKey === "via-phl" && altWaypoint) {
      request.waypoints = [{ location: altWaypoint, stopover: true }];
    }

    svc.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        setDirections(result);
      } else {
        setDirections(null);
      }
    });
  }, [
    isLoaded,
    origin,
    destination,
    directionsRouteKey,
    hub,
    altWaypoint,
    shipment,
  ]);

  useEffect(() => {
    if (!isLoaded || typeof google === "undefined") return;
    if (committedDecodedPath?.length) {
      setDirections(null);
      return;
    }
    const waitingCommitted =
      Boolean(shipment.optimizingSelectedRoute?.trim()) &&
      committedEncoded === null &&
      committedFallback === null;
    if (waitingCommitted) return;
    fetchRoute();
  }, [
    isLoaded,
    committedDecodedPath,
    committedEncoded,
    committedFallback,
    shipment.optimizingSelectedRoute,
    shipment.dropOffsJson,
    shipment.destLat,
    shipment.destLng,
    fetchRoute,
  ]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !committedDecodedPath?.length) return;
    const b = new google.maps.LatLngBounds();
    for (const p of committedDecodedPath) {
      b.extend(p);
    }
    b.extend(origin);
    for (const s of deliveryStops) {
      b.extend({ lat: s.lat, lng: s.lng });
    }
    if (remainderPath) {
      for (const p of remainderPath) {
        b.extend(p);
      }
    }
    map.fitBounds(b, 48);
  }, [committedDecodedPath, origin, deliveryStops, remainderPath]);

  const polyOpts = useMemo(() => {
    if (committedDecodedPath?.length || committedFallback) {
      return {
        strokeColor: "#d8f966",
        strokeWeight: 7,
        strokeOpacity: 0.98,
        zIndex: 5,
      };
    }
    return polylineForPhase(phase);
  }, [phase, committedDecodedPath, committedFallback]);

  const mapCenter = useMemo(() => {
    if (deliveryStops.length >= 2) {
      const m = shipRouteMidpointWithDrops(shipment);
      return { lat: m.lat, lng: m.lng };
    }
    return {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
  }, [shipment, origin, destination, deliveryStops]);

  if (loadError) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center bg-[var(--surface-card)] p-6 text-center text-[13px] text-[var(--muted)]">
        Could not load Google Maps ({String(loadError)}).
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center bg-[var(--surface-card)] text-[var(--muted)]">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={mapCenter}
      zoom={6}
      onLoad={onMapLoad}
      options={{
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      }}
    >
      {remainderPath && remainderPath.length > 0 ? (
        <Polyline
          path={remainderPath}
          options={{
            strokeColor: "#737373",
            strokeWeight: 5,
            strokeOpacity: 0.9,
            zIndex: 3,
            geodesic: true,
          }}
        />
      ) : null}
      {committedDecodedPath && committedDecodedPath.length > 0 ? (
        <Polyline
          path={committedDecodedPath}
          options={{
            strokeColor: polyOpts.strokeColor,
            strokeWeight: polyOpts.strokeWeight,
            strokeOpacity: polyOpts.strokeOpacity,
            zIndex: polyOpts.zIndex,
            geodesic: true,
          }}
        />
      ) : null}
      {directions && !committedDecodedPath?.length ? (
        <DirectionsRenderer
          directions={directions}
          options={{
            polylineOptions: {
              strokeColor: polyOpts.strokeColor,
              strokeWeight: polyOpts.strokeWeight,
              strokeOpacity: polyOpts.strokeOpacity,
              zIndex: polyOpts.zIndex,
            },
            suppressMarkers: false,
          }}
        />
      ) : null}

      {committedDecodedPath?.length ? (
        <>
          <Marker position={origin} title="Origin" />
          {deliveryStops.map((s, i) => (
            <Marker
              key={`stop-${i}-${s.lat}-${s.lng}`}
              position={{ lat: s.lat, lng: s.lng }}
              title={s.label}
            />
          ))}
        </>
      ) : null}

      {stall && (phase === "threat" || phase === "thinking") && (
        <Marker position={stall} title="Exception — stalled asset" />
      )}

      {hub &&
        (directionsRouteKey === "via-cmh" ||
          (phase === "resolved" && scenario === "blizzard")) && (
        <Marker
          position={hub}
          title={shipment.hubLabel ?? "Relay hub"}
        />
      )}
    </GoogleMap>
  );
}

function MissingKeyPlaceholder() {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 bg-[var(--surface-card)] p-8 text-center">
      <p className="text-[14px] font-semibold text-[var(--foreground)]">
        Google Maps API key required
      </p>
      <p className="max-w-md text-[12px] leading-relaxed text-[var(--muted)]">
        Add{" "}
        <code className="bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[var(--foreground)]">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        to <code className="font-mono text-[var(--muted)]">.env.local</code> and enable
        the <strong className="text-[var(--foreground)]">Maps JavaScript API</strong> and{" "}
        <strong className="text-[var(--foreground)]">Directions API</strong> for your
        project.
      </p>
    </div>
  );
}

interface GoogleOverviewMapProps {
  phase: MapPhase;
  scenario: ScenarioKind;
  shipment: ActiveShipment | null;
}

export function GoogleOverviewMap({
  phase,
  scenario,
  shipment,
}: GoogleOverviewMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <MissingKeyPlaceholder />;
  }

  if (!shipment) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-6 text-center text-[13px] text-[var(--muted)]">
        Select a load in the left panel to preview directions on the map.
      </div>
    );
  }

  return (
    <GoogleOverviewMapLoaded
      apiKey={apiKey}
      phase={phase}
      scenario={scenario}
      shipment={shipment}
    />
  );
}
