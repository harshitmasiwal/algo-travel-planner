/**
 * src/backwardValidation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * BackwardValidation – sweeps the schedule in REVERSE from dayEnd, computing
 * the Latest Start Time (LST) for each stop so the return is on time.
 *
 * For each stop i (in reverse order n → 1):
 *   LST_i = LST_{i+1} - travelTime(i→i+1) - visitDuration_{i+1} - waitTime_{i+1}
 *
 * Slack:  LS_i = LST_i - EarliestStart_i   (from forward pass)
 *   LS_i < 0           → infeasible (stop is too late)
 *   LS_i < fragileSlack → "fragile" stop (warn)
 *
 * Returns: { feasible, slacks, fragileStops, issues }
 */

import config from '../config.js';

/**
 * backwardValidate(schedule, state, cfg?)
 *
 * @param {object[]} schedule  – ordered entries from DayStateManager
 * @param {object}   state     – DayStateManager snapshot (dayEnd, dayStart)
 * @param {object}   [cfg]     – config override
 * @returns {{ feasible: boolean, slacks: object[], fragileStops: string[], issues: object[] }}
 */
export function backwardValidate(schedule, state, cfg = config) {
  const fragileThreshold = cfg.fragileSlackMin ?? 20;
  const dayEnd           = state.dayEnd;

  // Build ordered list of visit entries only
  const visits = schedule
    .filter((e) => e.type === 'visit')
    .sort((a, b) => a.startMin - b.startMin);

  // Find the return entry
  const returnEntry = schedule.find((e) => e.type === 'return');
  const returnMin   = returnEntry?.travelMin ?? 0;

  // Latest start time of RETURN is dayEnd - travelMin
  // Sweep backward through visits
  let currentLST = dayEnd - returnMin;  // LST for last stop's finish

  const slacks      = [];
  const fragileStops = [];
  const issues      = [];

  for (let i = visits.length - 1; i >= 0; i--) {
    const entry   = visits[i];
    const travelToNext = i < visits.length - 1
      ? (schedule.find((e) =>
          e.type === 'travel' &&
          schedule.indexOf(e) > schedule.indexOf(entry) &&
          e.placeId === visits[i + 1].placeId,
        )?.travelMin ?? 0)
      : returnMin;

    const waitAtStop = entry.waitMin ?? 0;
    const lstStart   = currentLST - entry.visitMin - waitAtStop;
    const estStart   = entry.startMin;

    const slackMin   = lstStart - estStart;

    slacks.push({
      placeId:   entry.placeId,
      estStart,
      lstStart,
      slackMin,
      visitMin:  entry.visitMin,
      fragile:   slackMin < fragileThreshold && slackMin >= 0,
      infeasible: slackMin < 0,
    });

    if (slackMin < 0) {
      issues.push({
        type: 'BACKWARD_INFEASIBLE',
        placeId: entry.placeId,
        message: `Stop has no backward slack (LS=${lstStart.toFixed(0)}, EST=${estStart.toFixed(0)}, slack=${slackMin.toFixed(0)} min)`,
      });
    } else if (slackMin < fragileThreshold) {
      fragileStops.push(entry.placeId);
    }

    // Move LST pointer backward (include wait + visit for current stop)
    currentLST = lstStart - travelToNext;
  }

  return {
    feasible:     issues.length === 0,
    slacks:       slacks.reverse(),   // return in forward order
    fragileStops,
    issues,
  };
}

export default backwardValidate;
