/**
 * src/output.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OutputFormatter – formats the optimized multi-day trip plan into the final
 * structured JSON response, including:
 *   - Overall confidence score and breakdown
 *   - Per-day schedules with formatted times and human-readable stats
 *   - Financial summary (totalBudget, spent, remaining)
 *   - Diagnostics (fragile stops, slacks, warnings)
 */

import config             from '../config.js';
import { formatTime, clamp01 } from './utils/time.js';

/**
 * Compute the confidence score according to the KroTravel specification.
 *
 * @param {object} params
 * @param {number} params.scheduledMustVisits
 * @param {number} params.totalMustVisits
 * @param {number} params.meanSlackMin
 * @param {number} params.fragileStopCount
 * @param {number} params.totalStops
 * @param {number} [params.dataAgeDays=0]
 * @param {object} [cfg]
 * @returns {{
 *   overallConfidence: number,
 *   breakdown: {
 *     mustVisitRatio: number,
 *     meanSlackScore: number,
 *     fragileStopRatio: number,
 *     freshnessScore: number,
 *   }
 * }}
 */
export function computeConfidence({
  scheduledMustVisits,
  totalMustVisits,
  meanSlackMin,
  fragileStopCount,
  totalStops,
  dataAgeDays = 0,
}, cfg = config) {
  const confCfg = cfg.confidence ?? {
    mustVisitWeight: 0.35,
    meanSlackWeight: 0.30,
    fragileStopWeight: 0.20,
    freshnessWeight: 0.15,
    freshnessMaxAgeDays: 7,
  };

  const mustVisitRatio = totalMustVisits > 0
    ? scheduledMustVisits / totalMustVisits
    : 1.0;

  const meanSlackScore = clamp01(meanSlackMin / 60);

  const fragileStopRatio = totalStops > 0
    ? Math.max(0, 1.0 - (fragileStopCount / totalStops))
    : 1.0;

  const freshnessScore = clamp01(1.0 - (dataAgeDays / confCfg.freshnessMaxAgeDays));

  const overall =
    confCfg.mustVisitWeight   * mustVisitRatio +
    confCfg.meanSlackWeight   * meanSlackScore +
    confCfg.fragileStopWeight * fragileStopRatio +
    confCfg.freshnessWeight   * freshnessScore;

  return {
    overallConfidence: Math.round(overall * 1000) / 1000,
    breakdown: {
      mustVisitRatio:    Math.round(mustVisitRatio * 1000) / 1000,
      meanSlackScore:    Math.round(meanSlackScore * 1000) / 1000,
      fragileStopRatio:  Math.round(fragileStopRatio * 1000) / 1000,
      freshnessScore:    Math.round(freshnessScore * 1000) / 1000,
    },
  };
}

/**
 * Format the multi-day trip plan into the final JSON output object.
 *
 * @param {object} params
 * @param {string} params.tripId
 * @param {import('./dayStateManager.js').DayStateManager[]} params.dayStates
 * @param {object[]} params.dayValidations   – backwardValidation results per day
 * @param {object} params.globalValidation   – result of validateGlobalTrip
 * @param {object} params.user
 * @param {object} params.trip
 * @param {Map<string,object>} params.placesMap
 * @param {object[]} [params.unassignedPlaces=[]]
 * @param {string[]} [params.warnings=[]]
 * @param {object} [cfg]
 * @returns {object} Final JSON-serializable output
 */
export function formatOutput({
  tripId,
  dayStates,
  dayValidations = [],
  globalValidation,
  user,
  trip,
  placesMap,
  unassignedPlaces = [],
  warnings = [],
}, cfg = config) {
  let allSlacks = [];
  let totalFragile = 0;
  let totalStops = 0;
  let totalSpent = 0;
  let totalKm = 0;

  const daysFormatted = dayStates.map((dayState, idx) => {
    const val = dayValidations[idx] ?? {};
    const slacks = val.slacks ?? [];
    const fragileStops = val.fragileStops ?? [];

    allSlacks.push(...slacks.map((s) => s.slackMin));
    totalFragile += fragileStops.length;

    let dayKm = 0;
    const scheduleFormatted = dayState.schedule.map((entry) => {
      dayKm += entry.kmFromPrev ?? 0;
      const place = placesMap?.get?.(entry.placeId);

      return {
        type: entry.type,
        placeId: entry.placeId,
        placeName: place?.name ?? (entry.type === 'hotel' || entry.type === 'return' ? 'Hotel' : entry.placeId),
        mode: entry.mode,
        startTime: formatTime(entry.startMin),
        endTime: formatTime(entry.endMin),
        startMin: entry.startMin,
        endMin: entry.endMin,
        durationMin: entry.visitMin,
        travelMin: entry.travelMin,
        waitMin: entry.waitMin,
        kmFromPrev: entry.kmFromPrev ?? 0,
        costTransport: entry.costTransport ?? 0,
        costEntry: entry.costEntry ?? 0,
        totalCost: (entry.costTransport ?? 0) + (entry.costEntry ?? 0),
      };
    });

    const dayVisits = dayState.schedule.filter((e) => e.type === 'visit');
    totalStops += dayVisits.length;
    totalSpent += dayState.budgetSpent;
    totalKm += dayKm;

    const dayMeanSlack = slacks.length > 0
      ? slacks.reduce((sum, s) => sum + s.slackMin, 0) / slacks.length
      : 0;

    return {
      dayIndex: dayState.dayIndex,
      date: dayState.date,
      dayStart: formatTime(dayState.dayStart),
      dayEnd: formatTime(dayState.dayEnd),
      hotel: dayState.hotel,
      stats: {
        stopsCount: dayVisits.length,
        budgetSpent: dayState.budgetSpent,
        totalKm: Math.round(dayKm * 10) / 10,
        meanSlackMin: Math.round(dayMeanSlack),
        fragileStops,
      },
      schedule: scheduleFormatted,
    };
  });

  const meanTripSlack = allSlacks.length > 0
    ? allSlacks.reduce((sum, s) => sum + s, 0) / allSlacks.length
    : 0;

  const scheduledMustVisits = globalValidation?.stats?.scheduledMustVisits?.length ?? 0;
  const totalMustVisits = user?.mustVisit?.length ?? 0;

  const conf = computeConfidence({
    scheduledMustVisits,
    totalMustVisits,
    meanSlackMin: meanTripSlack,
    fragileStopCount: totalFragile,
    totalStops,
    dataAgeDays: 0,
  }, cfg);

  const status = globalValidation?.valid
    ? 'SUCCESS'
    : (totalStops > 0 ? 'PARTIAL' : 'INFEASIBLE');

  return {
    tripId: tripId ?? 'krotravel_trip',
    status,
    currency: cfg.currency ?? 'INR',
    summary: {
      totalDays: dayStates.length,
      totalStops,
      totalKm: Math.round(totalKm * 10) / 10,
      totalBudget: trip.totalBudget,
      totalSpent,
      budgetRemaining: Math.max(0, trip.totalBudget - totalSpent),
      overallConfidence: conf.overallConfidence,
      confidenceBreakdown: conf.breakdown,
    },
    days: daysFormatted,
    unassignedPlaces: unassignedPlaces.map((p) => ({ id: p.id, name: p.name, category: p.category })),
    warnings: [...(warnings ?? []), ...(globalValidation?.issues ?? [])],
  };
}

export default { computeConfidence, formatOutput };
