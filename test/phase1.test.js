/**
 * test/phase1.test.js
 * Phase 1 tests: utilities, config, validateInput, normalizeInput, providers.
 * Run: node --test test/phase1.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, '..');

// ── Utility imports ──────────────────────────────────────────────────────────
import { parseTime, formatTime, formatDuration, clamp01, clamp, nextDeparture } from '../src/utils/time.js';
import { haversineKm, travelMinutes, centroid, cosineSimilarity } from '../src/utils/geo.js';
import { createRng, shuffle } from '../src/utils/rng.js';
import config from '../config.js';
import { validateInput, ValidationError } from '../src/validateInput.js';
import { normalizeInput } from '../src/normalizeInput.js';
import { MockProvider } from '../src/providers/mockProvider.js';
import { OsrmProvider } from '../src/providers/osrmProvider.js';

// ════════════════════════════════════════════════════════════════════════════════
// Time utilities
// ════════════════════════════════════════════════════════════════════════════════

describe('parseTime', () => {
  it('parses "08:00" to 480', () => assert.equal(parseTime('08:00'), 480));
  it('parses "00:00" to 0',    () => assert.equal(parseTime('00:00'), 0));
  it('parses "23:59" to 1439', () => assert.equal(parseTime('23:59'), 1439));
  it('parses "10:30" to 630',  () => assert.equal(parseTime('10:30'), 630));
  it('throws on bad format',   () => assert.throws(() => parseTime('8:00'), RangeError));
  it('throws on non-string',   () => assert.throws(() => parseTime(800), TypeError));
  it('throws on out-of-range hour', () => assert.throws(() => parseTime('25:00'), RangeError));
});

describe('formatTime', () => {
  it('formats 480 as "08:00"', () => assert.equal(formatTime(480), '08:00'));
  it('formats 0 as "00:00"',   () => assert.equal(formatTime(0),   '00:00'));
  it('formats 1439 as "23:59"',() => assert.equal(formatTime(1439),'23:59'));
  it('rounds fractional minutes', () => assert.equal(formatTime(90.4), '01:30'));
});

describe('clamp01', () => {
  it('clamps -0.5 to 0',  () => assert.equal(clamp01(-0.5), 0));
  it('clamps 1.5 to 1',   () => assert.equal(clamp01(1.5),  1));
  it('keeps 0.5 at 0.5',  () => assert.equal(clamp01(0.5),  0.5));
  it('keeps 0 at 0',      () => assert.equal(clamp01(0),    0));
  it('keeps 1 at 1',      () => assert.equal(clamp01(1),    1));
});

describe('nextDeparture', () => {
  const deps = ['06:00','07:00','08:00','09:00','10:00'];
  it('returns first departure >= ready', () => {
    assert.equal(nextDeparture(deps, parseTime('07:30')), parseTime('08:00'));
  });
  it('returns null when all departures passed', () => {
    assert.equal(nextDeparture(deps, parseTime('10:01')), null);
  });
  it('returns exactly matching departure', () => {
    assert.equal(nextDeparture(deps, parseTime('08:00')), parseTime('08:00'));
  });
  it('returns null for empty list', () => {
    assert.equal(nextDeparture([], 480), null);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Geo utilities
// ════════════════════════════════════════════════════════════════════════════════

describe('haversineKm', () => {
  // Delhi India Gate (28.6129, 77.2295) to Red Fort (28.6562, 77.2410)
  it('India Gate to Red Fort ~5 km', () => {
    const km = haversineKm(28.6129, 77.2295, 28.6562, 77.2410);
    assert.ok(km > 4.5 && km < 6.0, `Expected ~5 km, got ${km}`);
  });
  it('same point gives 0', () => {
    assert.equal(haversineKm(28.6, 77.2, 28.6, 77.2), 0);
  });
});

describe('travelMinutes', () => {
  it('10 km at 25 km/h = 24 min', () => {
    assert.equal(travelMinutes(10, 25), 24);
  });
  it('returns Infinity for speed 0', () => {
    assert.equal(travelMinutes(5, 0), Infinity);
  });
});

describe('centroid', () => {
  it('computes centroid of two points', () => {
    const c = centroid([{ lat: 10, lng: 20 }, { lat: 20, lng: 40 }]);
    assert.equal(c.lat, 15);
    assert.equal(c.lng, 30);
  });
  it('returns null for empty array', () => {
    assert.equal(centroid([]), null);
  });
});

describe('cosineSimilarity', () => {
  // Same direction: A=(0,0) B=(1,0) C=(2,0) -> cosine = 1
  it('same direction gives 1', () => {
    const cos = cosineSimilarity({lat:0,lng:0},{lat:0,lng:1},{lat:0,lng:2});
    assert.ok(Math.abs(cos - 1) < 1e-9, `Expected 1, got ${cos}`);
  });
  // Perpendicular: A=(0,0) B=(1,0) C=(1,1) -> cosine = 0
  it('perpendicular gives 0', () => {
    const cos = cosineSimilarity({lat:0,lng:0},{lat:0,lng:1},{lat:1,lng:1});
    assert.ok(Math.abs(cos) < 1e-9, `Expected 0, got ${cos}`);
  });
  // Opposite: A=(0,0) B=(1,0) C=(0,0) -> cosine = -1
  it('opposite direction gives -1', () => {
    const cos = cosineSimilarity({lat:0,lng:0},{lat:0,lng:1},{lat:0,lng:0});
    assert.ok(Math.abs(cos + 1) < 1e-9, `Expected -1, got ${cos}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// RNG
// ════════════════════════════════════════════════════════════════════════════════

describe('createRng', () => {
  it('produces deterministic sequence', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    for (let i = 0; i < 10; i++) {
      assert.equal(rng1(), rng2());
    }
  });
  it('produces values in [0,1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `Out of range: ${v}`);
    }
  });
  it('different seeds produce different sequences', () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    // Very unlikely to be identical for 5 calls
    const seq1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
    assert.notDeepEqual(seq1, seq2);
  });
});

describe('shuffle', () => {
  it('shuffles in place and returns same array reference', () => {
    const rng = createRng(42);
    const arr = [1, 2, 3, 4, 5];
    const ref = arr;
    const ret = shuffle(arr, rng);
    assert.equal(ret, ref);
    assert.equal(ret.length, 5);
  });
  it('is deterministic with same seed', () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];
    shuffle(arr1, createRng(42));
    shuffle(arr2, createRng(42));
    assert.deepEqual(arr1, arr2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Config
// ════════════════════════════════════════════════════════════════════════════════

describe('config', () => {
  it('has all 11 B weights', () => {
    for (let k = 1; k <= 11; k++) {
      assert.ok(typeof config.weights[`B${k}`] === 'number', `Missing weight B${k}`);
    }
  });
  it('B weights sum to approximately 1', () => {
    const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-9, `Weights sum ${sum}, expected 1`);
  });
  it('has fares for walk, taxi, transit', () => {
    assert.ok(config.fares.walk);
    assert.ok(config.fares.taxi);
    assert.ok(config.fares.transit);
  });
  it('has speeds for walk, taxi, transit', () => {
    assert.equal(config.speeds.walk,    5);
    assert.equal(config.speeds.taxi,   25);
    assert.equal(config.speeds.transit, 18);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// validateInput
// ════════════════════════════════════════════════════════════════════════════════

// Load generated test data (must run generate.js first or load inline)
function loadSmall() {
  return JSON.parse(readFileSync(join(root, 'data', 'trip_small.json'), 'utf8'));
}
function loadFull() {
  return JSON.parse(readFileSync(join(root, 'data', 'trip_full.json'), 'utf8'));
}

describe('validateInput (trip_small)', () => {
  it('passes validation on well-formed small trip', () => {
    assert.doesNotThrow(() => validateInput(loadSmall()));
  });
});

describe('validateInput (trip_full)', () => {
  it('passes validation on well-formed full trip', () => {
    assert.doesNotThrow(() => validateInput(loadFull()));
  });
});

describe('validateInput – error cases', () => {
  it('throws ValidationError on non-object root', () => {
    assert.throws(() => validateInput(null), ValidationError);
  });

  it('catches missing trip.tripId', () => {
    const data = loadSmall();
    delete data.trip.tripId;
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('tripId')));
  });

  it('catches negative totalBudget', () => {
    const data = loadSmall();
    data.trip.totalBudget = -100;
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('totalBudget')));
  });

  it('catches bad HH:MM time in day.dayStart', () => {
    const data = loadSmall();
    data.days[0].dayStart = '8:00';
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('dayStart')));
  });

  it('catches duration min > max', () => {
    const data = loadSmall();
    data.places[0].duration = { min: 120, ideal: 90, max: 60 };
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('duration')));
  });

  it('catches out-of-range existingInterest', () => {
    const data = loadSmall();
    data.places[0].existingInterest = 1.5;
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('existingInterest')));
  });

  it('catches unknown pool placeId', () => {
    const data = loadSmall();
    data.days[0].pool.push('nonexistent_id');
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('nonexistent_id')));
  });

  it('catches invalid weather condition', () => {
    const data = loadSmall();
    data.context.weather['2026-09-29'].condition = 'tornado';
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('condition')));
  });

  it('catches invalid safety alert level', () => {
    const data = loadSmall();
    data.context.safetyAlerts.push({ placeId: 'museum_a', date: '2026-09-29', level: 'critical' });
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('level')));
  });

  it('catches invalid costPreference value', () => {
    const data = loadSmall();
    data.user.costPreference = 'luxury';
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('costPreference')));
  });

  it('catches duplicate place ids', () => {
    const data = loadSmall();
    data.places.push({ ...data.places[0] });  // duplicate
    let err;
    try { validateInput(data); } catch (e) { err = e; }
    assert.ok(err instanceof ValidationError);
    assert.ok(err.issues.some((i) => i.includes('duplicate')));
  });

  it('ValidationError exposes .issues array', () => {
    const data = loadSmall();
    delete data.trip.tripId;
    let caught;
    try { validateInput(data); } catch (e) { caught = e; }
    assert.ok(caught instanceof ValidationError);
    assert.ok(Array.isArray(caught.issues));
    assert.ok(caught.issues.length > 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// normalizeInput
// ════════════════════════════════════════════════════════════════════════════════

describe('normalizeInput', () => {
  let norm;
  before(() => {
    norm = normalizeInput(loadSmall());
  });

  it('returns trip object with tripId', () => {
    assert.equal(norm.trip.tripId, 'trip_small_001');
  });

  it('places is a Map keyed by id', () => {
    assert.ok(norm.places instanceof Map);
    assert.ok(norm.places.has('museum_a'));
  });

  it('openTime/closeTime are integers (minutes)', () => {
    const p = norm.places.get('museum_a');
    assert.equal(p.openTime,  parseTime('10:00'));
    assert.equal(p.closeTime, parseTime('18:00'));
  });

  it('priority string is normalised to float', () => {
    const p = norm.places.get('museum_a');
    assert.equal(p.priority, 1.0);  // HIGH
    const p2 = norm.places.get('fort_b');
    assert.equal(p2.priority, 0.6); // MEDIUM
  });

  it('day.dayStart/dayEnd are integers', () => {
    const day = norm.days[0];
    assert.equal(day.dayStart, parseTime('08:00'));
    assert.equal(day.dayEnd,   parseTime('20:00'));
  });

  it('travelMatrix.lookup returns valid result', () => {
    const info = norm.travelMatrix.lookup('hotel_small', 'museum_a', 'taxi');
    assert.ok(info !== null);
    assert.equal(info.minutes, 35);  // set explicitly in generator
  });

  it('travelMatrix.lookup returns null for unknown id', () => {
    const info = norm.travelMatrix.lookup('hotel_small', 'nowhere', 'taxi');
    assert.equal(info, null);
  });

  it('user.mustVisit is an array', () => {
    assert.ok(Array.isArray(norm.user.mustVisit));
    assert.ok(norm.user.mustVisit.includes('museum_a'));
  });

  it('meal times are parsed to integers', () => {
    const lunch = norm.user.meals.lunch;
    assert.equal(lunch.windowStart,   parseTime('12:00'));
    assert.equal(lunch.preferredTime, parseTime('13:00'));
  });

  it('deduplication removes duplicate pool entries', () => {
    // trip_full has intentional duplicates in pools (e.g. india_gate twice)
    const fullNorm = normalizeInput(loadFull());
    const seen = new Set();
    for (const day of fullNorm.days) {
      for (const pid of day.pool) {
        assert.ok(!seen.has(pid), `Duplicate pool entry after dedup: ${pid}`);
        seen.add(pid);
      }
    }
  });

  it('dedupLog has entries for duplicate places', () => {
    const fullNorm = normalizeInput(loadFull());
    assert.ok(fullNorm.dedupLog.length > 0, 'Expected dedup log entries');
    assert.ok(fullNorm.dedupLog[0].startsWith('DEDUP:'));
  });

  it('transportServices have integer open/close', () => {
    assert.equal(norm.transportServices.walk.open,    parseTime('05:00'));
    assert.equal(norm.transportServices.transit.close, parseTime('22:00'));
  });

  it('context.closures is a Set', () => {
    assert.ok(norm.context.closures instanceof Set);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// MockProvider
// ════════════════════════════════════════════════════════════════════════════════

describe('MockProvider', () => {
  let provider;
  let locMap;

  before(() => {
    locMap = new Map([
      ['delhi', { lat: 28.6139, lng: 77.2090 }],
      ['gate',  { lat: 28.6129, lng: 77.2295 }],
      ['fort',  { lat: 28.6562, lng: 77.2410 }],
    ]);
    provider = new MockProvider(locMap);
  });

  it('getTravelInfo returns non-null for valid ids', async () => {
    const info = await provider.getTravelInfo('delhi', 'fort', 'taxi');
    assert.ok(info !== null);
    assert.ok(info.minutes > 0);
    assert.ok(info.km > 0);
  });

  it('getTravelInfo returns 0 km for same location', async () => {
    const info = await provider.getTravelInfo('delhi', 'delhi', 'taxi');
    assert.equal(info.km, 0);
  });

  it('getTravelInfo returns null for unknown id', async () => {
    const info = await provider.getTravelInfo('delhi', 'nowhere', 'taxi');
    assert.equal(info, null);
  });

  it('walk mode is slower than taxi', async () => {
    const walk = await provider.getTravelInfo('delhi', 'fort', 'walk');
    const taxi = await provider.getTravelInfo('delhi', 'fort', 'taxi');
    assert.ok(walk.minutes > taxi.minutes, 'Walk should be slower than taxi');
  });

  it('transit mode is slower than taxi', async () => {
    const transit = await provider.getTravelInfo('delhi', 'fort', 'transit');
    const taxi    = await provider.getTravelInfo('delhi', 'fort', 'taxi');
    assert.ok(transit.minutes > taxi.minutes, 'Transit should be slower than taxi');
  });

  it('buildMatrix returns correct shape', async () => {
    const ids   = ['delhi', 'gate', 'fort'];
    const modes = ['walk', 'taxi', 'transit'];
    const mat   = await provider.buildMatrix(ids, modes, locMap);
    assert.deepEqual(mat.ids, ids);
    for (const mode of modes) {
      assert.ok(mat.modes[mode], `Missing mode ${mode}`);
      assert.equal(mat.modes[mode].minutes.length, 3);
      assert.equal(mat.modes[mode].minutes[0].length, 3);
    }
  });

  it('buildMatrix diagonal is 0 minutes', async () => {
    const ids  = ['delhi', 'gate', 'fort'];
    const mat  = await provider.buildMatrix(ids, ['taxi'], locMap);
    for (let i = 0; i < ids.length; i++) {
      assert.equal(mat.modes.taxi.minutes[i][i], 0);
    }
  });

  it('MockProvider and OsrmProvider expose same interface methods', () => {
    const mock = new MockProvider(new Map());
    assert.ok(typeof mock.getTravelInfo === 'function');
    assert.ok(typeof mock.buildMatrix   === 'function');

    // OsrmProvider should also have both (stubbed)
    const osrm = new OsrmProvider('http://localhost', new Map());
    assert.ok(typeof osrm.getTravelInfo === 'function');
    assert.ok(typeof osrm.buildMatrix   === 'function');
  });

  it('matrix is symmetric for haversine distances', async () => {
    const ids  = ['delhi', 'gate'];
    const mat  = await provider.buildMatrix(ids, ['taxi'], locMap);
    const km01 = mat.modes.taxi.km[0][1];
    const km10 = mat.modes.taxi.km[1][0];
    assert.ok(Math.abs(km01 - km10) < 0.001, `Not symmetric: ${km01} vs ${km10}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Data files integrity
// ════════════════════════════════════════════════════════════════════════════════

describe('Generated data files', () => {
  it('trip_small.json has 1 day and 5 places', () => {
    const d = loadSmall();
    assert.equal(d.days.length, 1);
    assert.equal(d.places.length, 5);
  });

  it('trip_full.json has 7 days', () => {
    const d = loadFull();
    assert.equal(d.days.length, 7);
  });

  it('trip_full.json has > 40 unique places', () => {
    const d = loadFull();
    assert.ok(d.places.length > 40, `Expected >40 places, got ${d.places.length}`);
  });

  it('trip_full.json has weather for all 7 days', () => {
    const d = loadFull();
    const weatherDates = Object.keys(d.context.weather);
    assert.equal(weatherDates.length, 7);
  });

  it('trip_full.json storm day is 2026-10-03', () => {
    const d = loadFull();
    assert.equal(d.context.weather['2026-10-03'].condition, 'storm');
  });

  it('trip_full.json has a transit suspension', () => {
    const d = loadFull();
    assert.ok(d.context.transportSuspensions.length > 0);
    assert.equal(d.context.transportSuspensions[0].mode, 'transit');
  });

  it('trip_full.json has a road closure', () => {
    const d = loadFull();
    assert.ok(d.context.roadClosures.length > 0);
  });

  it('trip_full.json has booking slots on Rashtrapati Bhavan', () => {
    const d = loadFull();
    const rb = d.places.find((p) => p.id === 'rashtrapati');
    assert.ok(rb?.booking?.required === true);
    assert.ok(rb.booking.slots.length > 0);
  });

  it('trip_small.json travelMatrix contains all 6 location ids', () => {
    const d = loadSmall();
    assert.ok(d.travelMatrix.ids.includes('hotel_small'));
    assert.ok(d.travelMatrix.ids.includes('museum_a'));
    assert.equal(d.travelMatrix.ids.length, 6);
  });
});
