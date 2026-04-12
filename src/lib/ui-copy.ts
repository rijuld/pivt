/**
 * User-facing product copy — friendly names, greetings, and labels.
 */

export const app = {
  /** Product / company mark — top-left brand */
  brand: "Pivt",
  name: "Delivery Command Center",
  shortName: "Command Center",
  pageTitle: "Pivt — Delivery Command Center",
  metaDescription:
    "Track shipments, compare route options in Response flow, and keep customers updated — all in one calm dashboard.",
} as const;

/** Time-of-day greeting for the signed-in experience (client-safe). */
export function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const greeting = {
  /** One line under the main title */
  tagline: "Track routes, try scenarios, and keep everyone informed.",
  /** Sidebar intro under the product name */
  sidebarWelcome: "Here’s a live look at your network.",
  /** Shown while the main panel loads */
  loading: "Opening your dashboard…",
} as const;

export const sidebar = {
  /** Above weather — network-wide tools (not one load) */
  sectionFleetWide: "Fleet-wide",
  weatherNavTitle: "Weather events",
  weatherNavHint: "NWS alerts vs all routes",
  sectionLoads: "Loads you’re watching",
  addLoad: "Add a load",
  editLoad: "Edit",
  loadsLoading: "Loading your loads…",
  laneCount: (n: number) =>
    n === 1 ? "1 active route" : `${n} active routes`,
  assistHint: "Smart helpers stay ready in the background",
  estLateFee: "Est. late fee if delayed",
  featuredLoad: "Featured load",
  /** Route tab footer / KPI strip — matches sidebar selection */
  focusedLoad: "Load in focus",
  profileSection: "Your organization",
  editProfile: "Edit profile",
  profileLoading: "Loading profile…",
  /** Title for the blinking dot when an NWS alert intersects that load’s corridor (cached snapshot). */
  attentionBlinkTitle:
    "Attention: active weather alert intersects this load’s corridor",
} as const;

export const profileModal = {
  title: "Company profile",
  subtitle:
    "This workspace is saved on this device. Update how your organization appears in the command center.",
  companyName: "Company name",
  contactEmail: "Contact email",
  contactPhone: "Phone",
  hqLine1: "Address line 1",
  hqLine2: "Address line 2",
  city: "City",
  state: "State",
  postalCode: "ZIP / postal code",
  website: "Website",
  optionalHeading: "Headquarters (optional)",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
} as const;

export const main = {
  headline: "Delivery Command Center",
  welcomeLine: () => `${getTimeGreeting()}, glad you’re here.`,
  subline: greeting.tagline,
  tabMap: "Route",
  tabUpdatedRoute: "Route updates",
  tabWeather: "Weather events",
  tabWeatherSubtitle: "US NWS alerts vs routes",
  tabComms: "Driver updates",
  tabLog: "Activity feed",
  tabFlow: "Response flow",
  flowTitle: "How the team responds to an alert",
  flowIntro:
    "The pipeline order on the board is: Optimizing Pivt → Facility Pivt → Driver Pivt. Run Routing Pivt from the Weather events tab (NWS vs corridors) or via API. The board and activity feed follow the load selected in the left panel.",
  flowBoardTitle: "Agent workload by shipment",
  flowBoardPathColumn: "Path status",
  /** When the modeled corridor intersects an active NWS alert (same as Weather events tab). */
  flowBoardPathWeatherIntersect: "Active weather alert on corridor",
  flowBoardPathAttentionNeeded: "Attention needed",
  /** Red pill in Path status when NWS intersection applies */
  flowBoardAttentionChip: "Attention needed",
  flowBoardHint:
    "Path status uses the same NWS corridor intersection as Weather events: if a load’s route hits an active alert, it shows an attention state. Otherwise it reflects scenario path plus each load’s operational status. Then: shipment id and lane; agent columns are Optimizing, Facility, and Driver. Hover a column header for a summary, or click for full details. Use Run agent on any cell to execute that Pivt against that load.",
  flowCellRun: "Run agent",
  flowCellRunning: "Running…",
  flowAgentStatusTitle: "Agent run in progress",
  flowAgentStatusTitleDone: "Last agent run",
  flowAgentStatusLoad: (id: string) => `Load ${id}`,
  flowAgentStatusFooter:
    "Calling Watsonx Orchestrate — the cell below will show the result when finished.",
  flowAgentStatusDismissHint:
    "Use the floating panel — Next steps opens a summary. Dismiss (×) clears it.",
  flowNegotiatorPickInModal:
    "Pick a route in Next steps (this panel) — your choice is saved to the load record and shown on the Route updates tab.",
  flowModalRouteSection: "Commit route to load",
  flowModalConfirmRoute: "Save selection",
  flowModalOptOut: "Opt out",
  flowModalRouteBusy: "Saving…",
  flowModalRouteError: "Could not update load. Try again.",
  flowModalSaved: (opt: string) =>
    `✓ Route ${opt} saved — see the Route updates tab for the map.`,
  flowModalOptedOut: "✓ Opted out — Facility Pivt is running for this load.",
  workspaceToastRouteSaved: (opt: string) =>
    `Route ${opt} saved. Switched to Route updates — the map shows that path.`,
  workspaceToastRouteOptOut:
    "Opted out of committing a route. Facility Pivt is starting for this load.",
  flowModalFacilitySection: "Apply delivery stop order",
  flowModalApplyFacilityOrder: "Apply selected order",
  flowModalFacilityBusy: "Updating load…",
  flowModalFacilityError: "Could not update delivery stops.",
  workspaceToastFacilityOrderSaved:
    "Delivery stop order saved — committed route cleared so the map follows the new stop sequence.",
  weatherTitle: "US weather alerts vs your corridors",
  weatherDesc:
    "The map plots every alert returned by api.weather.gov. Below, only loads whose corridors are disrupted by an alert are listed.",
  weatherLoading:
    "Fetching NWS alerts and testing route intersections…",
  weatherError:
    "Could not load weather.gov data or compute intersections. Try again in a moment.",
  weatherRefresh: "Refresh",
  weatherRefreshing: "Refreshing…",
  weatherSource:
    "Event data: National Weather Service (api.weather.gov/alerts/active). US coverage.",
  weatherSummary: (
    totalAlerts: number,
    routesWithAlerts: number,
    fleetSize: number,
    fetchedAt: string,
  ) =>
    `Map: all ${totalAlerts} active NWS alert(s). Disrupted corridors: ${routesWithAlerts} of ${fleetSize} load(s). Last updated: ${new Date(fetchedAt).toLocaleString()}.`,
  weatherBufferNote: (km: number) =>
    `Point geometries use a ${km} km buffer vs the route; polygon / multipolygon alerts use direct line–polygon intersection.`,
  weatherEmpty:
    "No NWS alerts intersect any of your route corridors with the current geometry.",
  weatherNoShips:
    "No loads in your fleet — add loads from the sidebar to scan corridors against active alerts.",
  weatherNoIntersect: "Clear — no NWS alert overlap on this lane.",
  weatherIntersectCount: (n: number) =>
    `${n} alert(s) intersect this corridor.`,
  weatherReportLink: "Open alert on weather.gov",
  weatherMapTitle: "United States — active alerts (NWS)",
  weatherMapDesc:
    "United States (Albers): pulsing dots are every active NWS alert. Colored lines are disrupted loads — full driving paths from Google Directions (overview polyline) when a Maps API key is set; otherwise a simplified fallback line.",
  mapCaption:
    "Driving directions for the load selected in the left panel (Google Maps). The featured NY→Chicago lane uses a Columbus hub in weather scenarios, or Philadelphia for port scenarios.",
  updatedRouteTitle: "Route updates",
  updatedRouteSelectLoadHint:
    "Select a load in the left panel to see route updates for that shipment.",
  updatedRouteDesc:
    "History of delivery stop order and committed Optimizing route changes for the selected load. Revert restores a prior snapshot. Map follows the live load record.",
  updatedRouteEmpty:
    "No committed route letter on this load yet. Run Optimizing Pivt → Next steps to save a letter, or use Facility Pivt to reorder stops — changes appear in the table above.",
  routeRevisionsSectionTitle: "Route change history",
  routeRevisionsLoading: "Loading route history…",
  routeRevisionsEmpty:
    "No route updates recorded yet. Saving a route option, opting out, or editing stops on this load will create entries here.",
  routeRevisionsLoadError: "Could not load route history.",
  routeRevisionsRevertError: "Could not restore that snapshot.",
  routeRevisionsRevert: "Revert",
  routeRevisionsReverting: "Restoring…",
  routeRevisionsCurrentBadge: "Current",
  routeRevisionsYes: "Yes",
  routeRevisionsNo: "No",
  routeRevisionsColWhen: "When",
  routeRevisionsColSummary: "Update",
  routeRevisionsColStops: "Stop order",
  routeRevisionsColRoute: "Committed",
  routeRevisionsColOptOut: "Opt out",
  routeRevisionsColAction: "Action",
  updatedRouteCaption:
    "When a letter option is saved, the line matches that Google Directions profile. Opt out skips committing a map leg and hands off to Facility Pivt.",
  routeCommitted: (opt: string) =>
    `Route ${opt} committed — this load will follow the selected route.`,
  routeOptedOut:
    "Route commit skipped — Facility Pivt will determine next steps for this load.",
  routesRiskPrefix: "Risk check — ",
  driverCrmTitle: "Driver & shipment CRM",
  driverCrmHint:
    "The load is the one selected in the left panel. Contact the assigned driver or dispatcher and review the activity log. End‑customer email drafts appear below after a scenario completes.",
  driverCrmEmptyFleet:
    "Choose a shipment in the left panel (or wait for loads to finish loading) to open driver and dispatch details here.",
  driverCrmLoadLabel: "Load / shipment",
  driverCrmDriverCard: "Driver on file",
  driverCrmDispatchCard: "Dispatcher / carrier desk",
  driverCrmCall: "Call driver",
  driverCrmCallDispatch: "Call dispatch",
  driverCrmText: "Text driver",
  driverCrmEmail: "Email",
  driverCrmComposerLabel: "Message driver or carrier",
  driverCrmComposerPlaceholder:
    "e.g. Confirm Columbus relay — call when empty.",
  driverCrmSendMessage: "Send message (log)",
  driverCrmQueueEmail: "Queue email (log)",
  driverCrmTimelineTitle: "Call log & messages",
  driverCrmCustomerDraftTitle: "End customer update (separate from driver)",
  driverCrmCustomerDraftHint:
    "After a scenario, Driver Pivt’s draft for your shipper or consignee appears here.",
  driverCrmCustomerDraftEmpty:
    "Run a sample scenario on the left to generate a customer-facing email draft.",
  driverCrmCustomerSend: "Send customer email",
  driverCrmCustomerSent: "✓ Customer email sent (logged)",
  logTitle: "What happened",
  logHint: "Step-by-step updates with timestamps.",
  logEmptyForLoad:
    "No activity logged for this load yet. When you run a scenario, steps appear here for this shipment only.",
  logScopeNote: (loadId: string) => `Showing activity for load ${loadId}.`,
  routesScopeNote: (loadId: string) => `Route options below apply to load ${loadId}.`,
  legendDirections: "Directions",
  legendPath: "Start → finish",
  legendIssue: "Issue",
  legendWorking: "Working on it",
  legendDone: "New route picked",
  approveAlternatives: "Approve selected route",
  approveAlternativesDone: (optionLabel: string) =>
    `Route ${optionLabel} approved`,
  approveAlternativesHint:
    "Pick one option in the table, then confirm so downstream steps can proceed.",
  routesSuggested: "Suggested",
  routesSelected: "Selected",
  routesSuggestedAndSelected: "Suggested · selected",
  routesTapHint: "Tap a card to select. Suggested is the team’s default — pick another if you prefer.",
  suggestRoutes: "Suggest routes",
  suggestRoutesHint:
    "Ask Optimizing Pivt to recompute alternatives — ETAs and costs update; you’ll need to approve again if you already confirmed.",
  approveAlternativesWait:
    "Run a weather or port scenario on the left, then approve here.",
  approveAlternativesRunning: "Finish the scenario run to enable approval.",
  approveAlternativesNoResolution: "Complete the scenario to enable approval.",
} as const;

export const loadStatusLabel: Record<
  "nominal" | "at_risk" | "exception",
  string
> = {
  nominal: "On track",
  at_risk: "At risk",
  exception: "Needs attention",
};

export const shipModal = {
  addTitle: "Add a new load",
  editTitle: "Edit this load",
  addSubtitle: "Saved on this device so you can pick up where you left off.",
  refId: "Reference ID",
  state: "State",
  region: "Region",
  from: "From",
  to: "To",
  dropOffsSection: "Delivery stops",
  dropOffsHint:
    "Optional — stops are visited in order; the last one is final delivery. Leave empty to use a single destination from your lane.",
  placeLabel: "Place name",
  latitude: "Latitude",
  longitude: "Longitude",
  addDropOff: "Add delivery stop",
  removeDropOff: "Remove",
  moveStopUp: "Move up",
  moveStopDown: "Move down",
  status: "Status",
  primaryVip: "Star this load (one starred load at a time)",
  optionalHeading: "Extra details (optional)",
  carrier: "Carrier (optional)",
  equipment: "Equipment (optional)",
  customerRef: "Customer or PO # (optional)",
  notes: "Notes (optional)",
  driverDispatchHeading: "Driver & dispatch (optional)",
  driverName: "Driver name",
  driverPhone: "Driver phone",
  driverEmail: "Driver email",
  driverOrg: "Driver company / fleet",
  dispatcherName: "Dispatcher name",
  dispatcherPhone: "Dispatcher phone",
  dispatcherEmail: "Dispatcher email",
  dispatcherOrg: "Dispatch desk / org",
  cancel: "Cancel",
  save: "Save",
  create: "Add load",
  saving: "Saving…",
} as const;

export const simulationWelcome = {
  title: "You’re connected",
  body: (loadId: string, priority: string, lane: string) =>
    `We’re watching load ${loadId} (${priority} priority). ${lane} — your team is standing by.`,
} as const;

export const agentLabels: Record<
  string,
  { short: string; category: string }
> = {
  watchman: { short: "Routing", category: "Pivt" },
  node_manager: { short: "Facility", category: "Pivt" },
  negotiator: { short: "Optimizing", category: "Pivt" },
  diplomat: { short: "Driver", category: "Pivt" },
  system: { short: "Ingest", category: "Telemetry" },
};

export const routesIntel = {
  title: "Suggested routes",
  riskPrefix: "Summary — ",
} as const;

/** Bottom-right disaster intel chat (Tavily Search API — not watsonx Orchestrate). */
export const disasterChat = {
  title: "Disaster intel",
  subtitle: "Live web search via Tavily",
  fabAria: "Open disaster information chat",
  closeAria: "Close disaster information chat",
  placeholder: "Ask about advisories, continuity, corridors…",
  send: "Send",
  thinking: "Searching…",
  introAssistant:
    "Ask anything about current disaster management, emergency operations, or freight continuity. Answers use **Tavily** web search from this app. Verify critical facts with official sources.",
  noApiKey:
    "Tavily is not configured. Add **TAVILY_API_KEY** to `.env.local` and restart the dev server.",
  sourcesHeading: "Sources",
} as const;
