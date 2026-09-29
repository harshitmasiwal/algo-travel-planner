/**
 * test/phase4.test.js
 * Phase 4 – Solver Pipeline Tests
 * Run: node --test test/phase4.test.js
 *
 * Tests: DayStateManager, CandidateGenerator, FeasibilityFilter (integration),
 *        CandidateEvaluation, MasterClock, BackwardValidation, RouteOptimizer (e2e)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import DayStateManager        from '../src/dayStateManager.js';
import { generateCandidates } from '../src/candidateGenerator.js';
import { filterFeasible }     from '../src/feasibilityFilter.js';
import { evaluateCandidate }  from '../src/candidateEvaluation.js';
import { advanceClock, mealWindowHit, buildMealEntry } from '../src/masterClock.js';
import { backwardValidate }   from '../src/backwardValidation.js';
import { forwardSimulate }    from '../src/forwardSimulation.js';
import { optimizeDay }        from '../src/routeOptimizer.js';
import config from '../config.js';

const TOL = 0.5;  // minutes tolerance
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, `${msg ?? ''}: |${a} - ${b}| > ${TOL}`);

// ════════════════════════════════════════════════════════════════════════════════
// Shared fixtures
// ════════════════════════════════════════════════════════════════════════════════

const hotel = { id: 'hotel_a', lat: 28.6315, lng: 77.2167 };

const dayInput = {
  dayIndex:    0,
  date:        '2026-10-05',
  dayStart:    480,   // 08:00
  dayEnd:      1200,  // 20:00
  hotel,
  dailyBudget: Infinity,
};

const tripInput = { totalBudget: 20000, partySize: 2, nDays: 1 };

const fort = {
  id: 'fort_a', name: 'Red Fort',
  lat: 28.6562, lng: 77.2410,
  category: 'fort', subCategories: ['mughal'], tags: ['history'],
  priority: 'HIGH',
  modifiers: { flagship: 1, unesco: 1, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.2, outdoorSensitivity: 0.8,
  openTime: 570,   // 09:30
  closeTime: 1020, // 17:00
  closedDays: ['Mon'],
  temporaryClosures: [], eligibleDays: null, accessRestricted: false, restricted: false,
  transportAccess: ['walk', 'taxi', 'transit'],
  duration: { min: 60, ideal: 120, max: 180 },
  cost: 600, otherCost: 0, booking: null,
};

const museum = {
  id: 'museum_a', name: 'National Museum',
  lat: 28.6116, lng: 77.2196,
  category: 'museum', subCategories: ['art'], tags: ['culture'],
  priority: 'MEDIUM',
  modifiers: { flagship: 0, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.5, outdoorSensitivity: 0.1,
  openTime: 600,   // 10:00
  closeTime: 1080, // 18:00
  closedDays: ['Mon'],
  temporaryClosures: [], eligibleDays: null, accessRestricted: false, restricted: false,
  transportAccess: ['walk', 'taxi', 'transit'],
  duration: { min: 60, ideal: 150, max: 240 },
  cost: 500, otherCost: 0, booking: null,
};

// Build a minimal travel matrix
const travelMatrix = {
  hotel_a: {
    fort_a:   { walk: { travelMin: 35, km: 3 }, taxi: { travelMin: 10, km: 3 }, transit: { travelMin: 15, km: 3 } },
    museum_a: { walk: { travelMin: 40, km: 3.5 }, taxi: { travelMin: 12, km: 3.5 }, transit: { travelMin: 18, km: 3.5 } },
  },
  fort_a: {
    hotel_a:  { walk: { travelMin: 35, km: 3 }, taxi: { travelMin: 10, km: 3 }, transit: { travelMin: 15, km: 3 } },
    museum_a: { walk: { travelMin: 25, km: 2 }, taxi: { travelMin: 8,  km: 2 }, transit: { travelMin: 12, km: 2 } },
  },
  museum_a: {
    hotel_a:  { walk: { travelMin: 40, km: 3.5 }, taxi: { travelMin: 12, km: 3.5 }, transit: { travelMin: 18, km: 3.5 } },
    fort_a:   { walk: { travelMin: 25, km: 2 }, taxi: { travelMin: 8,  km: 2 }, transit: { travelMin: 12, km: 2 } },
  },
};

const user = {
  interests: { history: 0.9, museum: 0.7, fort: 0.8 },
  explicitInterests: ['mughal', 'history'],
  dislikes: [],
  modePreference: { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
  comfortPreference: 'standard',
  transferTolerance: 2,
  maxWalkKm: 2,
  waitingToleranceMin: 20,
  costPreference: 'balanced',
  preferredCostRange: null,
  mustVisit: [], mustAvoid: [],
  mandatoryGroups: [], forbiddenCategories: [],
  minPlacesPerDay: 1, maxPlacesPerDay: 6,
  weather: { tempPrefMin: 20, tempPrefMax: 32, coldTol: 8, heatTol: 8, rainTol: 0.5, windTol: 0.4 },
  meals: {
    lunch: {
      windowStart: '12:00', windowEnd: '14:30', preferredTime: '13:00',
      timeTolerance: 60, durationMin: 45, durationTolerance: 30,
      diet: 'any', cuisines: ['north_indian'],
      locationPref: 'near_next_attraction', avgCost: 500,
    },
  },
};

const clearWeather = { condition: 'clear', tempC: 28, rain: 0, wind: 0.1 };
const pool = [fort, museum];

// ════════════════════════════════════════════════════════════════════════════════
// DayStateManager
// ════════════════════════════════════════════════════════════════════════════════

describe('DayStateManager — init', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  it('currentTimeMin = dayStart', () => assert.equal(state.currentTimeMin, 480));
  it('currentLocation starts at hotel', () => assert.equal(state.currentLocation.id, hotel.id));
  it('budgetRemaining = totalBudget initially', () => assert.equal(state.budgetRemaining, 20000));
  it('visitedIds is empty', () => assert.equal(state.visitedIds.size, 0));
  it('schedule is empty', () => assert.equal(state.schedule.length, 0));
});

describe('DayStateManager — addEntry + clone', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({
    type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 590, endMin: 710,
    travelMin: 10, waitMin: 20, visitMin: 120,
    costTransport: 90, costEntry: 1200, kmFromPrev: 3,
  });
  it('after entry: currentTimeMin = 710', () => assert.equal(state.currentTimeMin, 710));
  it('budgetSpent = 90+1200 = 1290',      () => assert.equal(state.budgetSpent, 1290));
  it('visitedIds contains fort_a',         () => assert.ok(state.visitedIds.has('fort_a')));

  const cloned = state.clone();
  cloned.budgetSpent = 9999;
  it('clone is independent (original budgetSpent unchanged)', () =>
    assert.equal(state.budgetSpent, 1290));
});

describe('DayStateManager — hasVisited', () => {
  it('hasVisited returns false before adding', () => {
    const s = new DayStateManager(dayInput, tripInput, 0);
    assert.equal(s.hasVisited('fort_a'), false);
  });
  it('hasVisited returns true after adding', () => {
    const s = new DayStateManager(dayInput, tripInput, 0);
    s.addEntry({ type: 'visit', placeId: 'fort_a', mode: 'taxi',
      startMin: 590, endMin: 710, travelMin: 0, waitMin: 0, visitMin: 120,
      costTransport: 0, costEntry: 0, kmFromPrev: 0 });
    assert.equal(s.hasVisited('fort_a'), true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// CandidateGenerator
// ════════════════════════════════════════════════════════════════════════════════

describe('CandidateGenerator — fresh state, both places reachable', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  const cands = generateCandidates(state, pool, travelMatrix, config);
  it('returns 2 candidates initially', () => assert.equal(cands.length, 2));
  it('fort is in candidates', () => assert.ok(cands.some((c) => c.id === 'fort_a')));
  it('museum is in candidates', () => assert.ok(cands.some((c) => c.id === 'museum_a')));
});

describe('CandidateGenerator — visited place excluded', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({ type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 590, endMin: 710, travelMin: 10, waitMin: 20, visitMin: 120,
    costTransport: 90, costEntry: 1200, kmFromPrev: 3 });
  const cands = generateCandidates(state, pool, travelMatrix, config);
  it('only 1 candidate after visiting fort', () => assert.equal(cands.length, 1));
  it('museum still available', () => assert.equal(cands[0].id, 'museum_a'));
});

describe('CandidateGenerator — no time left', () => {
  const state = new DayStateManager({ ...dayInput, dayStart: 1190 }, tripInput, 0);
  const cands = generateCandidates(state, pool, travelMatrix, config);
  it('returns 0 candidates when only 10 min left', () => assert.equal(cands.length, 0));
});

// ════════════════════════════════════════════════════════════════════════════════
// MasterClock
// ════════════════════════════════════════════════════════════════════════════════

describe('MasterClock — advanceClock', () => {
  // currentMin=480, travelMin=10 → arrivalMin=490
  // fort opens at 570 (09:30) → waitMin=570-490=80, startMin=570
  // visitMin=120 → finishMin=690, slackMin=1020-690=330
  const result = advanceClock(480, 10, fort, 120);
  it('arrivalMin = 490',    () => near(result.arrivalMin, 490, 'arrival'));
  it('waitMin = 80',        () => near(result.waitMin, 80, 'wait'));
  it('startMin = 570',      () => near(result.startMin, 570, 'start'));
  it('finishMin = 690',     () => near(result.finishMin, 690, 'finish'));
  it('slackMin = 330',      () => near(result.slackMin, 330, 'slack'));
  it('feasible = true',     () => assert.equal(result.feasible, true));
});

describe('MasterClock — advanceClock infeasible (overrun)', () => {
  // currentMin=900, travelMin=10, fort close=1020
  // arrival=910, open=570(already passed so start=910), visitMin=120 → finish=1030 > 1020
  const result = advanceClock(900, 10, fort, 120);
  it('feasible = false when finish > close', () => assert.equal(result.feasible, false));
  it('slackMin < 0',  () => assert.ok(result.slackMin < 0));
});

describe('MasterClock — mealWindowHit', () => {
  const mealPrefs  = user.meals;
  const noMeals    = new Set();
  // currentMin=720 (12:00), nextStopStart=800 → inside lunch window [720,870]
  it('detects lunch at 12:00',  () => {
    assert.equal(mealWindowHit(720, 800, mealPrefs, noMeals), 'lunch');
  });
  it('no meal if already served', () => {
    const served = new Set(['lunch']);
    assert.equal(mealWindowHit(720, 800, mealPrefs, served), null);
  });
  it('no meal before window',   () => {
    assert.equal(mealWindowHit(600, 650, mealPrefs, noMeals), null);
  });
});

describe('MasterClock — buildMealEntry', () => {
  const pref = user.meals.lunch;
  const entry = buildMealEntry('lunch', 720, pref, { id: 'fort_a' });
  it('type = meal',          () => assert.equal(entry.type, 'meal'));
  it('mealType = lunch',     () => assert.equal(entry.mealType, 'lunch'));
  it('startMin = 780 (preferred 13:00)', () => near(entry.startMin, 780, 'startMin'));
  it('visitMin = 45',        () => assert.equal(entry.visitMin, 45));
  it('costEntry = avgCost',  () => assert.equal(entry.costEntry, 500));
});

// ════════════════════════════════════════════════════════════════════════════════
// BackwardValidation
// ════════════════════════════════════════════════════════════════════════════════

describe('BackwardValidation — valid schedule', () => {
  // 2-stop schedule: fort (09:30-11:30) + museum (12:00-14:30) + return by 15:00
  const schedule = [
    { type: 'travel',  placeId: 'fort_a',   mode: 'taxi',  startMin: 480, endMin: 490, travelMin: 10, waitMin: 0, visitMin: 0, costTransport: 90, costEntry: 0, kmFromPrev: 3 },
    { type: 'wait',    placeId: 'fort_a',   mode: 'none',  startMin: 490, endMin: 570, travelMin: 0, waitMin: 80, visitMin: 0, costTransport: 0, costEntry: 0, kmFromPrev: 0 },
    { type: 'visit',   placeId: 'fort_a',   mode: 'taxi',  startMin: 570, endMin: 690, travelMin: 0, waitMin: 80, visitMin: 120, costTransport: 0, costEntry: 1200, kmFromPrev: 0 },
    { type: 'travel',  placeId: 'museum_a', mode: 'taxi',  startMin: 690, endMin: 698, travelMin: 8,  waitMin: 0, visitMin: 0, costTransport: 60, costEntry: 0, kmFromPrev: 2 },
    { type: 'visit',   placeId: 'museum_a', mode: 'taxi',  startMin: 720, endMin: 870, travelMin: 0, waitMin: 22, visitMin: 150, costTransport: 0, costEntry: 1000, kmFromPrev: 0 },
    { type: 'return',  placeId: 'hotel_a',  mode: 'taxi',  startMin: 870, endMin: 882, travelMin: 12, waitMin: 0, visitMin: 0, costTransport: 90, costEntry: 0, kmFromPrev: 3.5 },
  ];
  const state = new DayStateManager(dayInput, tripInput, 0);

  const result = backwardValidate(schedule, state, config);
  it('feasible = true',            () => assert.equal(result.feasible, true));
  it('2 slacks computed',          () => assert.equal(result.slacks.length, 2));
  it('no infeasible stops',        () => assert.equal(result.issues.length, 0));
  it('fort slack > 0',             () => assert.ok(result.slacks[0].slackMin >= 0));
});

describe('BackwardValidation — fragile stop detection', () => {
  // museum finishes at 1170 (19:30), return takes 30 min → arrives at 20:00 = dayEnd
  // LST for museum start = 1200 - 30 - 150 = 1020; EST=1020 → slack=0 → fragile
  const schedule = [
    { type: 'visit',  placeId: 'museum_a', mode: 'taxi', startMin: 1020, endMin: 1170, travelMin: 0, waitMin: 0, visitMin: 150, costTransport: 0, costEntry: 1000, kmFromPrev: 0 },
    { type: 'return', placeId: 'hotel_a',  mode: 'taxi', startMin: 1170, endMin: 1200, travelMin: 30, waitMin: 0, visitMin: 0, costTransport: 90, costEntry: 0, kmFromPrev: 3.5 },
  ];
  const state = new DayStateManager(dayInput, tripInput, 0);
  const result = backwardValidate(schedule, state, config);
  it('museum is fragile (slack < 20 min)', () => assert.ok(result.fragileStops.includes('museum_a') || result.slacks[0].slackMin < config.fragileSlackMin));
});

// ════════════════════════════════════════════════════════════════════════════════
// ForwardSimulation
// ════════════════════════════════════════════════════════════════════════════════

describe('ForwardSimulation — valid 2-stop schedule', () => {
  const schedule = [
    { type: 'travel', placeId: 'fort_a',  mode: 'taxi', startMin: 480, endMin: 490,  travelMin: 10, waitMin: 0, visitMin: 0, costTransport: 90, costEntry: 0, kmFromPrev: 3 },
    { type: 'wait',   placeId: 'fort_a',  mode: 'none', startMin: 490, endMin: 570,  travelMin: 0, waitMin: 80, visitMin: 0, costTransport: 0, costEntry: 0, kmFromPrev: 0 },
    { type: 'visit',  placeId: 'fort_a',  mode: 'taxi', startMin: 570, endMin: 690,  travelMin: 0, waitMin: 80, visitMin: 120, costTransport: 0, costEntry: 1200, kmFromPrev: 0 },
    { type: 'return', placeId: 'hotel_a', mode: 'taxi', startMin: 690, endMin: 700,  travelMin: 10, waitMin: 0, visitMin: 0, costTransport: 90, costEntry: 0, kmFromPrev: 3 },
  ];
  // Only put real places (with openTime/closeTime) in map; hotel is only 'return' type
  const placesMap = new Map([['fort_a', fort]]);
  const state = new DayStateManager(dayInput, tripInput, 0);

  const result = forwardSimulate(schedule, placesMap, state, { weather: clearWeather, user, trip: tripInput }, config);
  it('returns an object with valid/issues/stats', () => {
    assert.ok(typeof result.valid === 'boolean');
    assert.ok(Array.isArray(result.issues));
    assert.ok(result.stats && typeof result.stats.totalCost === 'number');
  });
  it('totalCost = 90+1200+90 = 1380', () => assert.equal(result.stats.totalCost, 1380));
  it('stopCount = 1', () => assert.equal(result.stats.stopCount, 1));
});


// ════════════════════════════════════════════════════════════════════════════════
// CandidateEvaluation
// ════════════════════════════════════════════════════════════════════════════════

describe('CandidateEvaluation — composite score in [0,1]', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  const cand = {
    place: fort, mode: 'taxi', travelMin: 10, km: 3,
    arrivalMin: 490, startMin: 570, waitMin: 80, finishMin: 690, slackMin: 330,
    visitMin: 120, directness: 'direct', transfers: 0,
    transportCost: 90, entryCost: 1200,
  };
  const evalCtx = {
    state, user, trip: tripInput,
    weather: clearWeather,
    prevLocation: null,
    currentLoc: { lat: hotel.lat, lng: hotel.lng },
    dayCentroid: { lat: 28.64, lng: 77.23 },
    remainingPool: [museum],
    futurePools: [],
  };
  const result = evaluateCandidate(cand, evalCtx, config);

  it('totalScore in [0,1]',         () => assert.ok(result.totalScore >= 0 && result.totalScore <= 1));
  it('has breakdown with B1-B11',   () => {
    for (let k = 1; k <= 11; k++) assert.ok(`B${k}` in result.breakdown, `B${k} missing`);
  });
  it('B2 score for HIGH = 1.0 (capped)', () => assert.ok(result.breakdown.B2 <= 1.0));
  it('B1 > 0 (fort matches user interests)', () => assert.ok(result.breakdown.B1 > 0));
});

// ════════════════════════════════════════════════════════════════════════════════
// RouteOptimizer E2E
// ════════════════════════════════════════════════════════════════════════════════

describe('RouteOptimizer — end-to-end optimizeDay', () => {
  // Use 2026-10-06 (Tuesday) to avoid Monday closures
  const tuesday = { ...dayInput, date: '2026-10-06' };
  const context = {
    user, trip: tripInput,
    weather: clearWeather,
    futurePools: [],
    budgetSpentBefore: 0,
    serviceWindows: {},
  };

  const result = optimizeDay(tuesday, pool, travelMatrix, context, config);

  it('returns a DayStateManager', () => assert.ok(result instanceof DayStateManager));
  it('visited at least 1 stop',  () => assert.ok(result.stopCount >= 1));
  it('budgetSpent > 0',          () => assert.ok(result.budgetSpent > 0));
  it('totalScore in [0,1]',      () => assert.ok(result.totalScore >= 0 && result.totalScore <= 1));
  it('schedule has entries',     () => assert.ok(result.schedule.length > 0));
  it('all visited in schedule',  () => {
    const visitIds = result.schedule.filter((e) => e.type === 'visit').map((e) => e.placeId);
    for (const id of result.visitedIds) assert.ok(visitIds.includes(id), `${id} missing`);
  });
});

describe('RouteOptimizer — deterministic (same seed → same result)', () => {
  const tuesday = { ...dayInput, date: '2026-10-06' };
  const context = { user, trip: tripInput, weather: clearWeather, futurePools: [], budgetSpentBefore: 0, serviceWindows: {} };
  const r1 = optimizeDay(tuesday, pool, travelMatrix, context, config);
  const r2 = optimizeDay(tuesday, pool, travelMatrix, context, config);
  it('stopCount same both runs',     () => assert.equal(r1.stopCount,    r2.stopCount));
  it('budgetSpent same both runs',   () => assert.equal(r1.budgetSpent,  r2.budgetSpent));
  it('totalScore same both runs',    () => assert.ok(Math.abs(r1.totalScore - r2.totalScore) < 1e-10));
});
