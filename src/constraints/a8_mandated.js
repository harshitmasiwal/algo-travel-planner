/**
 * src/constraints/a8_mandated.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A8 — User-Mandated Constraints
 *
 *   1. Must-visit:  y_i = 1  for all i in mustVisit
 *   2. Must-avoid:  y_i = 0  for all i in mustAvoid
 *   3. Forbidden categories: y_i = 0 if place.category in forbiddenCategories
 *   4. Mandatory group:  sum y_i >= N for each (category, mode='atLeast')
 *                        sum y_i <= N for each (category, mode='atMost')
 *                        sum y_i == N for each (category, mode='exactly')
 *   5. Daily count: N_min <= |{y_i=1 for day d}| <= N_max
 *   6. Walk limit:  km_walk_ij <= maxWalkKm  (surfaced here from A6)
 */

// ── Individual place checks ───────────────────────────────────────────────────

/**
 * Check if a place violates any user-mandated constraint for inclusion/exclusion.
 *
 * @param {{ id: string, category: string }} place
 * @param {{
 *   mustVisit: string[],
 *   mustAvoid: string[],
 *   forbiddenCategories: string[],
 *   allowedModes: string[],
 *   maxWalkKm: number,
 * }} user
 * @param {{ mode: string, legKm: number }|null} leg - transport info for this arrival leg
 * @returns {{
 *   includeForced: boolean,   - true: must include (mustVisit)
 *   excludeForced: boolean,   - true: must exclude
 *   reason: string|null
 * }}
 */
export function checkMandatedPlace(place, user, leg = null) {
  // Must-visit → forced inclusion
  if (user.mustVisit.includes(place.id)) {
    return { includeForced: true, excludeForced: false, reason: 'MUST_VISIT' };
  }
  // Must-avoid → forced exclusion
  if (user.mustAvoid.includes(place.id)) {
    return { includeForced: false, excludeForced: true, reason: 'MUST_AVOID' };
  }
  // Forbidden category
  if ((user.forbiddenCategories ?? []).includes(place.category)) {
    return { includeForced: false, excludeForced: true, reason: 'FORBIDDEN_CATEGORY' };
  }
  // Walk limit check (if leg is by walk)
  if (leg && leg.mode === 'walk' && leg.legKm > user.maxWalkKm) {
    return { includeForced: false, excludeForced: true, reason: 'WALK_TOO_FAR' };
  }
  return { includeForced: false, excludeForced: false, reason: null };
}

// ── Route-level validation ────────────────────────────────────────────────────

/**
 * Validate a proposed route against all A8 constraints.
 *
 * @param {{
 *   id: string,
 *   category: string,
 * }[]} route         - ordered list of chosen places for the day
 * @param {{
 *   mustVisit: string[],
 *   mustAvoid: string[],
 *   forbiddenCategories: string[],
 *   mandatoryGroups: { category: string, count: number, mode: 'atLeast'|'atMost'|'exactly' }[],
 *   minPlacesPerDay: number,
 *   maxPlacesPerDay: number,
 * }} user
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateRoute(route, user) {
  const issues  = [];
  const ids     = route.map((p) => p.id);
  const cats    = route.map((p) => p.category);

  // 1. Must-visit all present
  for (const mvId of user.mustVisit) {
    if (!ids.includes(mvId)) {
      issues.push(`A8: Must-visit place "${mvId}" not included in route`);
    }
  }

  // 2. Must-avoid none present
  for (const maId of user.mustAvoid) {
    if (ids.includes(maId)) {
      issues.push(`A8: Must-avoid place "${maId}" present in route`);
    }
  }

  // 3. Forbidden categories
  for (const fc of (user.forbiddenCategories ?? [])) {
    if (cats.includes(fc)) {
      const names = route.filter((p) => p.category === fc).map((p) => p.id);
      issues.push(`A8: Forbidden category "${fc}" present (places: ${names.join(', ')})`);
    }
  }

  // 4. Mandatory groups
  for (const grp of (user.mandatoryGroups ?? [])) {
    const count = cats.filter((c) => c === grp.category).length;
    if (grp.mode === 'atLeast' && count < grp.count) {
      issues.push(`A8: Need at least ${grp.count} "${grp.category}" place(s), have ${count}`);
    } else if (grp.mode === 'atMost' && count > grp.count) {
      issues.push(`A8: Need at most ${grp.count} "${grp.category}" place(s), have ${count}`);
    } else if (grp.mode === 'exactly' && count !== grp.count) {
      issues.push(`A8: Need exactly ${grp.count} "${grp.category}" place(s), have ${count}`);
    }
  }

  // 5. Daily count bounds
  const N = route.length;
  if (user.minPlacesPerDay !== undefined && N < user.minPlacesPerDay) {
    issues.push(`A8: Day has ${N} places, minimum is ${user.minPlacesPerDay}`);
  }
  if (user.maxPlacesPerDay !== undefined && N > user.maxPlacesPerDay) {
    issues.push(`A8: Day has ${N} places, maximum is ${user.maxPlacesPerDay}`);
  }

  return { valid: issues.length === 0, issues };
}

// ── Must-visit feasibility check ─────────────────────────────────────────────

/**
 * Check which must-visit places are NOT schedulable in any remaining day pool.
 *
 * @param {string[]} mustVisitIds
 * @param {Set<string>} scheduledIds   - already scheduled
 * @param {string[][]} futurePools     - pool ids for each future day
 * @returns {string[]} IDs of must-visit places that cannot be scheduled
 */
export function unschedulableMustVisits(mustVisitIds, scheduledIds, futurePools) {
  const futureSet = new Set(futurePools.flat());
  return mustVisitIds.filter(
    (id) => !scheduledIds.has(id) && !futureSet.has(id)
  );
}
