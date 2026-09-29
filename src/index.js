/**
 * src/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * KroTravel Algorithm B – Main Orchestrator.
 *
 * planTrip(rawInput, userConfig?)
 *   1. Validate input JSON schema (throws ValidationError on invalid).
 *   2. Normalize input to internal typed domain representations.
 *   3. Build complete travel matrix lookup for each day.
 *   4. For each day:
 *      - optimizeDay() via Branch-and-Bound / Greedy.
 *      - buildSchedule() inserting meals, waiting, and hotel return.
 *      - forwardSimulate() ensuring hard constraints A1-A9 hold.
 *      - repairDay() if simulation or backward validation flags issues.
 *      - backwardValidate() computing time slack and fragile stops.
 *   5. Cross-day reallocation of any repair overflow places.
 *   6. Global validation (trip budget, must-visits, deduplication).
 *   7. Formatted JSON output with confidence scoring.
 */

import configDefault             from '../config.js';
import { validateInput }         from './validateInput.js';
import { normalizeInput }        from './normalizeInput.js';
import { optimizeDay }           from './routeOptimizer.js';
import { buildSchedule }         from './scheduleBuilder.js';
import { forwardSimulate }       from './forwardSimulation.js';
import { backwardValidate }      from './backwardValidation.js';
import { repairDay }             from './repairEngine.js';
import { reallocatePlaces }      from './crossDayReallocation.js';
import { validateGlobalTrip }    from './globalValidation.js';
import { formatOutput }          from './output.js';
import { haversineKm }           from './utils/geo.js';

/**
 * Build a nested lookup matrix: matrix[fromId][toId][mode] = { travelMin, km, directness, transfers }
 */
function buildTravelLookup(normMatrix, placesMap, hotel, cfg) {
  const modes = Object.keys(cfg.speeds ?? { walk: 5, taxi: 25, transit: 18 });
  const allLocations = new Map();
  if (hotel) allLocations.set(hotel.id, hotel);
  if (placesMap) {
    for (const [id, p] of placesMap.entries()) {
      allLocations.set(id, { id: p.id, lat: p.lat, lng: p.lng });
    }
  }

  const matrix = {};
  for (const [fromId, fromLoc] of allLocations.entries()) {
    matrix[fromId] = {};
    for (const [toId, toLoc] of allLocations.entries()) {
      matrix[fromId][toId] = {};
      for (const mode of modes) {
        let leg = null;
        if (normMatrix?.lookup) {
          const info = normMatrix.lookup(fromId, toId, mode);
          if (info) {
            leg = {
              travelMin: info.minutes,
              km: info.km,
              directness: info.directness ?? 'direct',
              transfers: info.transfers ?? 0,
            };
          }
        }
        if (!leg) {
          if (fromId === toId) {
            leg = { travelMin: 0, km: 0, directness: 'direct', transfers: 0 };
          } else {
            const speed = cfg.speeds[mode] ?? 25;
            const km = haversineKm(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng);
            const travelMin = (km / speed) * 60;
            leg = {
              travelMin: Math.round(travelMin * 10) / 10,
              km: Math.round(km * 100) / 100,
              directness: mode === 'transit' ? (km <= 10 ? 'direct' : (km <= 20 ? 'partial' : 'indirect')) : 'direct',
              transfers: mode === 'transit' ? (km <= 10 ? 0 : (km <= 20 ? 1 : 2)) : 0,
            };
          }
        }
        matrix[fromId][toId][mode] = leg;
      }
    }
  }
  return matrix;
}

/**
 * Plan a complete multi-day trip.
 *
 * @param {object} rawInput         – raw JSON trip spec from API or file
 * @param {object} [userConfig={}]  – optional config overrides
 * @returns {Promise<object>}       – final structured trip itinerary output
 */
export async function planTrip(rawInput, userConfig = {}) {
  const cfg = { ...configDefault, ...userConfig };

  // 1. Validation
  validateInput(rawInput);

  // 2. Normalization
  const norm = normalizeInput(rawInput, cfg);
  const { user, trip, days, places: placesMap, travelMatrix: normTravelMatrix, context, metadata } = norm;

  const dayStates = [];
  const dayValidations = [];
  // Resolve pool IDs to actual place objects
  const allPoolsByDay = days.map((d) =>
    (d.pool ?? []).map((p) => (typeof p === 'string' ? placesMap.get(p) : p)).filter(Boolean),
  );
  const allTravelMatrices = [];
  let overflowPlaces = [];
  let spentSoFar = 0;

  // 3. Daily Optimization & Scheduling
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const pool = allPoolsByDay[i];

    // Build travel lookup matrix for this day's locations
    const travelMatrix = buildTravelLookup(normTravelMatrix, placesMap, day.hotel, cfg);
    allTravelMatrices.push(travelMatrix);

    const futurePools = allPoolsByDay.slice(i + 1);
    const dayContext = {
      user,
      trip,
      weather: day.weather,
      futurePools,
      budgetSpentBefore: spentSoFar,
      serviceWindows: user.serviceWindows ?? {},
      closures: context?.closures ?? new Set(),
      safetyAlerts: context?.safetyAlerts ?? [],
      environmentalRestrictions: context?.environmentalRestrictions ?? new Set(),
    };

    // Optimize route
    let state = optimizeDay(day, pool, travelMatrix, dayContext, cfg);

    // Build full minute-by-minute schedule
    state = buildSchedule(state, pool, travelMatrix, dayContext, cfg);

    // Forward simulation check
    const sim = forwardSimulate(state.schedule, placesMap, state, dayContext, cfg);

    // If not valid, attempt repair
    if (!sim.valid) {
      const rep = repairDay(state, pool, travelMatrix, dayContext, cfg);
      state = rep.repairedState;
      if (rep.overflowPlaces.length > 0) {
        overflowPlaces.push(...rep.overflowPlaces);
      }
    }

    // Backward validation
    const backVal = backwardValidate(state.schedule, state, cfg);
    dayValidations.push(backVal);

    spentSoFar += state.budgetSpent;
    dayStates.push(state);
  }

  // 4. Cross-Day Reallocation (if overflow places exist)
  if (overflowPlaces.length > 0) {
    const realloc = reallocatePlaces(
      overflowPlaces,
      dayStates,
      allPoolsByDay,
      allTravelMatrices,
      { user, trip, weathers: days.map((d) => d.weather), closures: context?.closures },
      cfg,
    );
    overflowPlaces = realloc.unassignedPlaces;
    for (let d = 0; d < dayStates.length; d++) {
      dayStates[d] = realloc.dayStates[d];
      dayValidations[d] = backwardValidate(dayStates[d].schedule, dayStates[d], cfg);
    }
  }

  // 5. Global Validation
  const globalVal = validateGlobalTrip(dayStates, user, trip, placesMap);

  // 6. Output Formatting
  const output = formatOutput({
    tripId: metadata?.tripId ?? rawInput.tripId ?? 'trip_planned',
    dayStates,
    dayValidations,
    globalValidation: globalVal,
    user,
    trip,
    placesMap,
    unassignedPlaces: overflowPlaces,
    warnings: globalVal.issues,
  }, cfg);

  return output;
}

export default { planTrip };
