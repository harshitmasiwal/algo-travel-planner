/**
 * src/scheduleBuilder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ScheduleBuilder – takes the ordered route from RouteOptimizer and produces
 * the full minute-by-minute schedule, inserting:
 *   - Travel legs
 *   - Waiting periods
 *   - Visit blocks
 *   - Meal breaks (at current location if no restaurant in pool)
 *   - Hotel return leg
 *
 * Returns a completed DayStateManager with full schedule array.
 */

import { mealWindowHit, buildMealEntry, advanceClock } from './masterClock.js';
import { parseTime, formatTime }                        from './utils/time.js';
import { computeTransportCost }                         from './constraints/a4_budget.js';

/**
 * buildSchedule(optimizedState, pool, travelMatrix, context, cfg)
 *
 * @param {import('./dayStateManager.js').DayStateManager} optimizedState
 *   – state returned from routeOptimizer (has schedule of 'visit' entries)
 * @param {object[]} pool          – all places for this day (for restaurant lookup)
 * @param {object}   travelMatrix  – travel matrix
 * @param {object}   context       – { user, trip, weather }
 * @param {object}   cfg           – config
 * @returns {import('./dayStateManager.js').DayStateManager} fully scheduled state
 */
export function buildSchedule(optimizedState, pool, travelMatrix, context, cfg) {
  const { user, trip } = context;
  const state = optimizedState;  // already has visit entries; we enrich it here

  // The optimizer already committed entries. We now do a second pass to:
  // 1. Insert meal breaks that the optimizer skipped
  // 2. Add the hotel return leg
  // 3. Recalculate timings from scratch for correctness

  // Rebuild from the ordered visit list
  const visitEntries = state.schedule
    .filter((e) => e.type === 'visit')
    .sort((a, b) => a.startMin - b.startMin);

  // Fresh state
  const fresh = state.clone();
  fresh.schedule  = [];
  fresh.budgetSpent = 0;
  fresh.currentTimeMin = fresh.dayStart;
  fresh.currentLocation = { ...fresh.hotel };
  fresh.mealsServed = new Set();

  let fromId = fresh.hotel.id;

  for (const entry of visitEntries) {
    const place = pool.find((p) => p.id === entry.placeId);
    if (!place) continue;

    // Travel leg
    const legData    = travelMatrix[fromId]?.[place.id];
    const bestMode   = _bestMode(legData, cfg);
    const travelMin  = legData?.[bestMode]?.travelMin ?? entry.travelMin ?? 0;
    const km         = legData?.[bestMode]?.km         ?? entry.kmFromPrev ?? 0;
    const partySize  = trip?.partySize ?? 1;
    const tCost      = computeTransportCost(bestMode, km, partySize, cfg);

    // Check meal window before this stop
    const mealType = mealWindowHit(
      fresh.currentTimeMin,
      fresh.currentTimeMin + travelMin,
      user?.meals,
      fresh.mealsServed,
    );

    if (mealType && user?.meals?.[mealType]) {
      const mealEntry = buildMealEntry(
        mealType,
        fresh.currentTimeMin,
        user.meals[mealType],
        fresh.currentLocation,
      );
      fresh.addEntry(mealEntry);
      fresh.markMeal(mealType);
    }

    // Clock advance
    const clock = advanceClock(
      fresh.currentTimeMin, travelMin, place, entry.visitMin,
    );

    if (travelMin > 0) {
      fresh.addEntry({
        type: 'travel', placeId: place.id, mode: bestMode,
        startMin: fresh.currentTimeMin,
        endMin:   fresh.currentTimeMin + travelMin,
        travelMin, waitMin: 0, visitMin: 0,
        costTransport: tCost, costEntry: 0, kmFromPrev: km,
      });
    }

    if (clock.waitMin > 0) {
      fresh.addEntry({
        type: 'wait', placeId: place.id, mode: 'none',
        startMin: fresh.currentTimeMin + travelMin,
        endMin:   clock.startMin,
        travelMin: 0, waitMin: clock.waitMin, visitMin: 0,
        costTransport: 0, costEntry: 0, kmFromPrev: 0,
      });
    }

    fresh.addEntry({
      type: 'visit', placeId: place.id, mode: bestMode,
      startMin:  clock.startMin,
      endMin:    clock.finishMin,
      travelMin: 0, waitMin: 0, visitMin: entry.visitMin,
      costTransport: 0, costEntry: (place.cost ?? 0) * partySize,
      kmFromPrev: km,
    });

    fresh.currentLocation = { id: place.id, lat: place.lat, lng: place.lng };
    fromId = place.id;
  }

  // Post-visit meal check (dinner after last stop)
  for (const [mealType, pref] of Object.entries(user?.meals ?? {})) {
    if (!fresh.mealsServed.has(mealType)) {
      const winEnd = typeof pref.windowEnd === 'number' ? pref.windowEnd : (pref.windowEnd ? parseTime(pref.windowEnd) : 1290);
      if (fresh.currentTimeMin <= winEnd) {
        const mealEntry = buildMealEntry(mealType, fresh.currentTimeMin, pref, fresh.currentLocation);
        if (mealEntry.endMin <= fresh.dayEnd) {
          fresh.addEntry(mealEntry);
          fresh.markMeal(mealType);
        }
      }
    }
  }

  // Hotel return
  const returnLeg = travelMatrix[fromId]?.[fresh.hotel.id];
  const retMode   = _bestMode(returnLeg, cfg);
  const retMin    = returnLeg?.[retMode]?.travelMin ?? 0;
  const retKm     = returnLeg?.[retMode]?.km ?? 0;
  const retCost   = computeTransportCost(retMode, retKm, trip?.partySize ?? 1, cfg);

  fresh.addEntry({
    type: 'return', placeId: fresh.hotel.id, mode: retMode,
    startMin:  fresh.currentTimeMin,
    endMin:    fresh.currentTimeMin + retMin,
    travelMin: retMin, waitMin: 0, visitMin: 0,
    costTransport: retCost, costEntry: 0, kmFromPrev: retKm,
  });

  return fresh;
}

function _bestMode(legData, cfg) {
  if (!legData) return 'taxi';
  const modes = Object.keys(legData);
  if (modes.length === 0) return 'taxi';
  // Pick fastest mode
  return modes.reduce((best, m) =>
    (legData[m].travelMin ?? Infinity) < (legData[best].travelMin ?? Infinity) ? m : best,
    modes[0],
  );
}

export default buildSchedule;
