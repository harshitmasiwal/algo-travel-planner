/**
 * src/constraints/a3_visitDuration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A3 — Visit Duration Constraints
 *
 *   d_min_i * y_i <= d_i <= d_max_i * y_i   (y_i=1 if selected)
 *   d_i >= 0 ;  y_i in {0,1}
 *   Skipped place => d_i = 0 (y_i = 0)
 *
 * "Ideal" duration is used by B3 (scoring), NOT a hard constraint here.
 * d_i must be an integer number of minutes.
 */

/**
 * Check if a proposed visit duration satisfies A3 for a place.
 *
 * @param {{ duration: { min: number, ideal: number, max: number } }} place
 * @param {number} proposedDurationMin - integer minutes
 * @param {boolean} [selected=true]    - false if the place is being skipped (y_i=0)
 * @returns {{
 *   feasible: boolean,
 *   proposedDuration: number,
 *   minDuration: number,
 *   maxDuration: number,
 *   idealDuration: number,
 *   failure_reason: string|null
 * }}
 */
export function checkVisitDuration(place, proposedDurationMin, selected = true) {
  const { min, ideal, max } = place.duration;
  const d = Math.round(proposedDurationMin);  // enforce integer

  if (!selected) {
    // Skipped: d must be 0
    const feasible = d === 0;
    return {
      feasible,
      proposedDuration: d,
      minDuration: min, maxDuration: max, idealDuration: ideal,
      failure_reason: feasible ? null : `Skipped place must have d=0, got ${d}`,
    };
  }

  const feasible = d >= min && d <= max;
  let failure_reason = null;
  if (d < min) failure_reason = `Duration ${d} min < minimum ${min} min`;
  else if (d > max) failure_reason = `Duration ${d} min > maximum ${max} min`;

  return {
    feasible,
    proposedDuration: d,
    minDuration: min,
    maxDuration: max,
    idealDuration: ideal,
    failure_reason,
  };
}

/**
 * Clamp a proposed duration to [min, max].
 * Used by the repair engine (step 4: adjust visit durations).
 *
 * @param {{ duration: { min: number, max: number } }} place
 * @param {number} proposedDurationMin
 * @returns {number} clamped integer duration
 */
export function clampDuration(place, proposedDurationMin) {
  const { min, max } = place.duration;
  return Math.round(Math.max(min, Math.min(max, proposedDurationMin)));
}

/**
 * Return a list of valid durations to try for a place (min, ideal, max).
 * Useful for duration-adjustment in the repair engine.
 *
 * @param {{ duration: { min: number, ideal: number, max: number } }} place
 * @returns {number[]} distinct sorted candidates
 */
export function durationCandidates(place) {
  const { min, ideal, max } = place.duration;
  return [...new Set([min, ideal, max].map(Math.round))].sort((a, b) => a - b);
}



