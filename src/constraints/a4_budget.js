/**
 * src/constraints/a4_budget.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A4 — Budget Constraints
 *
 *   C_total = sum P_i*y_i + sum C_ij*x_ij + sum M_i*m_i + sum O_i*o_i <= B
 *
 *   Transport cost per leg:
 *     C_ij = baseFare[mode] + perKm[mode] * km
 *     If perPerson[mode]=true: C_ij *= partySize
 *
 *   Entry cost P_i: always * partySize (per person)
 *   Meal cost M_i:  always * partySize
 *   Other cost O_i: always * partySize
 *
 *   Day budget:
 *     B_day = min(dailyBudget ?? Infinity,
 *                 totalBudget - spentOnEarlierDays - reserveForFutureMustVisits)
 *
 *   reserve = sum of entry costs of must-visit places not yet scheduled
 *             on days (dayIndex+1 … D)
 */

import config from '../../config.js';

// ── Transport cost ────────────────────────────────────────────────────────────

/**
 * Compute the transport cost for one leg.
 *
 * @param {string} mode
 * @param {number} km
 * @param {number} partySize
 * @param {object} [cfg]  - override config.fares (for testing)
 * @returns {number} cost in INR
 */
export function computeTransportCost(mode, km, partySize, cfg = config) {
  const fare = cfg.fares[mode];
  if (!fare) return 0;
  const base = fare.baseFare + fare.perKm * km;
  return fare.perPerson ? base * partySize : base;
}

// ── Entry / meal / other cost ─────────────────────────────────────────────────

/**
 * Compute the per-party entry cost of a place.
 * @param {{ cost: number }} place
 * @param {number} partySize
 * @returns {number}
 */
export function entryCost(place, partySize) {
  return (place.cost ?? 0) * partySize;
}

/**
 * Compute the per-party other cost of a place.
 * @param {{ otherCost: number }} place
 * @param {number} partySize
 * @returns {number}
 */
export function otherCost(place, partySize) {
  return (place.otherCost ?? 0) * partySize;
}

/**
 * Compute the per-party meal cost.
 * @param {number} avgCost  - cost per person
 * @param {number} partySize
 * @returns {number}
 */
export function mealCost(avgCost, partySize) {
  return (avgCost ?? 0) * partySize;
}

// ── Incremental budget check ──────────────────────────────────────────────────

/**
 * Check if adding the next place is within the remaining budget.
 *
 * @param {{
 *   budgetRemaining: number,
 *   currentLocationId: string,
 *   endLocationId: string,
 * }} state
 * @param {{ id: string, cost: number, otherCost: number }} nextPlace
 * @param {string} transportMode
 * @param {number} legKm
 * @param {number} returnKm   - distance from next place back to end location
 * @param {number} partySize
 * @param {object} [cfg]
 * @returns {{
 *   feasible: boolean,
 *   incrementalCost: number,
 *   budgetAfter: number,
 *   budgetRemaining: number,
 *   failure_reason: string|null
 * }}
 */
export function checkIncrementalBudget(
  state, nextPlace, transportMode, legKm, returnKm, partySize, cfg = config
) {
  const tCost     = computeTransportCost(transportMode, legKm, partySize, cfg);
  const tReturn   = computeTransportCost(transportMode, returnKm, partySize, cfg);
  const pCost     = entryCost(nextPlace, partySize);
  const oCost     = otherCost(nextPlace, partySize);
  // Note: meal cost is not included here — it is added when a meal is inserted
  const incremental = tCost + pCost + oCost;
  const totalWithReturn = incremental + tReturn;  // reserve for return leg

  const budgetAfter = state.budgetRemaining - totalWithReturn;
  const feasible    = budgetAfter >= 0;

  return {
    feasible,
    incrementalCost:  incremental,
    returnCostReserve: tReturn,
    budgetAfter:      state.budgetRemaining - incremental,  // after spending (excl return reserve)
    budgetRemaining:  state.budgetRemaining,
    failure_reason:   feasible ? null :
      `Incremental cost ₹${totalWithReturn.toFixed(0)} exceeds budget ₹${state.budgetRemaining.toFixed(0)}`,
  };
}

// ── Total cost tally ──────────────────────────────────────────────────────────

/**
 * Compute total accumulated cost for a day's schedule.
 *
 * @param {{
 *   stops: { transportMode: string, legKm: number, cost: number, otherCost: number }[],
 *   meals: { avgCost: number }[],
 *   returnMode: string,
 *   returnKm: number,
 * }} schedule
 * @param {number} partySize
 * @param {object} [cfg]
 * @returns {{ totalCost: number, breakdown: object }}
 */
export function computeTotalCost(schedule, partySize, cfg = config) {
  let cPlace     = 0;
  let cTransport = 0;
  let cMeal      = 0;
  let cOther     = 0;

  for (const stop of schedule.stops) {
    cPlace     += (stop.cost     ?? 0) * partySize;
    cOther     += (stop.otherCost ?? 0) * partySize;
    cTransport += computeTransportCost(stop.transportMode, stop.legKm, partySize, cfg);
  }
  // Return leg
  if (schedule.returnMode) {
    cTransport += computeTransportCost(schedule.returnMode, schedule.returnKm, partySize, cfg);
  }
  for (const meal of (schedule.meals ?? [])) {
    cMeal += mealCost(meal.avgCost, partySize);
  }

  const totalCost = cPlace + cTransport + cMeal + cOther;
  return {
    totalCost,
    breakdown: { place: cPlace, transport: cTransport, meal: cMeal, other: cOther },
  };
}

// ── Day budget calculation ────────────────────────────────────────────────────

/**
 * Compute the effective budget available for a given day.
 *
 * @param {{
 *   totalBudget: number,
 *   partySize: number,
 * }} trip
 * @param {{ dayIndex: number, dailyBudget: number|null }} day
 * @param {number} spentOnEarlierDays
 * @param {Map<string,object>} places         - all places
 * @param {string[]} mustVisitIds             - all must-visit ids
 * @param {number[][]} futurePoolsByDay       - pool ids for days after dayIndex
 *   (parallel array: futurePoolsByDay[k] = pool for day dayIndex+1+k)
 * @param {Set<string>} scheduledMustVisits   - must-visits already placed
 * @param {number} [cfgPartySize]
 * @returns {{ effectiveBudget: number, reserve: number, dailyCap: number|null }}
 */
export function computeDayBudget(
  trip, day, spentOnEarlierDays,
  places, mustVisitIds, futurePoolsByDay, scheduledMustVisits
) {
  const partySize = trip.partySize;

  // Reserve = entry cost of must-visit places not yet scheduled, appearing in future pools
  let reserve = 0;
  const futurePlaceIds = new Set(futurePoolsByDay.flat());
  for (const mvId of mustVisitIds) {
    if (!scheduledMustVisits.has(mvId) && futurePlaceIds.has(mvId)) {
      const p = places.get(mvId);
      if (p) reserve += entryCost(p, partySize);
    }
  }

  const globalRemaining = trip.totalBudget - spentOnEarlierDays - reserve;
  const dailyCap        = day.dailyBudget ?? null;
  const effectiveBudget = dailyCap !== null
    ? Math.min(dailyCap, globalRemaining)
    : globalRemaining;

  return { effectiveBudget: Math.max(0, effectiveBudget), reserve, dailyCap };
}

// ── Global budget validation ──────────────────────────────────────────────────

/**
 * Validate total trip cost against totalBudget.
 * @param {number} totalSpent
 * @param {number} totalBudget
 * @returns {{ feasible: boolean, overrun: number, failure_reason: string|null }}
 */
export function validateGlobalBudget(totalSpent, totalBudget) {
  const overrun  = Math.max(0, totalSpent - totalBudget);
  const feasible = overrun === 0;
  return {
    feasible,
    overrun,
    failure_reason: feasible ? null :
      `Total spent ₹${totalSpent.toFixed(0)} exceeds budget ₹${totalBudget.toFixed(0)} by ₹${overrun.toFixed(0)}`,
  };
}
