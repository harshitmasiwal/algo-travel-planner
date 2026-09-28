# KroTravel Algorithm B – Daily Optimization Engine

A complete, runnable Node.js 18+ implementation of the KroTravel trip-planner
optimization pipeline.  Zero runtime dependencies.  ES modules throughout.
Tests use the built-in `node --test`.

---

## Quick Start

```bash
# 1. Generate test data (run once)
node data/generate.js

# 2. Run all tests
node --test test/**/*.test.js

# 3. Plan a trip (Phase 5, CLI)
node src/cli.js data/trip_full.json
```

Node.js ≥ 18.0.0 required.

---

## Project Tree

```
krotravel-algorithm-b/
├── config.js                     All weights, thresholds, fares, speeds, seed
├── package.json
├── README.md
│
├── src/
│   ├── index.js                  planTrip(input, config) – main entry point
│   ├── validateInput.js          JSON schema validation (throws ValidationError)
│   ├── normalizeInput.js         Adapter: raw JSON → internal typed objects
│   │
│   ├── utils/
│   │   ├── time.js               parseTime / formatTime / clamp01 / nextDeparture
│   │   ├── geo.js                haversineKm / centroid / cosineSimilarity
│   │   └── rng.js                Seeded Mulberry32 RNG + Fisher-Yates shuffle
│   │
│   ├── providers/
│   │   ├── travelTimeProvider.js Abstract interface
│   │   ├── mockProvider.js       Haversine + config speeds (no network)
│   │   └── osrmProvider.js       OSRM HTTP wrapper (stubbed, same interface)
│   │
│   ├── constraints/              (Phase 2)
│   │   ├── a1_timeWindows.js
│   │   ├── a2_dayBoundary.js
│   │   ├── a3_visitDuration.js
│   │   ├── a4_budget.js
│   │   ├── a5_availability.js
│   │   ├── a6_transport.js
│   │   ├── a7_booking.js
│   │   ├── a8_mandated.js
│   │   └── a9_safety.js
│   │
│   ├── scoring/                  (Phase 3)
│   │   ├── b1_interest.js … b11_futureValue.js
│   │
│   ├── dayStateManager.js        (Phase 4)
│   ├── candidateGenerator.js
│   ├── feasibilityFilter.js
│   ├── candidateEvaluation.js
│   ├── routeOptimizer.js
│   ├── scheduleBuilder.js
│   ├── masterClock.js
│   ├── forwardSimulation.js
│   ├── backwardValidation.js
│   ├── repairEngine.js           (Phase 5)
│   ├── crossDayReallocation.js
│   ├── globalValidation.js
│   ├── output.js
│   └── cli.js
│
├── data/
│   ├── generate.js               Generates trip_small.json and trip_full.json
│   ├── trip_small.json           1 day, 5 places – spec worked examples
│   └── trip_full.json            7 days, ~80 Delhi places – full scenario
│
└── test/
    ├── phase1.test.js            Utilities, config, validation, providers
    ├── phase2.test.js            A1-A9 constraints (Phase 2)
    ├── phase3.test.js            B1-B11 scoring (Phase 3)
    ├── phase4.test.js            Solver pipeline (Phase 4)
    └── phase5.test.js            Repair, reallocation, output (Phase 5)
```

---

## Configuration (`config.js`)

Every tuneable value lives in `config.js`.  Key sections:

| Section | Key variables |
|---|---|
| Solver | `seed`, `exactSolverMaxPlaces`, `localSearchTimeLimitMs` |
| Transport | `speeds`, `fares`, `defaultServiceWindows` |
| Safety | `extremeHeatC`, `stormBlockedModes`, `stormOutdoorThreshold` |
| Budget | `costPreferenceFractions` |
| Reallocation | `maxReallocKm` |
| Slack | `fragileSlackMin` |
| B-score weights | `weights.B1` … `weights.B11` |
| Sub-weights | `b1`, `b2`, `b4`, `b5`, `b6`, `b7`, `b8`, `b9`, `b10`, `b11` |

---

## Formula Traceability

| Formula / Concept | Prompt Section | Module |
|---|---|---|
| A1 time-window propagation | `## A1 Time windows` | `constraints/a1_timeWindows.js` |
| A2 day boundary | `## A2 Day boundary` | `constraints/a2_dayBoundary.js` |
| A3 visit duration bounds | `## A3 Visit duration` | `constraints/a3_visitDuration.js` |
| A4 budget C_total | `## A4 Budget` | `constraints/a4_budget.js` |
| A5 availability A_i | `## A5 Location / availability` | `constraints/a5_availability.js` |
| A6 transport F_ijm | `## A6 Transport feasibility` | `constraints/a6_transport.js` |
| A7 booking F_ik | `## A7 Booking / reservation` | `constraints/a7_booking.js` |
| A8 mustVisit / mustAvoid | `## A8 User-mandated` | `constraints/a8_mandated.js` |
| A9 safety F_i = S·O·E·H | `## A9 Safety / environmental` | `constraints/a9_safety.js` |
| B1 S'_i category/interest | `## B1 User interest` | `scoring/b1_interest.js` |
| B2 P'_i priority + modifiers | `## B2 Place priority` | `scoring/b2_priority.js` |
| B3 duration preference | `## B3 Visit-duration preference` | `scoring/b3_duration.js` |
| B4 E_ij travel efficiency | `## B4 Travel efficiency` | `scoring/b4_travelEfficiency.js` |
| B5 waiting W/W_tol | `## B5 Waiting preference` | `scoring/b5_waiting.js` |
| B6 meal S_m | `## B6 Meal preference` | `scoring/b6_meal.js` |
| B7 cost S vs [C_pref_min, C_pref_max] | `## B7 Cost preference` | `scoring/b7_cost.js` |
| B8 S_ijm transport | `## B8 Transport preference` | `scoring/b8_transport.js` |
| B9 S_adjusted weather | `## B9 Weather preference` | `scoring/b9_weather.js` |
| B10 C_j continuity | `## B10 Route continuity` | `scoring/b10_continuity.js` |
| B11 V_after future value | `## B11 Future-day / remaining-route value` | `scoring/b11_futureValue.js` |
| Route objective | `## Route objective` | `candidateEvaluation.js` |
| Confidence formula | `DECISIONS` (confidence paragraph) | `output.js` |
| Haversine / mock matrix | `DECISIONS` (transport speeds) | `providers/mockProvider.js` |
| Transport cost C_ij | `DECISIONS` (transport cost) | `constraints/a4_budget.js` |
| Budget reserve for must-visits | `DECISIONS` (budget) | `constraints/a4_budget.js` |
| Cross-day reallocation | `DECISIONS` (cross-day) | `crossDayReallocation.js` |
| Deduplication | `DECISIONS` (each place ≤ once) | `normalizeInput.js` |
| Storm H_i = 0 | `DECISIONS` (weather split) | `constraints/a9_safety.js` |
| Backward validation LS_i | `SOLVER AND PIPELINE §3` | `backwardValidation.js` |
| Repair order | `SOLVER AND PIPELINE §4` | `repairEngine.js` |

---

## Test Coverage

Tests use `node --test` (no external framework).

| Phase | File | Tests |
|---|---|---|
| 1 | `test/phase1.test.js` | 83 tests – utilities, config, validation, normalizer, providers, data files |
| 2 | `test/phase2.test.js` | A1-A9 constraints with spec exact numbers |
| 3 | `test/phase3.test.js` | B1-B11 scoring with spec exact numbers (tol 0.005) |
| 4 | `test/phase4.test.js` | Solver pipeline, schedule builder, simulations |
| 5 | `test/phase5.test.js` | Repair engine, reallocation, global validation, output |

---

## Design Notes

### Determinism
Every random choice is driven by `createRng(config.seed)` (Mulberry32).
Same `(input, seed)` always produces the same plan.

### Solver strategy
- **≤ 10 feasible places**: exact depth-first branch-and-bound, pruned by
  upper-bound on remaining objective.
- **> 10 places**: greedy nearest-feasible insertion then local search
  (relocate, swap, 2-opt, drop/add), time-limited to `config.localSearchTimeLimitMs`.
- ALNS hook: `routeOptimizer.js` exports a `registerALNSOperator(fn)` stub.

### Transport cost
```
C_ij = baseFare[mode] + perKm[mode] * km
```
Entry cost and meal cost are multiplied by `trip.partySize` when `perPerson=true`
for that cost type (transit: yes; taxi: no).

### Budget reserve
For day d:  
`B = min(dailyBudget ?? Infinity, totalBudget − spentEarlier − reserveFutureMust)`  
where `reserveFutureMust = sum of entry costs of must-visit places not yet
scheduled on days d+1 … D`.

### Meal insertion
When a restaurant from the pool fits the meal window (A1-feasible) it is
preferred.  Otherwise an abstract meal block is inserted at the current
location with zero travel time, `avgCost`, and `durationMin` from
`user.meals.<type>`.

### Cross-day reallocation
Overflow places are tried on other days in ascending-centroid-distance order,
limited to `config.maxReallocKm`.  `eligibleDays` is a hard gate.
A valid day is never broken.

---

## Assumptions (per spec: "pick a sensible default")

| Topic | Assumption / default |
|---|---|
| HH:MM format | Strictly two-digit hour: `DD:MM` (single-digit hour is rejected) |
| Modes list | `['walk', 'taxi', 'transit']` – extensible via `config.speeds` |
| Transit directness thresholds | ≤10 km direct, ≤20 km partial, >20 km indirect |
| Transit transfers | 0 / 1 / 2 matching the directness bands |
| `perPerson` flag | `taxi: false`, `transit: true`, `walk: false` |
| Walk cost | Always 0 (baseFare=0, perKm=0) |
| `fullDurationInSlot` | `true` – `finish_i ≤ slot.end` required |
| Abstract meal location | Current position at meal time (zero travel) |
| Meal type keys | `lunch`, `dinner` (additional keys ignored unless present in input) |
| Day centroid | Mean lat/lng of all pool places for that day |
| `V_i` denominator = 0 in B11 | Component contributes 1.0 (fully preserved) |
| `d_ideal == d_min` in B3 | Clamp prevents division by zero (returns 0 for d < d_ideal) |
| `B_ij` (backtracking) | Fraction of already-visited stops closer to next candidate than current |
| OsrmProvider transfers | Always 0 (OSRM does not expose transit transfers) |
| bookingTime absent | Defaults to `new Date()` at normalisation time |

---

## Known PDF Errors (do not use these values in tests)

| Location | PDF value | Correct value |
|---|---|---|
| A1 example waiting | 55 min | **85 min** (arrival 08:35, opens 10:00) |
| A2 example total | 335 min | **310 min** (75+40+180+15) |
| B4 candidates 2 & 3 | 0.60, 0.20 | **0.6417, 0.08** |
| B6 worked example | 0.935 | **0.9551** |
| B8 cab row | 0.76 | **0.79** |
| B8 bus row | 0.36 | **0.3695** |
| B9 good-weather Osens=1 | 0.846 | **0.852** |
| B9 Osens=0.2 | 0.89 | **0.908** |
