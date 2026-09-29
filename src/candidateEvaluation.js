/**
 * src/candidateEvaluation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CandidateEvaluation – computes the weighted composite B-score for a
 * feasible candidate, combining B1-B11 with config weights.
 *
 * Route objective:
 *   Score(candidate) = Σ weights.Bk * Bk_score   for k = 1..11
 *
 * B4 and B10 need geometric context (prev location, centroid, visited).
 * B11 needs the remaining pool + future-day pools.
 */

import config           from '../config.js';
import { scoreInterest }         from './scoring/b1_interest.js';
import { scorePriority }         from './scoring/b2_priority.js';
import { scoreDuration }         from './scoring/b3_duration.js';
import { scoreTravelEfficiency } from './scoring/b4_travelEfficiency.js';
import { scoreWaiting }          from './scoring/b5_waiting.js';
import { scoreMeal }             from './scoring/b6_meal.js';
import { scoreCost }             from './scoring/b7_cost.js';
import { scoreTransport }        from './scoring/b8_transport.js';
import { scoreWeather }          from './scoring/b9_weather.js';
import { scoreContinuity }       from './scoring/b10_continuity.js';
import { placeValue, scoreFutureValue } from './scoring/b11_futureValue.js';
import { haversineKm }           from './utils/geo.js';

/**
 * evaluateCandidate(candidate, evalCtx, cfg?)
 *
 * @param {import('./feasibilityFilter.js').FeasibleCandidate} candidate
 * @param {object} evalCtx
 *   @param {object}    state           – DayStateManager (current time, budget, visited)
 *   @param {object}    user            – normalized user
 *   @param {object}    trip            – normalized trip
 *   @param {object}    weather         – { condition, tempC, rain, wind }
 *   @param {{ lat,lng }} prevLocation  – location before current position (for B10)
 *   @param {{ lat,lng }} currentLoc    – current position
 *   @param {{ lat,lng }} dayCentroid   – mean lat/lng of day pool
 *   @param {object[]}  remainingPool   – pool places not yet scheduled today
 *   @param {object[]}  futurePools     – places on future days (flat array with V_i)
 *   @param {Map}       B1cache         – cache: placeId → {score}
 *   @param {Map}       B2cache         – cache: placeId → {score}
 * @param {object} [cfg] – config override
 * @returns {{ totalScore: number, breakdown: object }}
 */
export function evaluateCandidate(candidate, evalCtx, cfg = config) {
  const W  = cfg.weights;
  const { place, mode, travelMin, km, waitMin, visitMin, directness, transfers,
          transportCost, entryCost, startMin } = candidate;
  const { state, user, trip, weather, prevLocation, currentLoc, dayCentroid,
          remainingPool = [], futurePools = [], B1cache = new Map(), B2cache = new Map() } = evalCtx;

  // ── B1 User Interest ────────────────────────────────────────────────────────
  const b1 = B1cache.get(place.id) ?? scoreInterest(place, user, cfg.b1);
  if (!B1cache.has(place.id)) B1cache.set(place.id, b1);

  // ── B2 Priority ─────────────────────────────────────────────────────────────
  const b2 = B2cache.get(place.id) ?? scorePriority(place, cfg.b2);
  if (!B2cache.has(place.id)) B2cache.set(place.id, b2);

  // ── B3 Duration ─────────────────────────────────────────────────────────────
  const b3 = scoreDuration(visitMin, place.duration ?? { min: 30, ideal: 60, max: 120 });

  // ── B10 Continuity (needed by B4 as C_j) ────────────────────────────────────
  const nextLoc = { lat: place.lat, lng: place.lng };
  // Backtracking: distances from each visited stop to next candidate
  const visitedLocs = [...state.visitedIds].map((id) => {
    // Attempt to find location in remainingPool or futurePools by id
    const p = remainingPool.find((x) => x.id === id)
           ?? futurePools.find((x) => x.place?.id === id)?.place;
    return p ? haversineKm(p.lat, p.lng, nextLoc.lat, nextLoc.lng) : null;
  }).filter((d) => d !== null);
  const currentKmToNext = currentLoc
    ? haversineKm(currentLoc.lat, currentLoc.lng, nextLoc.lat, nextLoc.lng)
    : km;

  const b10 = scoreContinuity({
    prev:         prevLocation,
    current:      currentLoc ?? { lat: state.hotel.lat, lng: state.hotel.lng },
    next:         nextLoc,
    centroid:     dayCentroid,
    visitedDist:  visitedLocs,
    currentDist:  currentKmToNext,
  }, cfg.b10);

  // ── B4 Travel Efficiency ────────────────────────────────────────────────────
  const b4 = scoreTravelEfficiency({
    travelMin, km, visitMin,
    visitedKmToNext: visitedLocs,
    currentKmToNext,
    C_j: b10.score,
  }, cfg.b4);

  // ── B5 Waiting ──────────────────────────────────────────────────────────────
  const b5 = scoreWaiting({ openingWaitMin: waitMin }, user, cfg.b5);

  // ── B6 Meal (not applicable for regular visit – 0 contribution) ─────────────
  // Meal scoring is done separately when inserting a meal block.
  const b6 = { score: 0 };

  // ── B7 Cost Preference ──────────────────────────────────────────────────────
  const totalDayCost = state.budgetSpent + transportCost + entryCost;
  const dailyBudget  = state.dailyBudget === Infinity
    ? (trip?.totalBudget ?? 50000) / Math.max(1, trip?.nDays ?? 1)
    : state.dailyBudget;
  const b7 = scoreCost({ C_actual: totalDayCost, dailyBudget, user }, cfg.b7);

  // ── B8 Transport Preference ─────────────────────────────────────────────────
  const b8 = scoreTransport({ mode, transfers, directness }, user, cfg.b8);

  // ── B9 Weather ──────────────────────────────────────────────────────────────
  const b9 = scoreWeather(weather ?? { condition: 'clear', tempC: 28 }, place, user, cfg.b9);

  // ── B11 Future Value ────────────────────────────────────────────────────────
  const remainingWithV = remainingPool
    .filter((p) => p.id !== place.id)
    .map((p) => ({
      place: p,
      V_i: placeValue(
        (B1cache.get(p.id) ?? scoreInterest(p, user, cfg.b1)).score,
        (B2cache.get(p.id) ?? scorePriority(p, cfg.b2)).score,
        cfg.b11,
      ),
    }));

  const b11 = scoreFutureValue({
    remainingToday: remainingWithV,
    futureDays:     futurePools,
    candidateLoc:   nextLoc,
  }, cfg.b11);

  // ── Composite score ─────────────────────────────────────────────────────────
  const totalScore =
    W.B1  * b1.score  +
    W.B2  * b2.score  +
    W.B3  * b3.score  +
    W.B4  * b4.score  +
    W.B5  * b5.score  +
    W.B6  * b6.score  +
    W.B7  * b7.score  +
    W.B8  * b8.score  +
    W.B9  * b9.score  +
    W.B10 * b10.score +
    W.B11 * b11.score;

  return {
    totalScore: Math.min(1, Math.max(0, totalScore)),
    breakdown: {
      B1: b1.score, B2: b2.score, B3: b3.score, B4: b4.score,
      B5: b5.score, B6: b6.score, B7: b7.score, B8: b8.score,
      B9: b9.score, B10: b10.score, B11: b11.score,
    },
  };
}

export default evaluateCandidate;
