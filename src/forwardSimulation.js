/**
 * src/forwardSimulation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ForwardSimulation – dry-runs the schedule forward from dayStart to dayEnd.
 * Detects constraint violations AFTER schedule is built, producing a list of
 * issues for the repair engine.
 *
 * Checks per stop:
 *   - A1: finish > closeTime
 *   - A2: day overrun on return
 *   - A3: visitMin out of bounds
 *   - A4: budget exceeded
 *   - A5: place closed on this date
 *   - A9: safety hazard
 *
 * Returns: { valid: boolean, issues: Issue[], stats: object }
 */

import { checkTimeWindow }     from './constraints/a1_timeWindows.js';
import { checkDayBoundary }    from './constraints/a2_dayBoundary.js';
import { checkVisitDuration }  from './constraints/a3_visitDuration.js';
import { checkIncrementalBudget } from './constraints/a4_budget.js';
import { checkAvailability }   from './constraints/a5_availability.js';
import { checkPlaceSafety }    from './constraints/a9_safety.js';

/**
 * @typedef {object} SimIssue
 * @property {string} type      – 'A1_OVERRUN' | 'A2_DAY_OVERRUN' | 'A3_DURATION' | 'A4_BUDGET' | 'A5_CLOSED' | 'A9_SAFETY'
 * @property {string} placeId
 * @property {string} message
 * @property {object} [details]
 */

/**
 * forwardSimulate(schedule, places, state, context, cfg)
 *
 * @param {object[]} schedule   – schedule entries from DayStateManager
 * @param {Map}      places     – Map<placeId, placeObject>
 * @param {object}   state      – DayStateManager snapshot
 * @param {object}   context    – { weather, user, trip }
 * @param {object}   cfg        – config
 * @returns {{ valid: boolean, issues: SimIssue[], stats: object }}
 */
export function forwardSimulate(schedule, places, state, context, cfg) {
  const { weather, user, trip } = context;
  const issues = [];
  let totalCost = 0;

  // Walk schedule entries
  for (const entry of schedule) {
    totalCost += (entry.costTransport ?? 0) + (entry.costEntry ?? 0);

    if (entry.type === 'visit') {
      const place = places.get(entry.placeId);
      if (!place) continue;

      // A1: time window
      const tw = checkTimeWindow(place, entry.startMin - entry.waitMin, entry.visitMin);
      if (!tw.feasible) {
        issues.push({
          type: 'A1_OVERRUN', placeId: place.id,
          message: tw.failure_reason ?? 'Time window violated',
          details: { startMin: entry.startMin, finishMin: entry.endMin },
        });
      }

      // A3: visit duration (skip if place has no duration spec — e.g. abstract meal blocks)
      if (place.duration) {
        const durCheck = checkVisitDuration(place, entry.visitMin);
        if (!durCheck.feasible) {
          issues.push({
            type: 'A3_DURATION', placeId: place.id,
            message: `visitMin ${entry.visitMin} outside [${place.duration?.min},${place.duration?.max}]`,
            details: { visitMin: entry.visitMin, duration: place.duration },
          });
        }
      }

      // A5: availability
      const availCtx = { closures: new Set() };
      const avail = checkAvailability(
        place, state.date, state.dayIndex ?? 0,
        entry.startMin, entry.endMin,
        [], availCtx,
      );
      if (!avail.available) {
        issues.push({
          type: 'A5_CLOSED', placeId: place.id,
          message: avail.reason ?? 'Place not available',
          details: { date: state.date },
        });
      }

      // A9: safety
      const safety = checkPlaceSafety(place, state.date, entry.startMin, weather, {});
      if (!safety.safe) {
        issues.push({
          type: 'A9_SAFETY', placeId: place.id,
          message: safety.failure_reason ?? 'Safety hazard',
          details: safety,
        });
      }
    }

    if (entry.type === 'return') {
      // A2: day boundary
      const db = checkDayBoundary(schedule, state.dayEnd);
      if (!db.feasible) {
        issues.push({
          type: 'A2_DAY_OVERRUN', placeId: 'hotel',
          message: db.failure_reason ?? 'Day overrun',
          details: { returnMin: entry.endMin, dayEnd: state.dayEnd },
        });
      }
    }
  }

  // A4: total budget
  const remainingBudget = state.totalBudget - state.budgetSpentBefore;
  const budgetCheck = checkIncrementalBudget(totalCost, remainingBudget);
  if (!budgetCheck.feasible) {
    issues.push({
      type: 'A4_BUDGET', placeId: 'day',
      message: `Total cost ₹${totalCost.toFixed(0)} exceeds remaining budget ₹${budgetCheck.remaining.toFixed(0)}`,
      details: { totalCost, remaining: budgetCheck.remaining },
    });
  }

  const visitEntries = schedule.filter((e) => e.type === 'visit');
  const returnEntry  = schedule.find((e) => e.type === 'return');

  return {
    valid:  issues.length === 0,
    issues,
    stats: {
      totalCost,
      stopCount:   visitEntries.length,
      returnMin:   returnEntry?.endMin ?? null,
      dayEnd:      state.dayEnd,
      overrunMin:  returnEntry ? Math.max(0, returnEntry.endMin - state.dayEnd) : 0,
    },
  };
}

export default forwardSimulate;
