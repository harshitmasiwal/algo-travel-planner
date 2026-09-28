/**
 * test/phase2.test.js
 * Phase 2 — A1-A9 Constraint Tests
 * Run: node --test test/phase2.test.js
 *
 * All expected values derived from spec formulas.
 * Floating-point tolerance: 0.5 min (times), ₹0.01 (costs).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatTime } from '../src/utils/time.js';
import config from '../config.js';

// ── Constraint imports ────────────────────────────────────────────────────────
import {
  checkTimeWindow, propagateOne, propagateSchedule, validateAgainstModel,
} from '../src/constraints/a1_timeWindows.js';

import {
  checkDayBoundary, canFitStop,
} from '../src/constraints/a2_dayBoundary.js';

import {
  checkVisitDuration, clampDuration, durationCandidates,
} from '../src/constraints/a3_visitDuration.js';

import {
  computeTransportCost, entryCost, otherCost, mealCost,
  checkIncrementalBudget, computeTotalCost, computeDayBudget, validateGlobalBudget,
} from '../src/constraints/a4_budget.js';

import {
  checkAvailability, isBlockedByTemporaryClosure,
} from '../src/constraints/a5_availability.js';

import {
  checkModeFeasibility, selectBestMode, isRoadClosed,
} from '../src/constraints/a6_transport.js';

import {
  checkBooking, snapToSlot,
} from '../src/constraints/a7_booking.js';

import {
  checkMandatedPlace, validateRoute, unschedulableMustVisits,
} from '../src/constraints/a8_mandated.js';

import {
  checkPlaceSafety, checkRouteSafety, checkTransportSafety, filterSafePlaces,
} from '../src/constraints/a9_safety.js';

// ════════════════════════════════════════════════════════════════════════════
// Shared test fixtures
// ════════════════════════════════════════════════════════════════════════════

const T = (hhmm) => parseTime(hhmm);

// Places
const museum = {
  id: 'museum_a', name: 'Museum A', lat: 28.67, lng: 77.23,
  category: 'museum', openTime: T('10:00'), closeTime: T('18:00'),
  duration: { min: 60, ideal: 90, max: 180 },
  cost: 200, otherCost: 0, outdoorSensitivity: 0.1,
  closedDays: ['Mon'], temporaryClosures: [],
  accessRestricted: false, restricted: false, eligibleDays: null,
  transportAccess: ['walk', 'taxi', 'transit'],
};

const fort = {
  id: 'fort_b', name: 'Fort B', lat: 28.66, lng: 77.24,
  category: 'fort', openTime: T('09:00'), closeTime: T('17:00'),
  duration: { min: 60, ideal: 90, max: 120 },
  cost: 150, otherCost: 30, outdoorSensitivity: 0.8,
  closedDays: [], temporaryClosures: [],
  accessRestricted: false, restricted: false, eligibleDays: null,
  transportAccess: ['walk', 'taxi', 'transit'],
};

const gallery = {
  id: 'gallery_c', name: 'Gallery C', lat: 28.65, lng: 77.22,
  category: 'gallery', openTime: T('14:30'), closeTime: T('19:00'),
  duration: { min: 45, ideal: 60, max: 90 },
  cost: 100, otherCost: 0, outdoorSensitivity: 0.0,
  closedDays: [], temporaryClosures: [],
  accessRestricted: false, restricted: false, eligibleDays: null,
  transportAccess: ['walk', 'taxi', 'transit'],
};

const temple = {
  id: 'temple_d', name: 'Temple D', lat: 28.64, lng: 77.21,
  category: 'religious', openTime: T('06:00'), closeTime: T('21:00'),
  duration: { min: 30, ideal: 60, max: 90 },
  cost: 0, otherCost: 0, outdoorSensitivity: 0.4,
  closedDays: [], temporaryClosures: [],
  accessRestricted: false, restricted: false, eligibleDays: null,
  transportAccess: ['walk', 'taxi', 'transit'],
};

const restaurant = {
  id: 'restaurant_e', name: 'Restaurant E', lat: 28.63, lng: 77.20,
  category: 'restaurant', openTime: T('11:00'), closeTime: T('23:00'),
  duration: { min: 30, ideal: 60, max: 90 },
  cost: 300, otherCost: 0, outdoorSensitivity: 0.0,
  closedDays: [], temporaryClosures: [],
  accessRestricted: false, restricted: false, eligibleDays: null,
  transportAccess: ['walk', 'taxi', 'transit'],
};

// Transport services
const transportServices = {
  walk:    { open: T('05:00'), close: T('23:59'), unavailable: [] },
  taxi:    { open: T('00:00'), close: T('23:59'), unavailable: [] },
  transit: {
    open: T('06:00'), close: T('22:00'),
    departures: ['06:00','07:00','08:00','09:00','10:00','11:00',
                 '12:00','13:00','14:00','15:00','16:00','17:00',
                 '18:00','19:00','20:00'].map(T),
    transferMin: 5, unavailable: [],
  },
};

// Context
const emptyContext = {
  closures: new Set(),
  safetyAlerts: [],
  environmentalRestrictions: [],
  roadClosures: [],
  transportSuspensions: [],
};

const clearWeather = { condition: 'clear', tempC: 28, rain: 0.0, wind: 0.1 };
const stormWeather = { condition: 'storm', tempC: 22, rain: 0.9, wind: 0.9 };
const heatWeather  = { condition: 'clear', tempC: 44, rain: 0.0, wind: 0.1 };

// User
const user = {
  mustVisit:          ['museum_a'],
  mustAvoid:          [],
  forbiddenCategories:[],
  mandatoryGroups:    [{ category: 'museum', count: 1, mode: 'atLeast' }],
  minPlacesPerDay:    2,
  maxPlacesPerDay:    6,
  allowedModes:       ['walk', 'taxi', 'transit'],
  modePreference:     { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
  maxWalkKm:          2.0,
  transferTolerance:  2,
};

// ════════════════════════════════════════════════════════════════════════════
// A1 — Time Windows
// ════════════════════════════════════════════════════════════════════════════

describe('A1 checkTimeWindow — spec example 1: museum with early arrival', () => {
  //  Hotel 08:00, travel 35 min → arrival 08:35 (515 min)
  //  Museum opens 10:00 (600), d=90 → start 10:00, finish 11:30, slack 390
  const arrivalMin = T('08:00') + 35;   // 515
  const result = checkTimeWindow(museum, arrivalMin, 90);

  it('arrival = 08:35 (515 min)', () => assert.equal(arrivalMin, 515));
  it('visit_start_time = 10:00', () => assert.equal(result.visit_start_time, '10:00'));
  it('visit_end_time = 11:30',   () => assert.equal(result.visit_end_time,   '11:30'));
  it('waiting_time = 85 min',    () => assert.equal(result.waiting_time, 85));
  it('time_slack = 390 min',     () => assert.equal(result.time_slack, 390));
  it('feasible = true',          () => assert.equal(result.feasible, true));
  it('failure_reason = null',    () => assert.equal(result.failure_reason, null));
});

describe('A1 checkTimeWindow — spec example 2: direct arrival after opening', () => {
  //  Arrival 10:20 (620), museum opens 10:00, d=90 → start 10:20, finish 11:50, slack 370
  const arrivalMin = T('10:20');
  const result = checkTimeWindow(museum, arrivalMin, 90);

  it('visit_start_time = 10:20', () => assert.equal(result.visit_start_time, '10:20'));
  it('visit_end_time = 11:50',   () => assert.equal(result.visit_end_time,   '11:50'));
  it('waiting_time = 0',         () => assert.equal(result.waiting_time, 0));
  it('time_slack = 370 min',     () => assert.equal(result.time_slack, 370));
  it('feasible = true',          () => assert.equal(result.feasible, true));
});

describe('A1 checkTimeWindow — infeasible: arrival too late', () => {
  //  Arrival 16:40 (1000), d=90, closes 18:00 → finish 17:50 ≤ 18:00 → feasible!
  //  But arrival 16:40, d=90, closes 17:00 (fort) → finish 18:10 > 17:00 → infeasible
  const arrivalMin = T('16:40');   // 1000 min
  const result = checkTimeWindow(fort, arrivalMin, 90);  // fort closes 17:00, d=90

  it('feasible = false (finish 18:10 > 17:00)', () => assert.equal(result.feasible, false));
  it('failure_reason is not null', () => assert.notEqual(result.failure_reason, null));
  it('finish is past closing time', () => {
    assert.ok(parseTime(result.visit_end_time) > fort.closeTime);
  });
});

describe('A1 checkTimeWindow — waiting case: arrive before opening', () => {
  //  Arrive 09:30 (570), fort opens 09:00, d=60 → start 09:30, finish 10:30, slack 390
  const arrivalMin = T('09:30');
  const result = checkTimeWindow(fort, arrivalMin, 60);

  it('start = 09:30 (no wait, already open)', () => assert.equal(result.visit_start_time, '09:30'));
  it('waiting_time = 0',                       () => assert.equal(result.waiting_time, 0));
  it('feasible = true',                        () => assert.equal(result.feasible, true));
  it('slack = 390 min',                        () => assert.equal(result.time_slack, 390));
});

describe('A1 propagateOne — raw numeric propagation', () => {
  const prev   = T('10:00') + 90;  // 690  (finish museum at 11:30)
  const travel = 25;
  // Fort B: open 09:00 (540), close 17:00 (1020), d=60
  const p = propagateOne(prev, travel, T('09:00'), T('17:00'), 60);

  it('arrival = 11:55 (715)',  () => assert.equal(p.arrival, 715));
  it('start = 11:55 (no wait)', () => assert.equal(p.start, 715));
  it('finish = 12:55 (775)',   () => assert.equal(p.finish, 775));
  it('waiting = 0',            () => assert.equal(p.waiting, 0));
  it('slack = 245 min',        () => assert.equal(p.slack, 245));
  it('feasible = true',        () => assert.equal(p.feasible, true));
});

describe('A1 propagateSchedule — two stops sequence', () => {
  // Hotel 08:00 → Museum (35 min travel) → Fort (25 min travel)
  const stops = [
    { ...museum, id: 'museum_a' },
    { ...fort,   id: 'fort_b'   },
  ];
  const getTravelMin = (from, to) => {
    const mat = { 'hotel|museum_a': 35, 'museum_a|fort_b': 25 };
    return mat[`${from}|${to}`] ?? 30;
  };
  const getDuration = (stop) => ({ museum_a: 90, fort_b: 60 }[stop.id] ?? 60);

  const { stops: sched, feasible, firstFailure } = propagateSchedule(
    stops, T('08:00'), 'hotel', getTravelMin, getDuration
  );

  it('schedule is feasible', () => assert.equal(feasible, true));
  it('no firstFailure',      () => assert.equal(firstFailure, null));
  it('museum arrival = 515', () => assert.equal(sched[0].arrival, 515));
  it('museum start = 600',   () => assert.equal(sched[0].start,   600));
  it('museum finish = 690',  () => assert.equal(sched[0].finish,  690));
  it('museum waiting = 85',  () => assert.equal(sched[0].waiting, 85));
  it('fort arrival = 715',   () => assert.equal(sched[1].arrival, 715));
  it('fort start = 715',     () => assert.equal(sched[1].start,   715));
  it('fort finish = 775',    () => assert.equal(sched[1].finish,  775));
  it('fort waiting = 0',     () => assert.equal(sched[1].waiting, 0));
});

describe('A1 validateAgainstModel — valid schedule passes', () => {
  // Pre-computed correct schedule
  const stops = [
    { ...museum, arrival: 515, start: 600, finish: 690 },
    { ...fort,   arrival: 715, start: 715, finish: 775 },
  ];
  const issues = validateAgainstModel({
    stops, dayStartMin: T('08:00'), startLocationId: 'hotel',
    getTravelMin: (a, b) => ({ 'hotel|museum_a': 35, 'museum_a|fort_b': 25 }[`${a}|${b}`] ?? 30),
    getDuration:  (s)    => ({ museum_a: 90, fort_b: 60 }[s.id] ?? 60),
  });
  it('no issues for valid schedule', () => assert.equal(issues.length, 0));
});

describe('A1 validateAgainstModel — detects closing violation', () => {
  // Fort finishing at 18:10 (1090) > closeTime 17:00 (1020)
  const stops = [
    { ...fort, arrival: T('16:00'), start: T('16:00'), finish: T('18:10') },
  ];
  const issues = validateAgainstModel({
    stops, dayStartMin: T('08:00'), startLocationId: 'hotel',
    getTravelMin: () => 35,
    getDuration:  () => 130,
  });
  it('detects closing-time violation', () => {
    assert.ok(issues.some((i) => i.includes('closing') || i.includes('close')), JSON.stringify(issues));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A2 — Day Boundary
// ════════════════════════════════════════════════════════════════════════════

describe('A2 checkDayBoundary — feasible day (return at 19:10)', () => {
  // From spec: 3 stops; travel 20+25+30+40=115; visit 60+60+60=180; wait 10+5+0=15
  // total = 310; available (14:00-20:00) = 360; remaining = 50
  const mockStops = [
    { placeId: 'gallery_c', travelMin: 20, waiting: 10, finish: T('14:00') + 20 + 10 + 60 },
    { placeId: 'fort_b',    travelMin: 25, waiting:  5, finish: T('14:00') + 20 + 10 + 60 + 25 + 5 + 60 },
    { placeId: 'temple_d',  travelMin: 30, waiting:  0, finish: T('14:00') + 20 + 10 + 60 + 25 + 5 + 60 + 30 + 60 },
  ];
  const lastFinish = mockStops[2].finish;   // 14:00 + 310 - 40(return) = ?
  // lastFinish = 840 + 310 - 40 = 1110 (18:30)
  // return 40 → 1150 (19:10)

  const result = checkDayBoundary({
    stops:          mockStops,
    visitDurations: [60, 60, 60],
    lastFinishMin:  1110,
    returnTravelMin: 40,
    dayEndMin:      T('20:00'),
    currentTimeMin: T('14:00'),
  });

  it('feasible = true',             () => assert.equal(result.day_time_feasible, true));
  it('total_day_time = 310',        () => assert.equal(result.total_day_time, 310));
  it('available_time = 360',        () => assert.equal(result.available_time, 360));
  it('return_arrival = 19:10',      () => assert.equal(result.return_arrival_formatted, '19:10'));
  it('remaining_time = 50',         () => assert.equal(result.remaining_time, 50));
  it('time_overrun = 0',            () => assert.equal(result.time_overrun, 0));
});

describe('A2 checkDayBoundary — infeasible (overrun 55 min)', () => {
  // 3 stops: travel 40+35+40=115 + return 30 = 145; visits 90+90+90=270; wait 0
  // current 14:00 (840); total = 415; return arrives 840+415 = 1255 (20:55)
  // overrun = 1255 - 1200 = 55
  const mockStops = [
    { placeId: 'p1', travelMin: 40, waiting: 0, finish: 840 + 40 + 90 },
    { placeId: 'p2', travelMin: 35, waiting: 0, finish: 840 + 40 + 90 + 35 + 90 },
    { placeId: 'p3', travelMin: 40, waiting: 0, finish: 840 + 40 + 90 + 35 + 90 + 40 + 90 },
  ];
  const lastFinish = 840 + 40 + 90 + 35 + 90 + 40 + 90;  // 1225

  const result = checkDayBoundary({
    stops:          mockStops,
    visitDurations: [90, 90, 90],
    lastFinishMin:  1225,
    returnTravelMin: 30,
    dayEndMin:      T('20:00'),
    currentTimeMin: T('14:00'),
  });

  it('feasible = false',      () => assert.equal(result.day_time_feasible, false));
  it('time_overrun = 55 min', () => assert.equal(result.time_overrun, 55));
  it('failure_reason set',    () => assert.notEqual(result.failure_reason, null));
});

describe('A2 canFitStop', () => {
  it('fits stop correctly within day', () => {
    // currentFinish=690 (11:30), travel=25, open=09:00, close=17:00, d=60, returnTravel=40, dayEnd=20:00
    const r = canFitStop(690, 25, T('09:00'), T('17:00'), 60, 40, T('20:00'));
    assert.equal(r, true);
  });
  it('rejects stop that overruns day end', () => {
    // currentFinish=1100 (18:20), travel=30, open=09:00, close=22:00, d=60, return=40, dayEnd=20:00
    const r = canFitStop(1100, 30, T('09:00'), T('22:00'), 60, 40, T('20:00'));
    // Arrives 18:50, start=18:50, finish=19:50, return 19:50+40=20:30 > 20:00
    assert.equal(r, false);
  });
  it('rejects stop that violates A1 (finish > closeTime)', () => {
    // currentFinish=960 (16:00), travel=5, open=09:00, close=16:10, d=60
    const r = canFitStop(960, 5, T('09:00'), T('16:10'), 60, 10, T('20:00'));
    // Arrives 16:05, start=16:05, finish=17:05 > 16:10 → A1 fail
    assert.equal(r, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A3 — Visit Duration
// ════════════════════════════════════════════════════════════════════════════

describe('A3 checkVisitDuration — museum (min=60, ideal=90, max=180)', () => {
  it('d=60 is valid (= min)',  () => assert.equal(checkVisitDuration(museum, 60).feasible, true));
  it('d=90 is valid (= ideal)',() => assert.equal(checkVisitDuration(museum, 90).feasible, true));
  it('d=180 is valid (= max)', () => assert.equal(checkVisitDuration(museum, 180).feasible, true));
  it('d=30 is invalid (< min)',() => {
    const r = checkVisitDuration(museum, 30);
    assert.equal(r.feasible, false);
    assert.ok(r.failure_reason.includes('30'));
  });
  it('d=200 is invalid (> max)', () => {
    const r = checkVisitDuration(museum, 200);
    assert.equal(r.feasible, false);
    assert.ok(r.failure_reason.includes('200'));
  });
  it('selected=false with d=0 is valid', () => {
    assert.equal(checkVisitDuration(museum, 0, false).feasible, true);
  });
  it('selected=false with d=60 is invalid', () => {
    assert.equal(checkVisitDuration(museum, 60, false).feasible, false);
  });
});

describe('A3 clampDuration', () => {
  it('clamps below min to min', () => assert.equal(clampDuration(museum, 20), 60));
  it('clamps above max to max', () => assert.equal(clampDuration(museum, 300), 180));
  it('keeps valid value',       () => assert.equal(clampDuration(museum, 90), 90));
});

describe('A3 durationCandidates', () => {
  it('returns [60, 90, 180] for museum', () => {
    assert.deepEqual(durationCandidates(museum), [60, 90, 180]);
  });
  it('returns distinct sorted values', () => {
    const p = { duration: { min: 60, ideal: 60, max: 120 } };
    assert.deepEqual(durationCandidates(p), [60, 120]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A4 — Budget
// ════════════════════════════════════════════════════════════════════════════

describe('A4 computeTransportCost', () => {
  // From config: walk baseFare=0, perKm=0; taxi baseFare=30, perKm=12; transit baseFare=10, perKm=2
  it('walk cost is always 0', () => {
    assert.equal(computeTransportCost('walk', 5, 2), 0);
  });

  it('taxi 5 km, 2 people: (40 + 15*5) = 115, perPerson=false', () => {
    const cost = computeTransportCost('taxi', 5, 2);
    // taxi perPerson=false → flat
    assert.equal(cost, 40 + 15 * 5);   // 115
  });

  it('transit 5 km, 2 people: perPerson=true → (10 + 2*5)*2 = 40', () => {
    const cost = computeTransportCost('transit', 5, 2);
    // transit perPerson=true → (10 + 2*5) * 2 = 20 * 2 = 40
    assert.equal(cost, (10 + 2 * 5) * 2);
  });

  it('taxi 10 km: 40 + 15*10 = 190', () => {
    assert.equal(computeTransportCost('taxi', 10, 1), 190);
  });
});

describe('A4 entryCost / otherCost / mealCost', () => {
  it('museum entry: 200 * 2 = 400', () => assert.equal(entryCost(museum, 2), 400));
  it('fort other: 30 * 2 = 60',     () => assert.equal(otherCost(fort, 2),  60));
  it('meal 500 * 3 = 1500',          () => assert.equal(mealCost(500, 3), 1500));
  it('temple entry: 0 * 2 = 0',     () => assert.equal(entryCost(temple, 2), 0));
});

describe('A4 checkIncrementalBudget — feasible', () => {
  // budgetRemaining=3000, museum cost 200*2=400, transport taxi 3.6km 40+15*3.6=94
  // return taxi 3.6km also 94; incremental = 94 + 400 = 494; total 494+94=588 < 3000
  const state = { budgetRemaining: 3000 };
  const result = checkIncrementalBudget(state, museum, 'taxi', 3.6, 3.6, 2);
  it('feasible = true',      () => assert.equal(result.feasible, true));
  it('incremental ≈ 494',   () => {
    const expected = (40 + 15 * 3.6) + 200 * 2;
    assert.ok(Math.abs(result.incrementalCost - expected) < 0.1, `Expected ~${expected}, got ${result.incrementalCost}`);
  });
});

describe('A4 checkIncrementalBudget — infeasible', () => {
  const state = { budgetRemaining: 100 };
  const result = checkIncrementalBudget(state, museum, 'taxi', 3.6, 3.6, 2);
  it('feasible = false',          () => assert.equal(result.feasible, false));
  it('failure_reason is set',     () => assert.notEqual(result.failure_reason, null));
});

describe('A4 computeTotalCost', () => {
  const schedule = {
    stops: [
      { transportMode: 'taxi',    legKm: 5,   cost: 200, otherCost: 0 },
      { transportMode: 'transit', legKm: 3,   cost: 150, otherCost: 30 },
    ],
    meals: [{ avgCost: 500 }],
    returnMode: 'taxi', returnKm: 4,
  };
  const { totalCost, breakdown } = computeTotalCost(schedule, 2);

  it('breakdown.place = (200+150)*2 = 700', () => assert.equal(breakdown.place, 700));
  it('breakdown.other = 30*2 = 60',        () => assert.equal(breakdown.other, 60));
  it('breakdown.meal  = 500*2 = 1000',     () => assert.equal(breakdown.meal, 1000));
  it('breakdown.transport includes return', () => {
    // taxi 5km: 40+75=115 (flat), transit 3km 2 people: (10+6)*2=32, return taxi 4km: 40+60=100
    const expected = 115 + (10 + 2 * 3) * 2 + (40 + 15 * 4);
    assert.ok(Math.abs(breakdown.transport - expected) < 0.1, `Expected ${expected}, got ${breakdown.transport}`);
  });
  it('totalCost = sum of all parts', () => {
    assert.ok(Math.abs(totalCost - (breakdown.place + breakdown.transport + breakdown.meal + breakdown.other)) < 0.1);
  });
});

describe('A4 validateGlobalBudget', () => {
  it('within budget is feasible', () => {
    assert.equal(validateGlobalBudget(4500, 5000).feasible, true);
  });
  it('exactly at budget is feasible', () => {
    assert.equal(validateGlobalBudget(5000, 5000).feasible, true);
  });
  it('over budget is infeasible', () => {
    const r = validateGlobalBudget(5200, 5000);
    assert.equal(r.feasible, false);
    assert.equal(r.overrun, 200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A5 — Availability
// ════════════════════════════════════════════════════════════════════════════

describe('A5 checkAvailability — normal available day', () => {
  // Museum open Tue-Sun, today is Tuesday
  const r = checkAvailability(museum, '2026-09-29', 0, T('10:00'), T('11:30'), user.allowedModes, emptyContext);
  it('available = true',      () => assert.equal(r.available, true));
  it('access_allowed = true', () => assert.equal(r.access_allowed, true));
  it('reachable = true',      () => assert.equal(r.reachable, true));
  it('reason = null',         () => assert.equal(r.reason, null));
});

describe('A5 checkAvailability — closed day (museum closed Mon)', () => {
  // 2026-09-28 is Monday
  const r = checkAvailability(museum, '2026-09-28', 0, T('10:00'), T('11:30'), user.allowedModes, emptyContext);
  it('available = false',     () => assert.equal(r.available, false));
  it('reason = CLOSED_DAY',   () => assert.equal(r.reason, 'CLOSED_DAY'));
});

describe('A5 checkAvailability — temporary closure', () => {
  const ctx = {
    ...emptyContext,
    closures: new Set(['museum_a|2026-09-30']),
  };
  const r = checkAvailability(museum, '2026-09-30', 1, T('10:00'), T('11:30'), user.allowedModes, ctx);
  it('available = false',             () => assert.equal(r.available, false));
  it('reason = TEMPORARILY_CLOSED',   () => assert.equal(r.reason, 'TEMPORARILY_CLOSED'));
});

describe('A5 checkAvailability — access restricted place', () => {
  const restricted = { ...fort, accessRestricted: true };
  const r = checkAvailability(restricted, '2026-09-29', 0, T('10:00'), T('11:00'), user.allowedModes, emptyContext);
  it('available = false',          () => assert.equal(r.available, false));
  it('reason = ACCESS_RESTRICTED', () => assert.equal(r.reason, 'ACCESS_RESTRICTED'));
});

describe('A5 checkAvailability — eligibleDays gate', () => {
  const p = { ...museum, eligibleDays: [2, 3, 4] };  // only days 2,3,4
  const r = checkAvailability(p, '2026-09-29', 0, T('10:00'), T('11:30'), user.allowedModes, emptyContext);
  it('available = false for day 0',  () => assert.equal(r.available, false));
  it('reason = NOT_ELIGIBLE_DAY',    () => assert.equal(r.reason, 'NOT_ELIGIBLE_DAY'));

  const r2 = checkAvailability(p, '2026-09-29', 2, T('10:00'), T('11:30'), user.allowedModes, emptyContext);
  it('available = true for day 2',   () => assert.equal(r2.available, true));
});

describe('A5 checkAvailability — not reachable (no matching modes)', () => {
  const p = { ...museum, transportAccess: ['helicopter'] };
  const r = checkAvailability(p, '2026-09-29', 0, T('10:00'), T('11:30'), user.allowedModes, emptyContext);
  it('available = false',     () => assert.equal(r.available, false));
  it('reason = NOT_REACHABLE',() => assert.equal(r.reason, 'NOT_REACHABLE'));
});

describe('A5 isBlockedByTemporaryClosure', () => {
  const closures = [{ date: '2026-09-29', from: T('14:00'), to: T('16:00') }];
  it('14:30 is blocked',      () => assert.equal(isBlockedByTemporaryClosure(closures, '2026-09-29', T('14:30')), true));
  it('13:59 is not blocked',  () => assert.equal(isBlockedByTemporaryClosure(closures, '2026-09-29', T('13:59')), false));
  it('16:00 is not blocked',  () => assert.equal(isBlockedByTemporaryClosure(closures, '2026-09-29', T('16:00')), false));
  it('different date ok',     () => assert.equal(isBlockedByTemporaryClosure(closures, '2026-09-30', T('15:00')), false));
});

// ════════════════════════════════════════════════════════════════════════════
// A6 — Transport Feasibility
// ════════════════════════════════════════════════════════════════════════════

const baseLegParams = {
  fromId: 'hotel', toId: 'museum_a',
  date: '2026-09-29',
  readyMin: T('08:00'),
  userAllowedModes: user.allowedModes,
  placeTransportAccess: museum.transportAccess,
  transferTolerance: user.transferTolerance,
  maxWalkKm: user.maxWalkKm,
  transportServices,
  context: emptyContext,
};

describe('A6 checkModeFeasibility — taxi (always feasible on clear day)', () => {
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'taxi',
    travelInfo: { minutes: 35, km: 14.6, transfers: 0 },
  });
  it('feasible = true',  () => assert.equal(r.feasible, true));
  it('F_ijm = 1',        () => assert.equal(r.F_ijm, 1));
  it('arrivalMin = 515', () => assert.equal(r.arrivalMin, T('08:00') + 35));
});

describe('A6 checkModeFeasibility — walk exceeds maxWalkKm', () => {
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'walk',
    travelInfo: { minutes: 174, km: 14.6, transfers: 0 }, // 14.6 km > 2.0 km
  });
  it('feasible = false',                   () => assert.equal(r.feasible, false));
  it('reason includes WALK_DISTANCE',       () => assert.ok(r.reason.includes('WALK_DISTANCE')));
});

describe('A6 checkModeFeasibility — transit with scheduled departure', () => {
  // ready 08:10, next departure is 09:00 (first after 08:10 + 5 min transfer = 08:15)
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'transit', readyMin: T('08:10'),
    travelInfo: { minutes: 20, km: 3.6, transfers: 0 },
  });
  it('feasible = true',                    () => assert.equal(r.feasible, true));
  it('departureMin = 09:00',               () => assert.equal(r.departureMin, T('09:00')));
  it('transferWaitMin = 50',               () => assert.equal(r.transferWaitMin, 50));
});

describe('A6 checkModeFeasibility — mode not allowed', () => {
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'bus',
    userAllowedModes: ['walk', 'taxi'],
    travelInfo: { minutes: 25, km: 5.0, transfers: 0 },
  });
  it('feasible = false, reason = MODE_NOT_ALLOWED', () => {
    assert.equal(r.feasible, false);
    assert.ok(r.reason.includes('NOT_ALLOWED'));
  });
});

describe('A6 checkModeFeasibility — transport suspended', () => {
  const ctx = {
    ...emptyContext,
    transportSuspensions: [{ mode: 'transit', date: '2026-09-29' }],
  };
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'transit', context: ctx,
    travelInfo: { minutes: 20, km: 3.6, transfers: 0 },
  });
  it('feasible = false, reason = TRANSPORT_SUSPENDED', () => {
    assert.equal(r.feasible, false);
    assert.ok(r.reason.includes('SUSPENDED'));
  });
});

describe('A6 checkModeFeasibility — road closed', () => {
  const ctx = {
    ...emptyContext,
    roadClosures: [{ fromId: 'hotel', toId: 'museum_a', date: '2026-09-29' }],
  };
  const r = checkModeFeasibility({
    ...baseLegParams, mode: 'taxi', context: ctx,
    travelInfo: { minutes: 35, km: 14.6, transfers: 0 },
  });
  it('feasible = false, reason = ROAD_CLOSED', () => {
    assert.equal(r.feasible, false);
    assert.ok(r.reason.includes('ROAD_CLOSED'));
  });
});

describe('A6 selectBestMode — prefers taxi over transit', () => {
  const travelMatrix = {
    lookup: (from, to, mode) => ({
      walk:    { minutes: 174, km: 14.6, transfers: 0 },
      taxi:    { minutes:  35, km: 14.6, transfers: 0 },
      transit: { minutes:  49, km: 14.6, transfers: 0 },
    }[mode] ?? null),
  };
  const { mode } = selectBestMode({
    fromId: 'hotel', toId: 'museum_a',
    readyMin: T('08:00'), date: '2026-09-29',
    userAllowedModes: ['walk', 'taxi', 'transit'],
    placeTransportAccess: ['walk', 'taxi', 'transit'],
    modePreference: { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
    transferTolerance: 2, maxWalkKm: 2,
    transportServices, context: emptyContext, travelMatrix,
  });
  it('selects taxi as best mode', () => assert.equal(mode, 'taxi'));
});

describe('A6 isRoadClosed', () => {
  const closures = [{ fromId: 'hotel', toId: 'museum_a', date: '2026-09-29' }];
  it('hotel→museum_a closed',  () => assert.equal(isRoadClosed('hotel', 'museum_a', '2026-09-29', closures), true));
  it('museum_a→hotel also closed (bidirectional)', () =>
    assert.equal(isRoadClosed('museum_a', 'hotel', '2026-09-29', closures), true));
  it('different date is open',  () => assert.equal(isRoadClosed('hotel', 'museum_a', '2026-09-30', closures), false));
});

// ════════════════════════════════════════════════════════════════════════════
// A7 — Booking
// ════════════════════════════════════════════════════════════════════════════

const slottedPlace = {
  booking: {
    required: true,
    slots: [
      {
        slotId:    'slot_1', date: '2026-09-29',
        start:     T('10:00'), end: T('12:00'),
        capacity:  20, available: true, confirmed: true,
        cutoff:    '2026-09-28T23:59:00+05:30',
      },
      {
        slotId:    'slot_2', date: '2026-09-29',
        start:     T('14:00'), end: T('16:00'),
        capacity:  10, available: true, confirmed: true,
        cutoff:    '2026-09-28T23:59:00+05:30',
      },
    ],
  },
};

const bookingTime  = new Date('2026-09-27T10:00:00+05:30');  // before cutoff

describe('A7 checkBooking — valid slot found', () => {
  const r = checkBooking(slottedPlace.booking, '2026-09-29', T('10:00'), T('11:30'), bookingTime, 2);
  it('feasible = true',     () => assert.equal(r.feasible, true));
  it('slot is slot_1',      () => assert.equal(r.slot.slotId, 'slot_1'));
  it('no failure_reason',   () => assert.equal(r.failure_reason, null));
});

describe('A7 checkBooking — visit does not fit any slot', () => {
  // Visit 12:30-14:00 — falls between slot_1 (ends 12:00) and slot_2 (starts 14:00)
  const r = checkBooking(slottedPlace.booking, '2026-09-29', T('12:30'), T('13:30'), bookingTime, 2);
  it('feasible = false',       () => assert.equal(r.feasible, false));
  it('failure_reason is set',  () => assert.notEqual(r.failure_reason, null));
});

describe('A7 checkBooking — no slots on that date', () => {
  const r = checkBooking(slottedPlace.booking, '2026-10-01', T('10:00'), T('11:30'), bookingTime, 2);
  it('feasible = false',              () => assert.equal(r.feasible, false));
  it('reason mentions no slots',      () => assert.ok(r.failure_reason.includes('2026-10-01')));
});

describe('A7 checkBooking — cutoff passed', () => {
  const afterCutoff = new Date('2026-09-29T10:00:00+05:30');
  const r = checkBooking(slottedPlace.booking, '2026-09-29', T('10:00'), T('11:30'), afterCutoff, 2);
  it('feasible = false', () => assert.equal(r.feasible, false));
  it('reason mentions cutoff or unavailable', () => {
    assert.ok(r.failure_reason.includes('cutoff') || r.failure_reason.includes('unavailable'));
  });
});

describe('A7 checkBooking — no booking required', () => {
  const r = checkBooking(null, '2026-09-29', T('10:00'), T('11:30'), bookingTime, 2);
  it('feasible = true (no booking required)', () => assert.equal(r.feasible, true));
  it('slot = null',                           () => assert.equal(r.slot, null));
});

describe('A7 snapToSlot', () => {
  const slot = { start: T('10:00'), end: T('12:00') };
  it('snaps early arrival to slot start', () => {
    const r = snapToSlot(slot, T('09:30'), 90, T('18:00'));
    assert.equal(r.start, T('10:00'));
    assert.equal(r.end,   T('11:30'));
    assert.equal(r.feasible, true);
  });
  it('uses proposed start if after slot start', () => {
    const r = snapToSlot(slot, T('10:20'), 90, T('18:00'));
    assert.equal(r.start, T('10:20'));
    assert.equal(r.end,   T('11:50'));
  });
  it('infeasible if duration overflows slot', () => {
    const r = snapToSlot(slot, T('10:00'), 150, T('18:00'));  // ends 12:30 > slot.end 12:00
    assert.equal(r.feasible, false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A8 — Mandated Constraints
// ════════════════════════════════════════════════════════════════════════════

describe('A8 checkMandatedPlace', () => {
  it('must-visit place is forced include', () => {
    const r = checkMandatedPlace({ id: 'museum_a', category: 'museum' }, user);
    assert.equal(r.includeForced, true);
    assert.equal(r.excludeForced, false);
    assert.equal(r.reason, 'MUST_VISIT');
  });
  it('must-avoid place is forced exclude', () => {
    const u2 = { ...user, mustAvoid: ['fort_b'] };
    const r  = checkMandatedPlace({ id: 'fort_b', category: 'fort' }, u2);
    assert.equal(r.excludeForced, true);
    assert.equal(r.reason, 'MUST_AVOID');
  });
  it('forbidden category is excluded', () => {
    const u2 = { ...user, forbiddenCategories: ['shopping'] };
    const r  = checkMandatedPlace({ id: 'mall_x', category: 'shopping' }, u2);
    assert.equal(r.excludeForced, true);
    assert.equal(r.reason, 'FORBIDDEN_CATEGORY');
  });
  it('walk too far excludes place', () => {
    const r = checkMandatedPlace({ id: 'far_place', category: 'museum' }, user, { mode: 'walk', legKm: 5 });
    assert.equal(r.excludeForced, true);
    assert.equal(r.reason, 'WALK_TOO_FAR');
  });
  it('normal place has no forced flag', () => {
    const r = checkMandatedPlace(temple, user);
    assert.equal(r.includeForced, false);
    assert.equal(r.excludeForced, false);
  });
});

describe('A8 validateRoute — valid route', () => {
  const route = [museum, fort, restaurant];
  const { valid, issues } = validateRoute(route, user);
  it('valid = true for route with must-visit and mandatory museum', () => {
    assert.equal(valid, true);
  });
  it('no issues', () => assert.equal(issues.length, 0));
});

describe('A8 validateRoute — missing must-visit', () => {
  const route = [fort, restaurant];
  const { valid, issues } = validateRoute(route, user);
  it('valid = false when museum_a missing', () => assert.equal(valid, false));
  it('issue mentions museum_a', () => {
    assert.ok(issues.some((i) => i.includes('museum_a')));
  });
});

describe('A8 validateRoute — must-avoid violation', () => {
  const u2 = { ...user, mustAvoid: ['fort_b'] };
  const route = [museum, fort];
  const { valid, issues } = validateRoute(route, u2);
  it('valid = false when must-avoid fort_b is present', () => assert.equal(valid, false));
  it('issue mentions fort_b', () => assert.ok(issues.some((i) => i.includes('fort_b'))));
});

describe('A8 validateRoute — daily count bounds', () => {
  it('too few places (< minPlacesPerDay)', () => {
    const { valid, issues } = validateRoute([museum], user);
    // Must-visit present, museum group satisfied, but only 1 place < min 2
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes('minimum')));
  });
  it('too many places (> maxPlacesPerDay)', () => {
    const u2 = { ...user, maxPlacesPerDay: 2 };
    const route = [museum, fort, gallery, temple];
    const { valid, issues } = validateRoute(route, u2);
    assert.equal(valid, false);
    assert.ok(issues.some((i) => i.includes('maximum')));
  });
});

describe('A8 unschedulableMustVisits', () => {
  it('detects must-visit not in any future pool', () => {
    const result = unschedulableMustVisits(['museum_a', 'fort_b'], new Set(), [['gallery_c', 'temple_d']]);
    assert.deepEqual(result.sort(), ['fort_b', 'museum_a'].sort());
  });
  it('ignores already-scheduled must-visits', () => {
    const result = unschedulableMustVisits(['museum_a', 'fort_b'], new Set(['museum_a']), [['gallery_c']]);
    assert.deepEqual(result, ['fort_b']);
  });
  it('returns empty when all scheduled or in future pool', () => {
    const result = unschedulableMustVisits(['museum_a'], new Set(), [['museum_a']]);
    assert.deepEqual(result, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A9 — Safety / Environmental
// ════════════════════════════════════════════════════════════════════════════

describe('A9 checkPlaceSafety — clear day, indoor place', () => {
  const r = checkPlaceSafety(museum, '2026-09-29', T('10:00'), clearWeather, emptyContext);
  it('F_i = 1', () => assert.equal(r.F_i, 1));
  it('safe = true', () => assert.equal(r.safe, true));
  it('S=O=E=H=1', () => {
    assert.equal(r.S_i, 1); assert.equal(r.O_i, 1);
    assert.equal(r.E_i, 1); assert.equal(r.H_i, 1);
  });
});

describe('A9 checkPlaceSafety — storm day, outdoor place', () => {
  // fort: outdoorSensitivity = 0.8 >= 0.5 threshold → H_i = 0
  const r = checkPlaceSafety(fort, '2026-10-03', T('10:00'), stormWeather, emptyContext);
  it('H_i = 0 (storm + outdoor)',      () => assert.equal(r.H_i, 0));
  it('F_i = 0',                        () => assert.equal(r.F_i, 0));
  it('safe = false',                   () => assert.equal(r.safe, false));
  it('failure_reason includes STORM',  () =>
    assert.ok(r.failure_reason.includes('STORM')));
});

describe('A9 checkPlaceSafety — storm day, indoor place (museum)', () => {
  // museum: outdoorSensitivity = 0.1 < 0.5 → H_i stays 1
  const r = checkPlaceSafety(museum, '2026-10-03', T('10:00'), stormWeather, emptyContext);
  it('H_i = 1 (indoor during storm)', () => assert.equal(r.H_i, 1));
  it('F_i = 1',                       () => assert.equal(r.F_i, 1));
  it('safe = true',                   () => assert.equal(r.safe, true));
});

describe('A9 checkPlaceSafety — extreme heat, outdoor place', () => {
  // tempC=44 < config.extremeHeatC=45, so NOT blocked. Use tempC=46:
  const veryHotWeather = { condition: 'clear', tempC: 46, rain: 0.0, wind: 0.1 };
  const r = checkPlaceSafety(fort, '2026-09-29', T('12:00'), veryHotWeather, emptyContext);
  it('H_i = 0 (extreme heat >= 45°C + outdoor)', () => assert.equal(r.H_i, 0));
  it('F_i = 0',                          () => assert.equal(r.F_i, 0));
  it('failure_reason includes HEAT',     () =>
    assert.ok(r.failure_reason.includes('HEAT')));
});

describe('A9 checkPlaceSafety — safety block alert', () => {
  const ctx = {
    ...emptyContext,
    safetyAlerts: [{ placeId: 'fort_b', date: '2026-09-29', level: 'block' }],
  };
  const r = checkPlaceSafety(fort, '2026-09-29', T('10:00'), clearWeather, ctx);
  it('S_i = 0 (block alert)',              () => assert.equal(r.S_i, 0));
  it('F_i = 0',                            () => assert.equal(r.F_i, 0));
  it('failure_reason includes SAFETY',     () =>
    assert.ok(r.failure_reason.includes('SAFETY')));
});

describe('A9 checkPlaceSafety — warn alert adds warning, does not block', () => {
  const ctx = {
    ...emptyContext,
    safetyAlerts: [{ placeId: 'fort_b', date: '2026-09-29', level: 'warn' }],
  };
  const r = checkPlaceSafety(fort, '2026-09-29', T('10:00'), clearWeather, ctx);
  it('S_i = 1 (warn does not block)',  () => assert.equal(r.S_i, 1));
  it('F_i = 1',                        () => assert.equal(r.F_i, 1));
  it('warnings array has 1 entry',     () => assert.equal(r.warnings.length, 1));
});

describe('A9 checkPlaceSafety — environmental restriction', () => {
  const ctx = {
    ...emptyContext,
    environmentalRestrictions: [{ placeId: 'museum_a', date: '2026-09-29' }],
  };
  const r = checkPlaceSafety(museum, '2026-09-29', T('10:00'), clearWeather, ctx);
  it('E_i = 0',                               () => assert.equal(r.E_i, 0));
  it('F_i = 0',                               () => assert.equal(r.F_i, 0));
  it('failure_reason includes ENVIRONMENTAL', () =>
    assert.ok(r.failure_reason.includes('ENVIRONMENTAL')));
});

describe('A9 checkRouteSafety', () => {
  const closures = [{ fromId: 'hotel', toId: 'museum_a', date: '2026-09-29' }];
  it('closed road is unsafe',  () => assert.equal(checkRouteSafety('hotel', 'museum_a', '2026-09-29', closures), false));
  it('open road is safe',      () => assert.equal(checkRouteSafety('hotel', 'fort_b',   '2026-09-29', closures), true));
  it('bidirectional: reverse', () => assert.equal(checkRouteSafety('museum_a', 'hotel', '2026-09-29', closures), false));
});

describe('A9 checkTransportSafety', () => {
  it('walk blocked in storm', () => {
    const r = checkTransportSafety('walk', '2026-10-03', T('09:00'), emptyContext, config, stormWeather);
    assert.equal(r.T_safe, 0);
    assert.ok(r.reason.includes('STORM'));
  });
  it('taxi safe in storm', () => {
    const r = checkTransportSafety('taxi', '2026-10-03', T('09:00'), emptyContext, config, stormWeather);
    assert.equal(r.T_safe, 1);
  });
  it('transit safe in storm', () => {
    const r = checkTransportSafety('transit', '2026-10-03', T('09:00'), emptyContext, config, stormWeather);
    assert.equal(r.T_safe, 1);
  });
  it('transit suspended is unsafe', () => {
    const ctx = { ...emptyContext, transportSuspensions: [{ mode: 'transit', date: '2026-09-29' }] };
    const r   = checkTransportSafety('transit', '2026-09-29', T('09:00'), ctx, config, clearWeather);
    assert.equal(r.T_safe, 0);
    assert.ok(r.reason.includes('SUSPENDED'));
  });
});

describe('A9 filterSafePlaces — storm day blocks outdoor places', () => {
  const places = [museum, fort, gallery, temple];  // temple outdoorSens=0.4 < 0.5
  const { safe, blocked } = filterSafePlaces(places, '2026-10-03', T('10:00'), stormWeather, emptyContext);
  it('museum (indoor 0.1) is safe',              () => assert.ok(safe.some((p) => p.id === 'museum_a')));
  it('gallery (indoor 0.0) is safe',             () => assert.ok(safe.some((p) => p.id === 'gallery_c')));
  it('temple (outdoorSens=0.4 < 0.5) is safe',  () => assert.ok(safe.some((p) => p.id === 'temple_d')));
  it('fort (outdoor 0.8) is blocked',            () => assert.ok(blocked.some((b) => b.place.id === 'fort_b')));
});
