/**
 * src/globalValidation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GlobalValidation – validates a multi-day trip plan against all global constraints:
 *   1. Total trip budget <= trip.totalBudget
 *   2. Must-visit places (all must be visited across the trip)
 *   3. Deduplication (no place visited more than once across all days)
 *   4. Mandatory group constraints (atLeast / atMost / exactly per category)
 *   5. Daily place counts (minPlacesPerDay <= count <= maxPlacesPerDay)
 */

import { validateGlobalBudget } from './constraints/a4_budget.js';

/**
 * Validate a completed multi-day itinerary.
 *
 * @param {import('./dayStateManager.js').DayStateManager[]} dayStates
 * @param {object} user  – normalized user profile
 * @param {object} trip  – normalized trip spec
 * @param {Map<string,object>} placesMap – all places by ID
 * @returns {{
 *   valid: boolean,
 *   issues: string[],
 *   stats: {
 *     totalSpent: number,
 *     totalBudget: number,
 *     totalStops: number,
 *     scheduledMustVisits: string[],
 *     missingMustVisits: string[],
 *     visitedPlaceIds: string[],
 *   },
 * }}
 */
export function validateGlobalTrip(dayStates, user, trip, placesMap) {
  const issues = [];
  let totalSpent = 0;
  let totalStops = 0;
  const visitedSet = new Set();
  const duplicateVisits = [];
  const categoryCounts = {};

  for (const day of dayStates) {
    totalSpent += day.budgetSpent;

    const dayVisits = day.schedule.filter((e) => e.type === 'visit');
    totalStops += dayVisits.length;

    // Daily min/max count check
    if (user.minPlacesPerDay && dayVisits.length < user.minPlacesPerDay) {
      issues.push(`Day ${day.dayIndex} has ${dayVisits.length} stops, below minimum ${user.minPlacesPerDay}`);
    }
    if (user.maxPlacesPerDay && dayVisits.length > user.maxPlacesPerDay) {
      issues.push(`Day ${day.dayIndex} has ${dayVisits.length} stops, above maximum ${user.maxPlacesPerDay}`);
    }

    for (const v of dayVisits) {
      if (visitedSet.has(v.placeId)) {
        duplicateVisits.push(v.placeId);
      }
      visitedSet.add(v.placeId);

      const place = placesMap?.get?.(v.placeId);
      if (place?.category) {
        categoryCounts[place.category] = (categoryCounts[place.category] ?? 0) + 1;
      }
    }
  }

  // 1. Budget check
  const budgetVal = validateGlobalBudget(totalSpent, trip.totalBudget ?? Infinity);
  if (!budgetVal.feasible) {
    issues.push(budgetVal.failure_reason);
  }

  // 2. Must-visit check
  const scheduledMustVisits = [];
  const missingMustVisits = [];
  for (const mvId of (user.mustVisit ?? [])) {
    if (visitedSet.has(mvId)) {
      scheduledMustVisits.push(mvId);
    } else {
      missingMustVisits.push(mvId);
      issues.push(`Must-visit place "${mvId}" was not scheduled on any day`);
    }
  }

  // 3. Deduplication check
  if (duplicateVisits.length > 0) {
    issues.push(`Places scheduled more than once: ${duplicateVisits.join(', ')}`);
  }

  // 4. Mandatory groups check
  for (const group of (user.mandatoryGroups ?? [])) {
    const count = categoryCounts[group.category] ?? 0;
    if (group.mode === 'atLeast' && count < group.count) {
      issues.push(`Category "${group.category}" visited ${count} times, requires at least ${group.count}`);
    } else if (group.mode === 'atMost' && count > group.count) {
      issues.push(`Category "${group.category}" visited ${count} times, exceeds maximum ${group.count}`);
    } else if (group.mode === 'exactly' && count !== group.count) {
      issues.push(`Category "${group.category}" visited ${count} times, requires exactly ${group.count}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      totalSpent,
      totalBudget: trip.totalBudget,
      totalStops,
      scheduledMustVisits,
      missingMustVisits,
      visitedPlaceIds: [...visitedSet],
    },
  };
}

export default { validateGlobalTrip };
