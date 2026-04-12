/** Map overlays for primary / enriched lanes — persisted as JSON on `ships.route_variants_json`. */
export type RouteVariants = {
  nominal: [number, number][];
  threat: [number, number][];
  resolution: [number, number][];
  portResolution: [number, number][];
};

export function parseRouteVariantsJson(
  raw: string | null,
): RouteVariants | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<RouteVariants>;
    if (
      !o.nominal ||
      !Array.isArray(o.nominal) ||
      o.nominal.length < 2 ||
      !o.portResolution
    ) {
      return null;
    }
    return o as RouteVariants;
  } catch {
    return null;
  }
}
