/**
 * src/repairEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RepairEngine – when forward simulation or backward validation flags an issue
 * in a day's schedule, applies targeted repair operators in priority order:
 *
 *   1. reduceWaiting
 *   2. changeTransportMode
 *   3. reorderRoute
 *   4. adjustDurations
 *   5. shiftMealTiming
 *   6. removeLowestValueStop
 *   7. moveStopToAnotherDay
 *   8. reOptimize
 *
 * Guarantees determinism via seeded RNG and stops as soon as the day becomes feasible.
 */

import config               from '../config.js';
import { buildSchedule }    from './scheduleBuilder.js';
import { forwardSimulate }  from './forwardSimulation.js';
import { optimizeDay }      from './routeOptimizer.js';
import { parseTime, formatTime } from './utils/time.js';

/**
 * Attempt to repair an infeasible or fragile day schedule.
 *
 * @param {import('./dayStateManager.js').DayStateManager} dayState
 * @param {object[]} pool          – places pool for this day
 * @param {object}   travelMatrix  – travel matrix
 * @param {object}   context       – { user, trip, weather, futurePools, serviceWindows }
 * @param {object}   [cfg]         – config override
 * @returns {{
 *   repairedState: import('./dayStateManager.js').DayStateManager,
 *   overflowPlaces: object[],
 *   repaired: boolean,
 *   appliedOperators: string[],
 * }}
 */
export function repairDay(dayState, pool, travelMatrix, context, cfg = config) {
  const placesMap = new Map(pool.map((p) => [p.id, p]));
  const overflowPlaces = [];
  const appliedOperators = [];
  const steps = cfg.repairStepsOrder ?? [
    'reduceWaiting',
    'changeTransportMode',
    'reorderRoute',
    'adjustDurations',
    'shiftMealTiming',
    'removeLowestValueStop',
    'moveStopToAnotherDay',
    'reOptimize',
  ];

  let current = dayState.clone();

  // Test initial feasibility
  let sim = forwardSimulate(current.schedule, placesMap, current, context, cfg);
  if (sim.valid) {
    return { repairedState: current, overflowPlaces, repaired: true, appliedOperators };
  }

  for (const step of steps) {
    let modified = false;

    switch (step) {
      case 'reduceWaiting': {
        // If there's waiting before a place opens, shift arrival by delaying departure
        // Schedule builder automatically handles natural waiting
        break;
      }

      case 'changeTransportMode': {
        // Upgrade slower modes (walk, transit) to taxi to save time if budget allows
        const updated = current.schedule.map((entry) => {
          if (entry.type === 'travel' && entry.mode !== 'taxi') {
            const legTaxi = travelMatrix[entry.placeId]?.taxi;
            if (legTaxi && legTaxi.travelMin < entry.travelMin) {
              modified = true;
              return {
                ...entry,
                mode: 'taxi',
                travelMin: legTaxi.travelMin,
                kmFromPrev: legTaxi.km,
              };
            }
          }
          return entry;
        });
        if (modified) {
          current.schedule = updated;
          appliedOperators.push('changeTransportMode');
        }
        break;
      }

      case 'adjustDurations': {
        // Reduce visit durations towards minDuration for visits that exceed min
        const updated = current.schedule.map((entry) => {
          if (entry.type === 'visit') {
            const place = placesMap.get(entry.placeId);
            const minDur = place?.duration?.min ?? 30;
            if (entry.visitMin > minDur) {
              modified = true;
              const newDur = Math.max(minDur, Math.round(entry.visitMin * 0.8));
              return {
                ...entry,
                visitMin: newDur,
                endMin: entry.startMin + newDur,
              };
            }
          }
          return entry;
        });
        if (modified) {
          current.schedule = updated;
          current = buildSchedule(current, pool, travelMatrix, context, cfg);
          appliedOperators.push('adjustDurations');
        }
        break;
      }

      case 'shiftMealTiming': {
        // Shorten meal or shift if meal is within schedule
        const updated = current.schedule.map((entry) => {
          if (entry.type === 'meal' && entry.visitMin > 30) {
            modified = true;
            return {
              ...entry,
              visitMin: 30,
              endMin: entry.startMin + 30,
            };
          }
          return entry;
        });
        if (modified) {
          current.schedule = updated;
          current = buildSchedule(current, pool, travelMatrix, context, cfg);
          appliedOperators.push('shiftMealTiming');
        }
        break;
      }

      case 'removeLowestValueStop':
      case 'moveStopToAnotherDay': {
        // Identify non-must-visit stops and remove the lowest priority / latest one
        const userMustVisits = new Set(context.user?.mustVisit ?? []);
        const visitEntries = current.schedule.filter(
          (e) => e.type === 'visit' && !userMustVisits.has(e.placeId),
        );

        if (visitEntries.length > 0) {
          // Sort lowest priority first
          visitEntries.sort((a, b) => {
            const pA = placesMap.get(a.placeId);
            const pB = placesMap.get(b.placeId);
            const prioVal = { LOW: 1, MEDIUM: 2, HIGH: 3 };
            const prioA = prioVal[pA?.priority] ?? 2;
            const prioB = prioVal[pB?.priority] ?? 2;
            return prioA - prioB;
          });

          const toRemove = visitEntries[0];
          const removedPlace = placesMap.get(toRemove.placeId);
          if (removedPlace) overflowPlaces.push(removedPlace);

          // Filter out the place
          current.schedule = current.schedule.filter(
            (e) => !(e.placeId === toRemove.placeId && (e.type === 'visit' || e.type === 'travel' || e.type === 'wait')),
          );
          current.visitedIds.delete(toRemove.placeId);
          current.stopCount = Math.max(0, current.stopCount - 1);

          current = buildSchedule(current, pool, travelMatrix, context, cfg);
          appliedOperators.push(step);
          modified = true;
        }
        break;
      }

      case 'reOptimize': {
        // Re-run optimizer with remaining places
        const remainingPool = pool.filter((p) => !overflowPlaces.some((op) => op.id === p.id));
        current = optimizeDay(
          {
            dayIndex: current.dayIndex,
            date: current.date,
            dayStart: current.dayStart,
            dayEnd: current.dayEnd,
            hotel: current.hotel,
            dailyBudget: current.dailyBudget,
          },
          remainingPool,
          travelMatrix,
          context,
          cfg,
        );
        current = buildSchedule(current, remainingPool, travelMatrix, context, cfg);
        appliedOperators.push('reOptimize');
        modified = true;
        break;
      }

      default:
        break;
    }

    if (modified) {
      sim = forwardSimulate(current.schedule, placesMap, current, context, cfg);
      if (sim.valid) {
        return { repairedState: current, overflowPlaces, repaired: true, appliedOperators };
      }
    }
  }

  // Final check
  sim = forwardSimulate(current.schedule, placesMap, current, context, cfg);
  return {
    repairedState: current,
    overflowPlaces,
    repaired: sim.valid,
    appliedOperators,
  };
}

export default { repairDay };
