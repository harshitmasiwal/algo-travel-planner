/**
 * src/normalizeInput.js
 * Adapter that normalises a validated raw input object into a clean internal
 * representation used by all algorithm modules.
 *
 * Upstream concerns already handled: LLM extraction, geocoding, OSRM calls,
 * K-means clustering into day pools.  This module simply converts types,
 * applies defaults, deduplicates places across day pools, and attaches the
 * travel-matrix in a lookup-friendly form.
 */

import { parseTime, parseISO } from './utils/time.js';
import config from '../config.js';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Map priority string or number to float in [0,1].
 * @param {string|number} p
 * @returns {number}
 */
function normalizePriority(p) {
  if (typeof p === 'number') return Math.max(0, Math.min(1, p));
  const map = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 };
  return map[p] ?? 0.3;
}

/**
 * Parse a "HH:MM" time string, returning minutes since midnight.
 * Returns null when value is null/undefined.
 * @param {string|undefined|null} v
 * @returns {number|null}
 */
function pt(v) {
  if (v == null) return null;
  return parseTime(v);
}

// ── Place normalizer ──────────────────────────────────────────────────────────

/**
 * Normalise a single raw place into the internal place object.
 * @param {object} raw
 * @returns {object} NormalizedPlace
 */
function normalizePlace(raw) {
  return {
    id:                raw.id,
    name:              raw.name,
    lat:               raw.lat,
    lng:               raw.lng,
    category:          raw.category,
    subCategories:     raw.subCategories ?? [],
    tags:              raw.tags ?? [],
    openTime:          parseTime(raw.open),      // distinct from O_i (opening)
    closeTime:         parseTime(raw.close),     // distinct from C_i (closing)
    closedDays:        raw.closedDays ?? [],
    temporaryClosures: (raw.temporaryClosures ?? []).map((tc) => ({
      date: tc.date,
      from: parseTime(tc.from),
      to:   parseTime(tc.to),
    })),
    duration: {
      min:   raw.duration.min,
      ideal: raw.duration.ideal,
      max:   raw.duration.max,
    },
    cost:              raw.cost,
    otherCost:         raw.otherCost ?? 0,
    priority:          normalizePriority(raw.priority ?? 'LOW'),
    existingInterest:  raw.existingInterest ?? 0,
    modifiers: {
      flagship: raw.modifiers?.flagship ?? 0,
      unesco:   raw.modifiers?.unesco   ?? 0,
      mustSee:  raw.modifiers?.mustSee  ?? 0,
      seasonal: raw.modifiers?.seasonal ?? 0,
      campaign: raw.modifiers?.campaign ?? 0,
    },
    outdoorSens:       raw.outdoorSensitivity ?? 0,
    accessRestricted:  raw.accessRestricted ?? false,
    restricted:        raw.restricted ?? false,
    eligibleDays:      raw.eligibleDays ?? null,   // null = all days eligible
    transportAccess:   raw.transportAccess ?? Object.keys(config.speeds),
    booking:           normalizeBooking(raw.booking),
    isRestaurant:      Array.isArray(raw.cuisine) && raw.cuisine.length > 0,
    cuisine:           raw.cuisine ?? [],
    dietTags:          raw.dietTags ?? [],
  };
}

function normalizeBooking(raw) {
  if (!raw) return null;
  return {
    required: raw.required,
    slots: (raw.slots ?? []).map((s) => ({
      slotId:    s.slotId,
      date:      s.date,
      start:     parseTime(s.start),
      end:       parseTime(s.end),
      capacity:  s.capacity,
      available: s.available,
      confirmed: s.confirmed,
      cutoff:    s.cutoff ? parseISO(s.cutoff) : null,
    })),
  };
}

// ── Day normalizer ────────────────────────────────────────────────────────────

function normalizeDay(raw) {
  const hotel = raw.hotel ?? raw.startLocation;
  return {
    dayIndex:      raw.dayIndex,
    date:          raw.date,
    dayStart:      parseTime(raw.dayStart),
    dayEnd:        parseTime(raw.dayEnd),
    hotel,
    startLocation: raw.startLocation ?? hotel,
    endLocation:   raw.endLocation ?? raw.startLocation ?? hotel,
    dailyBudget:   raw.dailyBudget ?? null,
    pool:          [...raw.pool],           // copy; dedup happens after
  };
}

// ── Travel matrix normalizer ──────────────────────────────────────────────────

/**
 * Build a fast lookup: travel(fromId, toId, mode) -> { minutes, km, transfers?,
 * directness? }
 * @param {object} raw
 * @returns {{ ids: string[], lookup: Map<string, object> }}
 */
function normalizeTravelMatrix(raw) {
  const ids = raw.ids;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const modes = raw.modes;

  /**
   * @param {string} fromId
   * @param {string} toId
   * @param {string} mode
   * @returns {{ minutes: number, km: number, transfers: number, directness: string }|null}
   */
  function lookup(fromId, toId, mode) {
    const mdata = modes[mode];
    if (!mdata) return null;
    const fi = idx.get(fromId);
    const ti = idx.get(toId);
    if (fi === undefined || ti === undefined) return null;
    return {
      minutes:    mdata.minutes[fi][ti],
      km:         mdata.km[fi][ti],
      transfers:  mdata.transfers?.[fi]?.[ti] ?? 0,
      directness: mdata.directness?.[fi]?.[ti] ?? 'direct',
    };
  }

  return { ids, idx, modes, lookup };
}

// ── Transport services normalizer ─────────────────────────────────────────────

function normalizeTransportServices(raw) {
  const services = {};
  const defaults = config.defaultServiceWindows;

  // seed with config defaults for all known modes
  for (const [mode, win] of Object.entries(defaults)) {
    services[mode] = {
      open:        parseTime(win.open),
      close:       parseTime(win.close),
      departures:  null,
      transferMin: 0,
      unavailable: [],
    };
  }

  // override with actual input
  if (raw) {
    for (const [mode, svc] of Object.entries(raw)) {
      if (!services[mode]) services[mode] = { unavailable: [] };
      services[mode].open        = parseTime(svc.open);
      services[mode].close       = parseTime(svc.close);
      services[mode].departures  = svc.departures ?? null;
      services[mode].transferMin = svc.transferMin ?? 0;
      services[mode].unavailable = (svc.unavailable ?? []).map((u) => ({
        from: parseTime(u.from),
        to:   parseTime(u.to),
      }));
    }
  }
  return services;
}

// ── Context normalizer ────────────────────────────────────────────────────────

function normalizeContext(raw) {
  if (!raw) return { weather: {}, closures: new Set(), safetyAlerts: [], environmentalRestrictions: new Set(), roadClosures: [], transportSuspensions: [], events: [] };

  // closures: Set of "placeId|date" for O(1) lookup
  const closureSet = new Set((raw.closures ?? []).map((c) => `${c.placeId}|${c.date}`));

  // env restrictions: Set of "placeId|date"
  const envSet = new Set((raw.environmentalRestrictions ?? []).map((r) => `${r.placeId}|${r.date}`));

  return {
    weather:                  raw.weather ?? {},
    closures:                 closureSet,
    safetyAlerts:             raw.safetyAlerts ?? [],
    environmentalRestrictions: envSet,
    roadClosures:             raw.roadClosures ?? [],
    transportSuspensions:     raw.transportSuspensions ?? [],
    events:                   raw.events ?? [],
  };
}

// ── User normalizer ───────────────────────────────────────────────────────────

function normalizeUser(raw) {
  const meals = {};
  for (const [type, m] of Object.entries(raw.meals ?? {})) {
    meals[type] = {
      windowStart:       parseTime(m.windowStart),
      windowEnd:         parseTime(m.windowEnd),
      preferredTime:     m.preferredTime ? parseTime(m.preferredTime) : null,
      timeTolerance:     m.timeTolerance ?? 60,
      durationMin:       m.durationMin ?? 45,
      durationTolerance: m.durationTolerance ?? 30,
      diet:              m.diet ?? 'any',
      cuisines:          m.cuisines ?? [],
      locationPref:      m.locationPref ?? 'near_next_attraction',
      avgCost:           m.avgCost ?? 0,
    };
  }

  return {
    interests:          raw.interests ?? {},
    explicitInterests:  raw.explicitInterests ?? [],
    dislikes:           raw.dislikes ?? [],
    modePreference:     raw.modePreference ?? {},
    allowedModes:       raw.allowedModes ?? Object.keys(config.speeds),
    comfortPreference:  raw.comfortPreference ?? 'standard',
    transferTolerance:  raw.transferTolerance ?? 3,
    maxWalkKm:          raw.maxWalkKm ?? 2,
    waitingToleranceMin: raw.waitingToleranceMin ?? 20,
    weather: {
      tempPrefMin: raw.weather?.tempPrefMin ?? 18,
      tempPrefMax: raw.weather?.tempPrefMax ?? 26,
      coldTol:     raw.weather?.coldTol ?? 10,
      heatTol:     raw.weather?.heatTol ?? 10,
      rainTol:     raw.weather?.rainTol ?? 0.6,
      windTol:     raw.weather?.windTol ?? 0.5,
    },
    costPreference:      raw.costPreference ?? 'balanced',
    preferredCostRange:  raw.preferredCostRange ?? null,
    meals,
    mustVisit:           raw.mustVisit ?? [],
    mustAvoid:           raw.mustAvoid ?? [],
    mandatoryGroups:     raw.mandatoryGroups ?? [],
    forbiddenCategories: raw.forbiddenCategories ?? [],
    minPlacesPerDay:     raw.minPlacesPerDay ?? null,
    maxPlacesPerDay:     raw.maxPlacesPerDay ?? null,
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate place ids across day pools.
 * A place may appear in many pools; it is kept only in the FIRST pool where it
 * appears (by day index, ascending).  Logs every removal.
 *
 * @param {object[]} days  - normalised day objects (mutated in place)
 * @param {string[]} log   - receives log strings
 */
function deduplicatePools(days, log) {
  const seen = new Map(); // placeId -> dayIndex
  for (const day of days) {
    const deduped = [];
    for (const pid of day.pool) {
      if (seen.has(pid)) {
        log.push(
          `DEDUP: place "${pid}" already assigned to day ${seen.get(pid)}; ` +
          `removed from day ${day.dayIndex} pool.`
        );
      } else {
        seen.set(pid, day.dayIndex);
        deduped.push(pid);
      }
    }
    day.pool = deduped;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Normalise a validated raw input into the internal algorithm representation.
 *
 * @param {object} raw - validated raw input (from validateInput)
 * @returns {{
 *   trip: object,
 *   user: object,
 *   days: object[],
 *   places: Map<string, object>,
 *   travelMatrix: object,
 *   transportServices: object,
 *   context: object,
 *   dedupLog: string[],
 * }}
 */
export function normalizeInput(raw) {
  const dedupLog = [];

  const placesArray = raw.places.map(normalizePlace);
  const places = new Map(placesArray.map((p) => [p.id, p]));

  const days = raw.days.map(normalizeDay);

  // Sort by dayIndex ascending before dedup
  days.sort((a, b) => a.dayIndex - b.dayIndex);
  deduplicatePools(days, dedupLog);

  const travelMatrix     = normalizeTravelMatrix(raw.travelMatrix);
  const transportServices = normalizeTransportServices(raw.transportServices);
  const context          = normalizeContext(raw.context);
  const user             = normalizeUser(raw.user);

  const trip = {
    tripId:      raw.trip.tripId,
    currency:    raw.trip.currency,
    totalBudget: raw.trip.totalBudget,
    partySize:   raw.trip.partySize,
    bookingTime: raw.trip.bookingTime ? parseISO(raw.trip.bookingTime) : new Date(),
  };

  return {
    trip,
    user,
    days,
    places,
    travelMatrix,
    transportServices,
    context,
    dedupLog,
  };
}
