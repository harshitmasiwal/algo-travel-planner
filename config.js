/**
 * config.js – Central configuration for Algorithm B.
 * ALL weights, tolerances, fares, thresholds, and flags live here.
 * Change a value here; do NOT hard-code it in any algorithm module.
 */

export const config = {

  // ── General ──────────────────────────────────────────────────────────────
  seed: 42,                          // RNG seed for determinism
  timezone: 'Asia/Kolkata',          // IANA timezone for display
  currency: 'INR',

  // ── Solver ───────────────────────────────────────────────────────────────
  exactSolverMaxPlaces: 10,          // use exact DFS/B&B when feasible pool <= this
  localSearchTimeLimitMs: 1800,      // time limit for greedy + local search
  localSearchIterations: 5000,       // max LS iterations (safety cap)

  // ── Transport speeds (km/h) for mock/haversine matrix ────────────────────
  speeds: {
    walk:    5,
    taxi:   25,
    transit: 18,
  },

  // ── Transport fares (INR) ─────────────────────────────────────────────────
  // cost = baseFare + perKm * km   (per trip, not per person unless perPerson=true)
  fares: {
    walk:    { baseFare: 0,  perKm: 0,   perPerson: false },
    transit: { baseFare: 10, perKm: 2,   perPerson: true  },
    taxi:    { baseFare: 40, perKm: 15,  perPerson: false },
  },

  // ── Transport service windows (defaults – overridden by input) ────────────
  defaultServiceWindows: {
    walk:    { open: '05:00', close: '23:59' },
    transit: { open: '06:00', close: '22:00' },
    taxi:    { open: '00:00', close: '23:59' },
  },

  // ── Weather / safety thresholds ───────────────────────────────────────────
  extremeHeatC: 45,                  // tempC >= this triggers hard hazard
  // modes blocked during storm/extreme heat (H_i = 0 for walk)
  stormBlockedModes: ['walk'],
  // outdoorSensitivity threshold above which storm blocks the place
  stormOutdoorThreshold: 0.5,

  // ── Budget ────────────────────────────────────────────────────────────────
  // costPreference -> fraction of daily budget as preferred range
  costPreferenceFractions: {
    budget:   { min: 0.3, max: 0.6 },
    balanced: { min: 0.5, max: 0.8 },
    premium:  { min: 0.7, max: 1.0 },
  },

  // ── Reallocation ──────────────────────────────────────────────────────────
  maxReallocKm: 25,                  // max centroid distance for cross-day reallocation

  // ── Booking ───────────────────────────────────────────────────────────────
  fullDurationInSlot: true,          // finish_i <= slot.end is required

  // ── Repair engine ────────────────────────────────────────────────────────
  repairStepsOrder: [
    'reduceWaiting',
    'changeTransportMode',
    'reorderRoute',
    'adjustDurations',
    'shiftMealTiming',
    'removeLowestValueStop',
    'moveStopToAnotherDay',
    'reOptimize',
  ],

  // ── Backward validation / slack ───────────────────────────────────────────
  fragileSlackMin: 20,               // minutes; stop is "fragile" if slack < this

  // ── B11 future-value ──────────────────────────────────────────────────────
  highValueThreshold: 0.7,           // V_i >= this => "high-value" place

  // ── Confidence formula weights ────────────────────────────────────────────
  confidence: {
    mustVisitWeight:      0.35,
    meanSlackWeight:      0.30,
    fragileStopWeight:    0.20,
    freshnessWeight:      0.15,
    freshnessMaxAgeDays:  7,          // data older than 7 days => freshness 0
  },

  // ── Soft-objective weights (B1-B11, sum = 1) ─────────────────────────────
  weights: {
    B1: 0.20,
    B2: 0.10,
    B3: 0.08,
    B4: 0.12,
    B5: 0.08,
    B6: 0.08,
    B7: 0.08,
    B8: 0.06,
    B9: 0.08,
    B10: 0.06,
    B11: 0.06,
  },

  // ── B1 User Interest weights ──────────────────────────────────────────────
  b1: {
    w_c: 0.60,   // category score weight
    w_I: 0.25,   // existingInterest weight
    w_K: 0.15,   // explicit keyword match weight
    w_D: 0.20,   // dislike penalty weight
    // sub-category and tag match multipliers
    m_sub: 0.80,
    m_tag: 0.70,
  },

  // ── B2 Place Priority weights ─────────────────────────────────────────────
  b2: {
    base: { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 },
    modifierWeights: {
      flagship: 0.2,
      unesco:   0.2,
      mustSee:  0.1,
      seasonal: 0.1,
      campaign: 0.1,
    },
  },

  // ── B3 Visit-duration preference ─────────────────────────────────────────
  // (no extra weights; formula is fully specified by d_min, d_ideal, d_max)

  // ── B4 Travel efficiency weights ─────────────────────────────────────────
  b4: {
    w_T: 0.35,   // time efficiency
    w_D: 0.25,   // distance efficiency
    w_B: 0.20,   // backtracking penalty
    w_C: 0.20,   // continuity (from B10 C_j)
  },

  // ── B5 Waiting preference ─────────────────────────────────────────────────
  b5: {
    // component weights (opening, transport, meal)
    w_o: 0.50,
    w_t: 0.30,
    w_m: 0.20,
    useExponential: false,   // if true: e^{-W/tau} instead of linear
    tau: 30,                 // for exponential mode
  },

  // ── B6 Meal preference weights ────────────────────────────────────────────
  b6: {
    w_t:    0.30,   // time preference
    w_type: 0.30,   // cuisine/diet type match
    w_loc:  0.20,   // location convenience
    w_d:    0.20,   // duration preference
    // S_type scores
    typeScores: {
      exact:   1.0,
      similar: 0.7,
      generic: 0.3,
      mismatch: 0.0,
    },
    // S_loc by distance bands (km upper bound -> score)
    locBands: [
      { maxKm: 0.5, score: 1.0 },
      { maxKm: 1.0, score: 0.8 },
      { maxKm: 2.0, score: 0.6 },
      { maxKm: 5.0, score: 0.4 },
      { maxKm: Infinity, score: 0.2 },
    ],
    scenicInScenicScore: 1.0,
    cityVsSuburbanScore: 0.3,
  },

  // ── B7 Cost preference ────────────────────────────────────────────────────
  b7: {
    costSensitivity: 0.5,   // q in [0,1]; 0 = ignore cost deviation
  },

  // ── B8 Transport preference weights ──────────────────────────────────────
  b8: {
    w_m: 0.40,   // mode preference
    w_c: 0.25,   // comfort
    w_t: 0.15,   // transfer penalty
    w_d: 0.20,   // directness
    // S_mode lookup (keyword -> score)
    modeScores: {
      preferred:  1.0,
      acceptable: 0.65,   // midpoint of 0.5-0.8
      low:        0.25,   // midpoint of 0.1-0.4
      avoided:    0.0,
    },
    // comfort scores per (comfortPreference, mode) – configurable matrix
    comfortMatrix: {
      premium:  { walk: 0.6, transit: 0.5, taxi: 1.0 },
      standard: { walk: 0.7, transit: 0.8, taxi: 0.7 },
      basic:    { walk: 0.9, transit: 0.9, taxi: 0.5 },
    },
    // directness text -> score
    directnessScores: { direct: 1.0, partial: 0.5, indirect: 0.0 },
  },

  // ── B9 Weather preference weights ─────────────────────────────────────────
  b9: {
    w_T: 0.40,   // temperature
    w_R: 0.40,   // rain
    w_W: 0.20,   // wind
    // condition -> {rain, wind} (overridden by explicit context values)
    conditionMap: {
      clear:       { rain: 0.0, wind: 0.1 },
      cloudy:      { rain: 0.1, wind: 0.2 },
      rain:        { rain: 0.5, wind: 0.3 },
      heavy_rain:  { rain: 0.8, wind: 0.5 },
      heat:        { rain: 0.0, wind: 0.1 },
      storm:       { rain: 1.0, wind: 0.9 },
    },
  },

  // ── B10 Route continuity weights ─────────────────────────────────────────
  b10: {
    w_d: 0.35,   // direction (D_j)
    w_b: 0.25,   // backtrack penalty
    w_c: 0.20,   // cluster proximity
    w_r: 0.20,   // reversal (D_j again, used as S_reversal)
    sigmaC: 3.0, // cluster centroid sigma (km)
  },

  // ── B11 Future-value weights ──────────────────────────────────────────────
  b11: {
    w_p:  0.60,   // priority weight in V_i
    w_u:  0.40,   // interest weight in V_i
    w_r:  0.30,   // remaining-today component
    w_f:  0.25,   // future-days component
    w_c:  0.20,   // cluster value component
    w_h:  0.25,   // high-value component
  },

  // ── Route objective N_route scaling ──────────────────────────────────────
  // route-level scores (B5, B6, B7) multiplied by max(1, nStops)
  routeLevelNormalize: true,

};

export default config;
