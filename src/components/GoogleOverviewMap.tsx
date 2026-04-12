"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import type { MapPhase, ScenarioKind } from "@/lib/constants";
import { intermediateDropCoordinates } from "@/lib/drop-offs";
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

  const routeKey = useMemo(() => {
    if (phase !== "resolved") return "direct";
    if (scenario === "blizzard" && hub) return "via-cmh";
    if (scenario === "port_strike" && altWaypoint) return "via-phl";
    return "direct";
  }, [phase, scenario, hub, altWaypoint]);

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

    if (dropWps.length > 0) {
      request.waypoints = dropWps;
    } else if (routeKey === "via-cmh" && hub) {
      request.waypoints = [{ location: hub, stopover: true }];
    } else if (routeKey === "via-phl" && altWaypoint) {
      request.waypoints = [{ location: altWaypoint, stopover: true }];
    }

    svc.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        setDirections(result);
      } else {
        setDirections(null);
      }
    });
  }, [isLoaded, origin, destination, routeKey, hub, altWaypoint, shipment]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  const polyOpts = useMemo(() => polylineForPhase(phase), [phase]);

  const mapCenter = useMemo(() => {
    return {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
  }, [origin, destination]);

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
      options={{
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      }}
    >
      {directions && (
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
      )}

      {stall && (phase === "threat" || phase === "thinking") && (
        <Marker position={stall} title="Exception — stalled asset" />
      )}

      {hub && phase === "resolved" && scenario === "blizzard" && (
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
