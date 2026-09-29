/**
 * src/candidateGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CandidateGenerator – given the current DayState and the day's place pool,
 * returns the set of places that are STRUCTURALLY reachable and not yet visited.
 *
 * "Structural" here means:
 *   1. Not already visited today.
 *   2. Has at least one transport mode that can reach it within the remaining
 *      time (rough upper bound — exact feasibility done by FeasibilityFilter).
 *   3. Visiting it + returning to hotel fits within dayEnd (generous estimate).
 *
 * This is a FAST pre-filter; it does NOT check A1-A9 in detail.
 */

import { haversineKm } from './utils/geo.js';
import config from '../config.js';

/**
 * generateCandidates(state, pool, travelMatrix, cfg?)
 *
 * @param {import('./dayStateManager.js').DayStateManager} state
 * @param {object[]} pool           – normalized place objects for this day
 * @param {object}   travelMatrix   – { [fromId]: { [toId]: { [mode]: { travelMin, km } } } }
 * @param {object}   [cfg]          – config override
 * @returns {object[]}              – subset of pool that passes structural check
 */
export function generateCandidates(state, pool, travelMatrix, cfg = config) {
  const from    = state.currentLocation.id ?? state.hotel.id;
  const timeLeft = state.dayEnd - state.currentTimeMin;
  const modes   = Object.keys(cfg.speeds ?? { walk: 5, taxi: 25, transit: 18 });

  return pool.filter((place) => {
    // 1. Not visited
    if (state.hasVisited(place.id)) return false;

    // 2. Get best (fastest) travel time to this place
    let bestTravelMin = Infinity;
    const toMatrix = travelMatrix[from]?.[place.id];
    if (toMatrix) {
      for (const mode of modes) {
        const leg = toMatrix[mode];
        if (leg && leg.travelMin < bestTravelMin) bestTravelMin = leg.travelMin;
      }
    } else {
      // Fallback: haversine + fastest mode speed
      const km      = haversineKm(
        state.currentLocation.lat ?? state.hotel.lat,
        state.currentLocation.lng ?? state.hotel.lng,
        place.lat, place.lng,
      );
      const fastKph = Math.max(...modes.map((m) => cfg.speeds[m] ?? 5));
      bestTravelMin = (km / fastKph) * 60;
    }

    // 3. Return travel to hotel (generous: use taxi speed)
    let returnMin = 0;
    const backMatrix = travelMatrix[place.id]?.[state.hotel.id];
    if (backMatrix) {
      const taxiLeg = backMatrix.taxi ?? Object.values(backMatrix)[0];
      returnMin = taxiLeg?.travelMin ?? 0;
    } else {
      const km      = haversineKm(place.lat, place.lng, state.hotel.lat, state.hotel.lng);
      returnMin = (km / (cfg.speeds.taxi ?? 25)) * 60;
    }

    const minVisit = place.duration?.min ?? 30;
    const needed   = bestTravelMin + minVisit + returnMin;

    return needed <= timeLeft;
  });
}

export default generateCandidates;
