export type MapPhase = "nominal" | "threat" | "thinking" | "resolved";

export type ScenarioKind = "idle" | "blizzard" | "port_strike";

export const EXCEPTION_ALERTS: Record<Exclude<ScenarioKind, "idle">, string> = {
  blizzard:
    "Heavy snow on I-80 West — about 14 hours of delay possible on that corridor.",
  port_strike:
    "Labor action at Port Newark — containers may sit about 36 hours longer than usual.",
};
