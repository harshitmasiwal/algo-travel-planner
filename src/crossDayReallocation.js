/**
 * src/crossDayReallocation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CrossDayReallocation – moves unscheduled or repair-overflow places to
 * alternative days.
 *
 * Rules:
 *   1. Candidate days ranked by ascending distance to day centroid.
 *   2. Distance must be <= config.maxReallocKm (25 km).
 *   3. Hard gates: place.eligibleDays (if set), place.closedDays (must not be closed).
 *   4. Safe insertion: a valid day is never broken. If insertion fails simulation, rollback.
 */

import config               from '../config.js';
import { haversineKm, centroid } from './utils/geo.js';
import { optimizeDay }      from './routeOptimizer.js';
import { buildSchedule }    from './scheduleBuilder.js';
import { forwardSimulate }  from './forwardSimulation.js';

/**
 * Attempt to reallocate overflow places across available days.
 *
 * @param {object[]} overflowPlaces     – places needing assignment
 * @param {import('./dayStateManager.js').DayStateManager[]} dayStates
 * @param {object[][]} poolsByDay        – array of place pools per day
 * @param {object|object[]} travelMatrices – travel matrix per day or global
 * @param {object} context              – { user, trip, weathers }
 * @param {object} [cfg]                – config override
 * @returns {{
 *   dayStates: import('./dayStateManager.js').DayStateManager[],
 *   unassignedPlaces: object[],
 *   reallocatedCount: number,
 * }}
 */
export function reallocatePlaces(
  overflowPlaces,
  dayStates,
  poolsByDay,
  travelMatrices,
  context,
  cfg = config,
) {
  const maxKm = cfg.maxReallocKm ?? 25;
  const unassignedPlaces = [];
  let reallocatedCount = 0;

  // Clone dayStates so we can rollback if needed
  const updatedDayStates = dayStates.map((s) => s.clone());
  const updatedPools = poolsByDay.map((p) => [...p]);

  for (const place of overflowPlaces) {
    let placed = false;

    // Rank days by centroid distance
    const dayRankings = [];
    for (let d = 0; d < updatedDayStates.length; d++) {
      const state = updatedDayStates[d];
      const pool = updatedPools[d];

      // Gate: already visited on this day
      if (state.hasVisited(place.id)) continue;

      // Gate: eligibleDays
      if (place.eligibleDays && !place.eligibleDays.includes(d)) continue;

      // Gate: day of week closed
      const dayOfWeek = new Date(state.date).toLocaleDateString('en-US', { weekday: 'short' });
      if ((place.closedDays ?? []).includes(dayOfWeek)) continue;

      // Centroid distance
      const dayLocs = pool.length > 0 ? pool : [state.hotel];
      const c = centroid(dayLocs);
      const dist = haversineKm(place.lat, place.lng, c.lat, c.lng);

      if (dist <= maxKm) {
        dayRankings.push({ dayIndex: d, distance: dist });
      }
    }

    dayRankings.sort((a, b) => a.distance - b.distance);

    for (const { dayIndex: d } of dayRankings) {
      const targetState = updatedDayStates[d];
      const targetPool = [...updatedPools[d], place];
      const targetMatrix = Array.isArray(travelMatrices)
        ? travelMatrices[d]
        : travelMatrices[targetState.hotel.id] ? travelMatrices : travelMatrices;
      const dayWeather = context.weathers?.[d] ?? context.weather;
      const dayCtx = { ...context, weather: dayWeather };

      // Try optimizing target day with the added place
      const backupState = targetState.clone();
      const trialState = optimizeDay(
        {
          dayIndex: targetState.dayIndex,
          date: targetState.date,
          dayStart: targetState.dayStart,
          dayEnd: targetState.dayEnd,
          hotel: targetState.hotel,
          dailyBudget: targetState.dailyBudget,
        },
        targetPool,
        targetMatrix,
        dayCtx,
        cfg,
      );

      const scheduledTrial = buildSchedule(trialState, targetPool, targetMatrix, dayCtx, cfg);
      const placesMap = new Map(targetPool.map((p) => [p.id, p]));
      const sim = forwardSimulate(scheduledTrial.schedule, placesMap, scheduledTrial, dayCtx, cfg);

      // Verify feasible AND place was actually included
      if (sim.valid && scheduledTrial.hasVisited(place.id)) {
        updatedDayStates[d] = scheduledTrial;
        updatedPools[d] = targetPool;
        placed = true;
        reallocatedCount++;
        break;
      }
    }

    if (!placed) {
      unassignedPlaces.push(place);
    }
  }

  return {
    dayStates: updatedDayStates,
    unassignedPlaces,
    reallocatedCount,
  };
}

export default { reallocatePlaces };
