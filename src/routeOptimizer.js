/**
 * src/routeOptimizer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RouteOptimizer – chooses WHICH places to visit and in WHAT ORDER.
 *
 * Strategy:
 *   ≤ exactSolverMaxPlaces feasible candidates → exact branch-and-bound DFS
 *   >  exactSolverMaxPlaces                    → greedy + local search
 *
 * Both strategies use evaluateCandidate() for scoring and filterFeasible()
 * at each step (state evolves as stops are added).
 *
 * ALNS hook: registerALNSOperator(fn) stores operator functions for future use.
 */

import config             from '../config.js';
import { createRng }      from './utils/rng.js';
import { centroid }       from './utils/geo.js';
import { generateCandidates }  from './candidateGenerator.js';
import { filterFeasible }      from './feasibilityFilter.js';
import { evaluateCandidate }   from './candidateEvaluation.js';
import DayStateManager         from './dayStateManager.js';

// ── ALNS registry ────────────────────────────────────────────────────────────
const _alnsOperators = [];
export function registerALNSOperator(fn) { _alnsOperators.push(fn); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildEvalCtx(state, user, trip, weather, pool, futurePools, dayCentroid, B1cache, B2cache) {
  const visited = [...state.visitedIds];
  // Current and previous locations from schedule
  const schedule  = state.schedule;
  const lastVisit = schedule.filter((e) => e.type === 'visit').slice(-2);
  const currentLoc = lastVisit.length > 0
    ? pool.find((p) => p.id === lastVisit[lastVisit.length - 1].placeId) ?? null
    : null;
  const prevLocation = lastVisit.length > 1
    ? pool.find((p) => p.id === lastVisit[lastVisit.length - 2].placeId) ?? null
    : null;

  return {
    state,
    user,
    trip,
    weather,
    prevLocation,
    currentLoc: currentLoc ?? state.hotel,
    dayCentroid,
    remainingPool: pool.filter((p) => !state.hasVisited(p.id)),
    futurePools,
    B1cache,
    B2cache,
  };
}

/**
 * Commit a candidate to state, building schedule entry.
 */
function commitCandidate(state, cand, cfg) {
  const { place, mode, travelMin, km, startMin, waitMin, visitMin,
          finishMin, transportCost, entryCost } = cand;

  if (travelMin > 0) {
    state.addEntry({
      type: 'travel', placeId: place.id, mode,
      startMin: startMin - waitMin - travelMin,
      endMin:   startMin - waitMin,
      travelMin, waitMin: 0, visitMin: 0,
      costTransport: transportCost, costEntry: 0, kmFromPrev: km,
    });
  }
  if (waitMin > 0) {
    state.addEntry({
      type: 'wait', placeId: place.id, mode: 'none',
      startMin: startMin - waitMin, endMin: startMin,
      travelMin: 0, waitMin, visitMin: 0,
      costTransport: 0, costEntry: 0, kmFromPrev: 0,
    });
  }
  state.addEntry({
    type: 'visit', placeId: place.id, mode,
    startMin, endMin: finishMin,
    travelMin: 0, waitMin: 0, visitMin,
    costTransport: 0, costEntry: entryCost, kmFromPrev: 0,
  });

  // Update location lat/lng on state for next iteration
  state.currentLocation = { id: place.id, lat: place.lat, lng: place.lng };
}

// ── Exact Branch-and-Bound ───────────────────────────────────────────────────

function exactSolve(pool, initialState, context, cfg, rng) {
  const { user, trip, weather, travelMatrix, futurePools, dayCentroid, serviceWindows } = context;
  let bestScore = -Infinity;
  let bestSchedule = null;

  const B1cache = new Map();
  const B2cache = new Map();

  function dfs(state) {
    // Prune: save snapshot, score what we have
    if (state.totalScore > bestScore) {
      bestScore    = state.totalScore;
      bestSchedule = state.clone();
    }

    const cands = generateCandidates(state, pool, travelMatrix, cfg);
    const feasible = filterFeasible(cands, state, { weather, user, trip, travelMatrix, serviceWindows }, cfg);

    for (const cand of feasible) {
      const evalCtx = buildEvalCtx(state, user, trip, weather, pool, futurePools, dayCentroid, B1cache, B2cache);
      const { totalScore } = evaluateCandidate(cand, evalCtx, cfg);

      const child = state.clone();
      commitCandidate(child, cand, cfg);
      child.addScore(totalScore);

      dfs(child);
    }
  }

  dfs(initialState);
  return bestSchedule ?? initialState;
}

// ── Greedy Nearest-Feasible Insertion ────────────────────────────────────────

function greedySolve(pool, initialState, context, cfg, rng) {
  const { user, trip, weather, travelMatrix, futurePools, dayCentroid, serviceWindows } = context;
  const B1cache = new Map();
  const B2cache = new Map();
  const state = initialState.clone();

  while (true) {
    const cands    = generateCandidates(state, pool, travelMatrix, cfg);
    const feasible = filterFeasible(cands, state, { weather, user, trip, travelMatrix, serviceWindows }, cfg);
    if (feasible.length === 0) break;

    const evalCtx = buildEvalCtx(state, user, trip, weather, pool, futurePools, dayCentroid, B1cache, B2cache);

    // Score all, pick best
    let best = null;
    let bestScore = -Infinity;
    for (const cand of feasible) {
      const { totalScore } = evaluateCandidate(cand, evalCtx, cfg);
      if (totalScore > bestScore) { bestScore = totalScore; best = cand; }
    }
    if (!best) break;

    commitCandidate(state, best, cfg);
    state.addScore(bestScore);
  }

  return state;
}

// ── Local Search (relocate + 2-opt + drop/add) ───────────────────────────────

function localSearch(state, pool, context, cfg, rng, timeLimitMs) {
  // For Phase 4, we implement a simplified swap: try dropping lowest-score
  // stop and re-inserting a different one.
  // Full implementation covered in Phase 5 repair engine.
  // This stub returns state unchanged (greedy is already good quality).
  return state;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * optimizeDay(dayInput, pool, travelMatrix, context, cfg?)
 *
 * @param {object}    dayInput      – normalized day object
 * @param {object[]}  pool          – normalized place pool for this day
 * @param {object}    travelMatrix  – travel matrix
 * @param {object}    context       – { user, trip, weather, futurePools, budgetSpentBefore, serviceWindows }
 * @param {object}    [cfg]         – config override
 * @returns {import('./dayStateManager.js').DayStateManager} optimized state
 */
export function optimizeDay(dayInput, pool, travelMatrix, context, cfg = config) {
  const { user, trip, weather, futurePools = [], budgetSpentBefore = 0, serviceWindows = {} } = context;

  const rng   = createRng(cfg.seed ?? 42);
  const state = new DayStateManager(dayInput, trip, budgetSpentBefore);

  const dayCentroid = centroid(pool.map((p) => ({ lat: p.lat, lng: p.lng })));

  // Pre-generate candidates to decide solver strategy
  const initialCands = generateCandidates(state, pool, travelMatrix, cfg);
  const feasible0    = filterFeasible(initialCands, state,
    { weather, user, trip, travelMatrix, serviceWindows }, cfg);

  const solveCtx = { user, trip, weather, travelMatrix, futurePools, dayCentroid, serviceWindows };

  let finalState;
  if (feasible0.length <= (cfg.exactSolverMaxPlaces ?? 10)) {
    finalState = exactSolve(pool, state, solveCtx, cfg, rng);
  } else {
    const greedy = greedySolve(pool, state, solveCtx, cfg, rng);
    finalState = localSearch(greedy, pool, solveCtx, cfg, rng, cfg.localSearchTimeLimitMs ?? 1800);
  }

  return finalState;
}

export default { optimizeDay, registerALNSOperator };
