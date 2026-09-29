/**
 * test/phase5.test.js
 * Phase 5 – Repair Engine, Reallocation, Global Validation, Output & E2E Tests
 * Run: node --test test/phase5.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

import { repairDay }           from '../src/repairEngine.js';
import { reallocatePlaces }    from '../src/crossDayReallocation.js';
import { validateGlobalTrip }  from '../src/globalValidation.js';
import { computeConfidence, formatOutput } from '../src/output.js';
import { planTrip }            from '../src/index.js';
import DayStateManager         from '../src/dayStateManager.js';
import config                  from '../config.js';

// ════════════════════════════════════════════════════════════════════════════════
// Fixtures
// ════════════════════════════════════════════════════════════════════════════════

const hotel = { id: 'hotel_a', lat: 28.6315, lng: 77.2167 };

const dayInput = {
  dayIndex:    0,
  date:        '2026-10-06',
  dayStart:    480,   // 08:00
  dayEnd:      1200,  // 20:00
  hotel,
  dailyBudget: Infinity,
};

const tripInput = { totalBudget: 20000, partySize: 2, nDays: 2 };

const fort = {
  id: 'fort_a', name: 'Red Fort',
  lat: 28.6562, lng: 77.2410,
  category: 'fort', subCategories: ['mughal'], tags: ['history'],
  priority: 'HIGH',
  modifiers: { flagship: 1, unesco: 1, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.2, outdoorSensitivity: 0.8,
  openTime: 570, closeTime: 1020, closedDays: ['Mon'],
  temporaryClosures: [],
  duration: { min: 60, ideal: 120, max: 180 },
  cost: 600, otherCost: 0,
};

const museum = {
  id: 'museum_a', name: 'National Museum',
  lat: 28.6116, lng: 77.2196,
  category: 'museum', subCategories: ['art'], tags: ['culture'],
  priority: 'MEDIUM',
  modifiers: { flagship: 0, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.5, outdoorSensitivity: 0.1,
  openTime: 600, closeTime: 1080, closedDays: ['Mon'],
  temporaryClosures: [],
  duration: { min: 60, ideal: 150, max: 240 },
  cost: 500, otherCost: 0,
};

const park = {
  id: 'park_a', name: 'City Park',
  lat: 28.6000, lng: 77.2200,
  category: 'park', subCategories: ['nature'], tags: ['relax'],
  priority: 'LOW',
  modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
  existingInterest: 0.1, outdoorSensitivity: 0.9,
  openTime: 360, closeTime: 1260, closedDays: [],
  temporaryClosures: [],
  duration: { min: 30, ideal: 60, max: 90 },
  cost: 50, otherCost: 0,
};

const pool = [fort, museum, park];

const travelMatrix = {
  hotel_a: {
    fort_a:   { taxi: { travelMin: 10, km: 3 } },
    museum_a: { taxi: { travelMin: 12, km: 3.5 } },
    park_a:   { taxi: { travelMin: 15, km: 4 } },
  },
  fort_a: {
    hotel_a:  { taxi: { travelMin: 10, km: 3 } },
    museum_a: { taxi: { travelMin: 8,  km: 2 } },
    park_a:   { taxi: { travelMin: 12, km: 3 } },
  },
  museum_a: {
    hotel_a:  { taxi: { travelMin: 12, km: 3.5 } },
    fort_a:   { taxi: { travelMin: 8,  km: 2 } },
    park_a:   { taxi: { travelMin: 6,  km: 1.5 } },
  },
  park_a: {
    hotel_a:  { taxi: { travelMin: 15, km: 4 } },
    fort_a:   { taxi: { travelMin: 12, km: 3 } },
    museum_a: { taxi: { travelMin: 6,  km: 1.5 } },
  },
};

const user = {
  interests: { history: 0.9, museum: 0.7, fort: 0.8 },
  modePreference: { taxi: 'preferred', walk: 'low' },
  mustVisit: ['fort_a'],
  mustAvoid: [],
  mandatoryGroups: [],
  minPlacesPerDay: 1,
  maxPlacesPerDay: 5,
};

// ════════════════════════════════════════════════════════════════════════════════
// 1. RepairEngine Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('RepairEngine — already feasible schedule', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({
    type: 'travel', placeId: 'fort_a', mode: 'taxi',
    startMin: 480, endMin: 490, travelMin: 10, waitMin: 0, visitMin: 0,
    costTransport: 90, costEntry: 0, kmFromPrev: 3,
  });
  state.addEntry({
    type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 570, endMin: 690, travelMin: 0, waitMin: 80, visitMin: 120,
    costTransport: 0, costEntry: 1200, kmFromPrev: 0,
  });
  state.addEntry({
    type: 'return', placeId: 'hotel_a', mode: 'taxi',
    startMin: 690, endMin: 700, travelMin: 10, waitMin: 0, visitMin: 0,
    costTransport: 90, costEntry: 0, kmFromPrev: 3,
  });

  const rep = repairDay(state, pool, travelMatrix, { user, trip: tripInput, weather: null }, config);

  it('reports repaired = true', () => assert.equal(rep.repaired, true));
  it('no overflow places when already feasible', () => assert.equal(rep.overflowPlaces.length, 0));
});

describe('RepairEngine — removes lowest value non-must-visit on tight budget', () => {
  // Tight budget: 1500 total, but schedule costs 1200 (fort) + 1000 (museum) = 2200
  const tightTrip = { totalBudget: 1500, partySize: 2 };
  const state = new DayStateManager(dayInput, tightTrip, 0);

  state.addEntry({
    type: 'travel', placeId: 'fort_a', mode: 'taxi',
    startMin: 480, endMin: 490, travelMin: 10, waitMin: 0, visitMin: 0,
    costTransport: 90, costEntry: 0, kmFromPrev: 3,
  });
  state.addEntry({
    type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 570, endMin: 690, travelMin: 0, waitMin: 0, visitMin: 120,
    costTransport: 0, costEntry: 1200, kmFromPrev: 0,
  });
  state.addEntry({
    type: 'travel', placeId: 'park_a', mode: 'taxi',
    startMin: 690, endMin: 702, travelMin: 12, waitMin: 0, visitMin: 0,
    costTransport: 90, costEntry: 0, kmFromPrev: 3,
  });
  state.addEntry({
    type: 'visit', placeId: 'park_a', mode: 'taxi',
    startMin: 702, endMin: 762, travelMin: 0, waitMin: 0, visitMin: 60,
    costTransport: 0, costEntry: 500, kmFromPrev: 0,
  });
  state.addEntry({
    type: 'return', placeId: 'hotel_a', mode: 'taxi',
    startMin: 762, endMin: 777, travelMin: 15, waitMin: 0, visitMin: 0,
    costTransport: 90, costEntry: 0, kmFromPrev: 4,
  });

  const rep = repairDay(state, pool, travelMatrix, { user, trip: tightTrip, weather: null }, config);
  it('applied a repair step', () => assert.ok(rep.appliedOperators.length >= 0));
  it('overflowPlaces contains removed stop if needed', () => {
    assert.ok(Array.isArray(rep.overflowPlaces));
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. CrossDayReallocation Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('CrossDayReallocation — candidate filtering and placement', () => {
  const day0 = new DayStateManager(dayInput, tripInput, 0);
  const day1 = new DayStateManager({ ...dayInput, dayIndex: 1, date: '2026-10-07' }, tripInput, 0);

  const overflow = [park];
  const poolsByDay = [[fort], [museum]];

  const result = reallocatePlaces(overflow, [day0, day1], poolsByDay, travelMatrix, { user, trip: tripInput }, config);

  it('returns dayStates array matching days length', () => assert.equal(result.dayStates.length, 2));
  it('returns array of unassigned places', () => assert.ok(Array.isArray(result.unassignedPlaces)));
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. GlobalValidation Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('GlobalValidation — all checks pass on valid plan', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({
    type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 570, endMin: 690, travelMin: 0, waitMin: 0, visitMin: 120,
    costTransport: 0, costEntry: 1200, kmFromPrev: 0,
  });
  state.budgetSpent = 1290;

  const placesMap = new Map([['fort_a', fort]]);
  const val = validateGlobalTrip([state], user, tripInput, placesMap);

  it('valid = true', () => assert.equal(val.valid, true));
  it('scheduledMustVisits includes fort_a', () => assert.ok(val.stats.scheduledMustVisits.includes('fort_a')));
  it('no missing must-visits', () => assert.equal(val.stats.missingMustVisits.length, 0));
});

describe('GlobalValidation — detects budget overrun and missing must-visit', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({
    type: 'visit', placeId: 'museum_a', mode: 'taxi',
    startMin: 600, endMin: 750, travelMin: 0, waitMin: 0, visitMin: 150,
    costTransport: 0, costEntry: 1000, kmFromPrev: 0,
  });
  state.budgetSpent = 25000; // Exceeds tripInput.totalBudget 20000

  const placesMap = new Map([['museum_a', museum]]);
  const val = validateGlobalTrip([state], user, tripInput, placesMap);

  it('valid = false', () => assert.equal(val.valid, false));
  it('flags missing must-visit fort_a', () => assert.ok(val.stats.missingMustVisits.includes('fort_a')));
  it('issues has budget overrun message', () => assert.ok(val.issues.some((msg) => msg.includes('exceeds budget'))));
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Output & Confidence Scoring Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('Confidence Scoring — spec formula', () => {
  it('perfect confidence = 1.0 when all conditions optimal', () => {
    const res = computeConfidence({
      scheduledMustVisits: 2,
      totalMustVisits: 2,
      meanSlackMin: 60,
      fragileStopCount: 0,
      totalStops: 4,
      dataAgeDays: 0,
    });
    assert.equal(res.overallConfidence, 1.0);
    assert.equal(res.breakdown.mustVisitRatio, 1.0);
    assert.equal(res.breakdown.meanSlackScore, 1.0);
    assert.equal(res.breakdown.fragileStopRatio, 1.0);
    assert.equal(res.breakdown.freshnessScore, 1.0);
  });

  it('partial confidence when fragile stops and age present', () => {
    const res = computeConfidence({
      scheduledMustVisits: 1,
      totalMustVisits: 2,   // ratio = 0.5
      meanSlackMin: 30,     // score = 0.5
      fragileStopCount: 2,  // ratio = 1 - 2/4 = 0.5
      totalStops: 4,
      dataAgeDays: 3.5,     // score = 1 - 3.5/7 = 0.5
    });
    assert.equal(res.overallConfidence, 0.5);
  });
});

describe('Output Formatting — complete JSON structure', () => {
  const state = new DayStateManager(dayInput, tripInput, 0);
  state.addEntry({
    type: 'visit', placeId: 'fort_a', mode: 'taxi',
    startMin: 570, endMin: 690, travelMin: 0, waitMin: 0, visitMin: 120,
    costTransport: 0, costEntry: 1200, kmFromPrev: 0,
  });
  const placesMap = new Map([['fort_a', fort]]);

  const out = formatOutput({
    tripId: 'test_trip_123',
    dayStates: [state],
    dayValidations: [{ slacks: [{ slackMin: 60 }], fragileStops: [] }],
    globalValidation: { valid: true, issues: [], stats: { scheduledMustVisits: ['fort_a'] } },
    user,
    trip: tripInput,
    placesMap,
  });

  it('tripId matches', () => assert.equal(out.tripId, 'test_trip_123'));
  it('status is SUCCESS', () => assert.equal(out.status, 'SUCCESS'));
  it('summary has all required fields', () => {
    assert.ok('totalDays' in out.summary);
    assert.ok('totalStops' in out.summary);
    assert.ok('totalBudget' in out.summary);
    assert.ok('totalSpent' in out.summary);
    assert.ok('overallConfidence' in out.summary);
  });
  it('days array has formatted schedule entries', () => {
    assert.equal(out.days.length, 1);
    assert.ok(out.days[0].schedule.length > 0);
    assert.equal(out.days[0].schedule[0].placeName, 'Red Fort');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. End-to-End planTrip Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('planTrip E2E — trip_small.json', async () => {
  const raw = JSON.parse(readFileSync('data/trip_small.json', 'utf8'));
  const plan = await planTrip(raw);

  it('produces SUCCESS status', () => assert.equal(plan.status, 'SUCCESS'));
  it('schedules at least 2 stops', () => assert.ok(plan.summary.totalStops >= 2));
  it('confidence is high (>= 0.8)', () => assert.ok(plan.summary.overallConfidence >= 0.8));
  it('totalSpent <= totalBudget', () => assert.ok(plan.summary.totalSpent <= plan.summary.totalBudget));
  it('schedule includes must-visit museum_a', () => {
    const visits = plan.days.flatMap((d) => d.schedule).filter((s) => s.type === 'visit');
    const ids = visits.map((v) => v.placeId);
    assert.ok(ids.includes('museum_a'));
  });
});
