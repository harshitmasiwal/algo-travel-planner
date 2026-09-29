/**
 * test/phase3.test.js
 * Phase 3 – B1-B11 Soft Objective Scoring Tests
 * Run: node --test test/phase3.test.js
 *
 * Tolerance: ±0.005 for all floating-point comparisons.
 * All expected values derived from spec formulas + config.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scoreInterest }         from '../src/scoring/b1_interest.js';
import { scorePriority }         from '../src/scoring/b2_priority.js';
import { scoreDuration }         from '../src/scoring/b3_duration.js';
import { scoreTravelEfficiency } from '../src/scoring/b4_travelEfficiency.js';
import { scoreWaiting }          from '../src/scoring/b5_waiting.js';
import { scoreMeal }             from '../src/scoring/b6_meal.js';
import { scoreCost }             from '../src/scoring/b7_cost.js';
import { scoreTransport }        from '../src/scoring/b8_transport.js';
import { scoreWeather }          from '../src/scoring/b9_weather.js';
import { scoreContinuity }       from '../src/scoring/b10_continuity.js';
import { placeValue, scoreFutureValue } from '../src/scoring/b11_futureValue.js';
import config                    from '../config.js';

const TOL = 0.005;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, `${msg ?? ''}: |${a} - ${b}| > ${TOL}`);

// ════════════════════════════════════════════════════════════════════════════════
// Shared fixtures
// ════════════════════════════════════════════════════════════════════════════════

const fort = {
  id: 'fort_a', name: 'Red Fort', category: 'fort',
  subCategories: ['mughal', 'heritage'], tags: ['UNESCO', 'history'],
  priority: 'HIGH',
  modifiers: { flagship: 1, unesco: 1, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.2,
  outdoorSensitivity: 0.8,
  duration: { min: 60, ideal: 120, max: 180 },
  lat: 28.6562, lng: 77.2410,
};

const museum = {
  id: 'museum_a', name: 'National Museum', category: 'museum',
  subCategories: ['art', 'history'], tags: ['culture'],
  priority: 'MEDIUM',
  modifiers: { flagship: 0, unesco: 0, mustSee: 1, seasonal: 0, campaign: 0 },
  existingInterest: 0.5,
  outdoorSensitivity: 0.1,
  duration: { min: 60, ideal: 150, max: 240 },
  lat: 28.6116, lng: 77.2196,
};

const market = {
  id: 'market_a', name: 'Sarojini Market', category: 'market',
  subCategories: ['shopping'], tags: ['bargain'],
  priority: 'LOW',
  modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
  existingInterest: 0.1,
  outdoorSensitivity: 0.3,
  duration: { min: 30, ideal: 60, max: 120 },
  lat: 28.5706, lng: 77.1900,
};

const restaurant = {
  id: 'rest_a', name: 'Karim Hotel', category: 'restaurant',
  subCategories: ['mughlai', 'north_indian'], tags: ['biryani'],
  priority: 'MEDIUM',
  modifiers: { flagship: 0, unesco: 0, mustSee: 0, seasonal: 0, campaign: 0 },
  existingInterest: 0,
  outdoorSensitivity: 0,
  diet: 'nonveg',
  duration: { min: 30, ideal: 45, max: 90 },
  lat: 28.6517, lng: 77.2321,
};

const userHistoryLover = {
  interests: { history: 0.9, architecture: 0.8, museum: 0.7, nature: 0.3, shopping: 0.1 },
  explicitInterests: ['mughal', 'heritage', 'UNESCO'],
  dislikes: ['shopping', 'market'],
  modePreference: { taxi: 'preferred', transit: 'acceptable', walk: 'low' },
  comfortPreference: 'standard',
  transferTolerance: 2,
  maxWalkKm: 1.5,
  waitingToleranceMin: 20,
  costPreference: 'balanced',
  preferredCostRange: null,
  weather: { tempPrefMin: 20, tempPrefMax: 32, coldTol: 8, heatTol: 8, rainTol: 0.5, windTol: 0.4 },
  meals: {
    lunch: {
      windowStart: '12:00', windowEnd: '14:30', preferredTime: '13:00',
      timeTolerance: 60, durationMin: 45, durationTolerance: 30,
      diet: 'nonveg', cuisines: ['north_indian', 'mughlai'],
      locationPref: 'near_next_attraction', avgCost: 500,
    },
  },
};

// ════════════════════════════════════════════════════════════════════════════════
// B1 – User Interest
// ════════════════════════════════════════════════════════════════════════════════

describe('B1 scoreInterest — fort (history lover)', () => {
  // S_c: category 'fort' not in interests → 0; sub 'mughal' not in interests → 0;
  //      sub 'heritage' not in interests → 0; tag 'UNESCO' not → 0; tag 'history' → 0.9
  //      m_tag=0.70 → S_c = min(1, 0 + 0.70*0.9) = 0.63
  // novelty = 1 - 0.2 = 0.8
  // S_K: keywords=['mughal','heritage','UNESCO']; all 3 match (subCats + tags) → 3/3=1.0
  // D_i: dislikes=['shopping','market']; fort has none → 0
  // raw = 0.60*0.63 + 0.25*0.8 + 0.15*1.0 - 0.20*0 = 0.378+0.2+0.15 = 0.728
  const { score, breakdown } = scoreInterest(fort, userHistoryLover);

  it('S_c close to 0.63',     () => near(breakdown.S_c,    0.63,  'S_c'));
  it('novelty close to 0.8',  () => near(breakdown.novelty, 0.8,  'novelty'));
  it('S_K close to 1.0',      () => near(breakdown.S_K,    1.0,   'S_K'));
  it('D_i = 0',               () => assert.equal(breakdown.D_i, 0));
  it('final score ~0.728',    () => near(score, 0.728, 'B1 fort'));
});

describe('B1 scoreInterest — museum', () => {
  // S_c: category 'museum' → 0.7; sub 'art' not in interests; sub 'history' → m_sub*0.9=0.72 → 0.7+0.72>1→1.0(capped)
  //      Actually: S_c = min(1, 0.7 + 0.80*0.9) = min(1, 0.7+0.72) = 1.0
  // novelty = 1 - 0.5 = 0.5
  // S_K: keywords=['mughal','heritage','UNESCO']; none match museum subCats/tags → 0
  // D_i = 0
  // raw = 0.60*1.0 + 0.25*0.5 + 0.15*0 - 0.20*0 = 0.6+0.125 = 0.725
  const { score, breakdown } = scoreInterest(museum, userHistoryLover);

  it('S_c = 1.0 (capped)', () => near(breakdown.S_c, 1.0, 'S_c museum'));
  it('novelty = 0.5',      () => near(breakdown.novelty, 0.5, 'novelty'));
  it('S_K = 0',            () => near(breakdown.S_K, 0, 'S_K'));
  it('score ~0.725',       () => near(score, 0.725, 'B1 museum'));
});

describe('B1 scoreInterest — market (disliked)', () => {
  // user.interests has shopping:0.1 → S_c = 0.1 (market category matches 'shopping' subCat)
  // But 'market' category directly not in interests; subCat 'shopping' IS in interests: 0.1
  // S_c = min(1, 0 + 0.80*0.1) = 0.08   (m_sub=0.80 for subCat 'shopping')
  // novelty = 1 - 0.1 = 0.9
  // S_K = 0 (no keywords match market/bargain)
  // D_i = 1 (category 'market' in dislikes)
  // raw = 0.60*0.08 + 0.25*0.9 + 0 - 0.20*1 = 0.048+0.225-0.2 = 0.073
  const { score, breakdown } = scoreInterest(market, userHistoryLover);

  it('D_i = 1 (disliked category)', () => assert.equal(breakdown.D_i, 1));
  it('score ~0.073',                 () => near(score, 0.073, 'B1 market'));
});

describe('B1 scoreInterest — no interests/keywords/dislikes', () => {
  const bareUser = { interests: {}, explicitInterests: [], dislikes: [] };
  const { score } = scoreInterest(fort, bareUser);
  // S_c=0, novelty=0.8, S_K=0, D_i=0 → 0+0.25*0.8+0+0=0.2
  it('score = 0.2 (only novelty)', () => near(score, 0.2, 'bare user'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B2 – Place Priority
// ════════════════════════════════════════════════════════════════════════════════

describe('B2 scorePriority — HIGH fort with all modifiers', () => {
  // base=1.0; flagship=0.2*1+unesco=0.2*1+mustSee=0.1*1+seasonal=0+campaign=0 = 0.5
  // raw = 1.0+0.5=1.5 → capped to 1.0
  const { score, breakdown } = scorePriority(fort);

  it('baseScore = 1.0',    () => assert.equal(breakdown.baseScore, 1.0));
  it('modSum = 0.5',       () => near(breakdown.modSum, 0.5, 'modSum'));
  it('score capped to 1.0',() => assert.equal(score, 1.0));
});

describe('B2 scorePriority — MEDIUM museum (mustSee only)', () => {
  // base=0.6; mustSee=0.1*1 → modSum=0.1 → raw=0.7
  const { score, breakdown } = scorePriority(museum);

  it('baseScore = 0.6',  () => assert.equal(breakdown.baseScore, 0.6));
  it('modSum = 0.1',     () => near(breakdown.modSum, 0.1, 'modSum museum'));
  it('score = 0.7',      () => near(score, 0.7, 'B2 museum'));
});

describe('B2 scorePriority — LOW market no modifiers', () => {
  // base=0.3; modSum=0 → 0.3
  const { score } = scorePriority(market);
  it('score = 0.3', () => near(score, 0.3, 'B2 market'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B3 – Visit-Duration Preference
// ════════════════════════════════════════════════════════════════════════════════

describe('B3 scoreDuration — at ideal', () => {
  // fort: min=60, ideal=120, max=180; d=120 → score=1.0
  const { score } = scoreDuration(120, fort.duration);
  it('score = 1.0 at ideal', () => assert.equal(score, 1.0));
});

describe('B3 scoreDuration — at min', () => {
  // d=60 → (60-60)/(120-60) = 0
  const { score } = scoreDuration(60, fort.duration);
  it('score = 0.0 at min', () => assert.equal(score, 0));
});

describe('B3 scoreDuration — midpoint rising', () => {
  // d=90 → (90-60)/(120-60) = 0.5
  const { score } = scoreDuration(90, fort.duration);
  it('score = 0.5 at midpoint rising', () => near(score, 0.5, 'B3 rising mid'));
});

describe('B3 scoreDuration — midpoint falling', () => {
  // d=150 → 1-(150-120)/(180-120) = 1-0.5 = 0.5
  const { score } = scoreDuration(150, fort.duration);
  it('score = 0.5 at midpoint falling', () => near(score, 0.5, 'B3 falling mid'));
});

describe('B3 scoreDuration — at max', () => {
  // d=180 → 1-(180-120)/(180-120) = 0
  const { score } = scoreDuration(180, fort.duration);
  it('score = 0.0 at max', () => near(score, 0, 'B3 at max'));
});

describe('B3 scoreDuration — out of bounds', () => {
  const { score } = scoreDuration(30, fort.duration);  // below min
  it('score = 0 below min', () => assert.equal(score, 0));
  const { score: s2 } = scoreDuration(200, fort.duration); // above max
  it('score = 0 above max', () => assert.equal(s2, 0));
});

// ════════════════════════════════════════════════════════════════════════════════
// B4 – Travel Efficiency
// ════════════════════════════════════════════════════════════════════════════════

describe('B4 scoreTravelEfficiency — efficient leg', () => {
  // travelMin=20, visitMin=120 → T_eff=1-20/120=0.833
  // km=3, dRef=20  → D_eff=1-3/20=0.85
  // no backtrack    → B_ij=0 → (1-B_ij)=1
  // C_j=1 (default)
  // score = 0.35*0.833 + 0.25*0.85 + 0.20*1 + 0.20*1 = 0.2917+0.2125+0.2+0.2=0.9042
  const { score, breakdown } = scoreTravelEfficiency({
    travelMin: 20, km: 3, visitMin: 120,
    visitedKmToNext: [], currentKmToNext: 3,
  });
  it('T_eff ~0.8333', () => near(breakdown.T_eff, 0.8333, 'T_eff'));
  it('D_eff = 0.85',  () => near(breakdown.D_eff, 0.85,   'D_eff'));
  it('B_ij = 0',      () => assert.equal(breakdown.B_ij, 0));
  it('score ~0.904',  () => near(score, 0.9042, 'B4 efficient'));
});

describe('B4 scoreTravelEfficiency — backtracking', () => {
  // travelMin=60, visitMin=60 → T_eff=0
  // km=18 → D_eff=1-18/20=0.1
  // 2 of 3 visited stops closer to next → B_ij=2/3
  // C_j=0.5
  // score = 0.35*0 + 0.25*0.1 + 0.20*(1-0.667) + 0.20*0.5 = 0+0.025+0.0667+0.1=0.1917
  const { score, breakdown } = scoreTravelEfficiency({
    travelMin: 60, km: 18, visitMin: 60,
    visitedKmToNext: [2, 3, 20],  // 2 closer than current(10)
    currentKmToNext: 10,
    C_j: 0.5,
  });
  it('B_ij ~0.667',  () => near(breakdown.B_ij, 0.6667, 'B_ij'));
  it('score ~0.192', () => near(score, 0.1917, 'B4 backtrack'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B5 – Waiting Preference
// ════════════════════════════════════════════════════════════════════════════════

describe('B5 scoreWaiting — no waiting', () => {
  const { score } = scoreWaiting({ openingWaitMin: 0, transportWaitMin: 0, mealWaitMin: 0 }, userHistoryLover);
  it('score = 1.0 with no waiting', () => assert.equal(score, 1.0));
});

describe('B5 scoreWaiting — 20 min opening wait (= tolerance)', () => {
  // W_tol=20; S_o = max(0,1-20/20) = 0; S_t=1; S_m=1
  // score = 0.5*0 + 0.3*1 + 0.2*1 = 0.5
  const { score, breakdown } = scoreWaiting(
    { openingWaitMin: 20, transportWaitMin: 0, mealWaitMin: 0 },
    userHistoryLover,
  );
  it('S_o = 0 at tolerance',  () => near(breakdown.S_o, 0, 'S_o'));
  it('score = 0.5',           () => near(score, 0.5, 'B5 opening wait=tol'));
});

describe('B5 scoreWaiting — 10 min opening wait', () => {
  // S_o = 1-10/20 = 0.5; S_t=S_m=1
  // score = 0.5*0.5 + 0.3*1 + 0.2*1 = 0.25+0.3+0.2 = 0.75
  const { score } = scoreWaiting(
    { openingWaitMin: 10, transportWaitMin: 0, mealWaitMin: 0 },
    userHistoryLover,
  );
  it('score = 0.75', () => near(score, 0.75, 'B5 10min wait'));
});

describe('B5 scoreWaiting — mixed waits', () => {
  // openWait=10→S_o=0.5, transWait=5→S_t=1-5/20=0.75, mealWait=20→S_m=0
  // score = 0.5*0.5 + 0.3*0.75 + 0.2*0 = 0.25+0.225 = 0.475
  const { score } = scoreWaiting(
    { openingWaitMin: 10, transportWaitMin: 5, mealWaitMin: 20 },
    userHistoryLover,
  );
  it('score ~0.475', () => near(score, 0.475, 'B5 mixed'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B6 – Meal Preference
// ════════════════════════════════════════════════════════════════════════════════

const lunchPref = userHistoryLover.meals.lunch;

describe('B6 scoreMeal — perfect restaurant match', () => {
  // place=restaurant (north_indian/mughlai, nonveg) at km=0.3 from next attraction
  // actualStart = 13:00 = 780 min, preferred=13:00 → S_t=1
  // cuisine match: north_indian exact → S_type=1.0
  // km=0.3 → locBand ≤0.5 → S_loc=1.0
  // actualDur=45=ideal → S_d=1.0
  // score = 0.30*1+0.30*1+0.20*1+0.20*1 = 1.0
  const { score, breakdown } = scoreMeal({
    place: restaurant,
    mealType: 'lunch',
    actualStartMin: 780,   // 13:00
    actualDurMin:   45,
    kmToMeal:       0.3,
    mealPref:       lunchPref,
  });
  it('S_t = 1.0',    () => near(breakdown.S_t,    1.0, 'S_t'));
  it('S_type = 1.0', () => near(breakdown.S_type, 1.0, 'S_type'));
  it('S_loc = 1.0',  () => near(breakdown.S_loc,  1.0, 'S_loc'));
  it('S_d = 1.0',    () => near(breakdown.S_d,    1.0, 'S_d'));
  it('score = 1.0',  () => near(score, 1.0, 'B6 perfect'));
});

describe('B6 scoreMeal — late lunch, far restaurant', () => {
  // actualStart=14:30=870; preferred=780(13:00); timeTol=60; diff=90>60 → S_t=0
  // S_type=1.0 (north_indian exact)
  // km=4.0 → locBand ≤5.0 → S_loc=0.4
  // dur=60>45, dTol=30 → d_max=75; S_d=1-(60-45)/30=0.5
  // score = 0.30*0+0.30*1+0.20*0.4+0.20*0.5 = 0+0.3+0.08+0.1=0.48
  const { score, breakdown } = scoreMeal({
    place: restaurant,
    mealType: 'lunch',
    actualStartMin: 870,  // 14:30
    actualDurMin:   60,
    kmToMeal:       4.0,
    mealPref:       lunchPref,
  });
  it('S_t = 0 (out of tolerance)',   () => near(breakdown.S_t, 0, 'S_t late'));
  it('S_loc = 0.4 (4km band)',       () => near(breakdown.S_loc, 0.4, 'S_loc far'));
  it('score ~0.48',                  () => near(score, 0.48, 'B6 late far'));
});

describe('B6 scoreMeal — abstract meal block (non-restaurant)', () => {
  // category != restaurant → S_type = generic = 0.3
  // actualStart=780 → S_t=1; km=0 → S_loc=1.0; dur=45 → S_d=1.0
  // score=0.30*1+0.30*0.3+0.20*1+0.20*1=0.3+0.09+0.2+0.2=0.79
  const abstractMeal = { ...fort, category: 'abstract_meal' };
  const { score, breakdown } = scoreMeal({
    place: abstractMeal,
    mealType: 'lunch',
    actualStartMin: 780,
    actualDurMin: 45,
    kmToMeal: 0,
    mealPref: lunchPref,
  });
  it('S_type = 0.3 (generic/abstract)', () => near(breakdown.S_type, 0.3, 'S_type abstract'));
  it('score ~0.79',                     () => near(score, 0.79, 'B6 abstract'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B7 – Cost Preference
// ════════════════════════════════════════════════════════════════════════════════

describe('B7 scoreCost — balanced within preferred range', () => {
  // dailyBudget=5000; balanced fracs: min=0.5→2500, max=0.8→4000
  // C_actual=3500 → in range → score=1
  const { score } = scoreCost({ C_actual: 3500, dailyBudget: 5000, user: userHistoryLover });
  it('score = 1.0 when in range', () => assert.equal(score, 1.0));
});

describe('B7 scoreCost — below preferred range', () => {
  // C_pref_min=2500; C_actual=1000 < 2500
  // deviation = (2500-1000)/2500 = 0.6; q=0.5; score = 1-0.5*0.6 = 0.7
  const { score } = scoreCost({ C_actual: 1000, dailyBudget: 5000, user: userHistoryLover });
  it('score = 0.7 (below range)', () => near(score, 0.7, 'B7 below'));
});

describe('B7 scoreCost — above preferred range', () => {
  // C_pref_max=4000; C_actual=6000 > 4000
  // deviation = (6000-4000)/4000 = 0.5; q=0.5; score = 1-0.5*0.5 = 0.75
  const { score } = scoreCost({ C_actual: 6000, dailyBudget: 5000, user: userHistoryLover });
  it('score = 0.75 (above range)', () => near(score, 0.75, 'B7 above'));
});

describe('B7 scoreCost — explicit preferred cost range', () => {
  const user = { ...userHistoryLover, preferredCostRange: { min: 1000, max: 3000 } };
  // C_actual=2000 → in range → 1.0
  const { score } = scoreCost({ C_actual: 2000, dailyBudget: 5000, user });
  it('score = 1.0 in explicit range', () => assert.equal(score, 1.0));
});

// ════════════════════════════════════════════════════════════════════════════════
// B8 – Transport Preference
// ════════════════════════════════════════════════════════════════════════════════

describe('B8 scoreTransport — preferred taxi, direct, 0 transfers', () => {
  // S_mode = modeScores['preferred'] = 1.0
  // S_comfort = comfortMatrix['standard']['taxi'] = 0.7
  // S_transfer = 1-0/2 = 1.0
  // S_direct = directnessScores['direct'] = 1.0
  // score = 0.40*1+0.25*0.7+0.15*1+0.20*1 = 0.4+0.175+0.15+0.2 = 0.925
  const { score, breakdown } = scoreTransport(
    { mode: 'taxi', transfers: 0, directness: 'direct' },
    userHistoryLover,
  );
  it('S_mode = 1.0',    () => near(breakdown.S_mode,    1.0, 'S_mode taxi'));
  it('S_comfort = 0.7', () => near(breakdown.S_comfort, 0.7, 'S_comfort taxi'));
  it('score ~0.925',    () => near(score, 0.925, 'B8 taxi'));
});

describe('B8 scoreTransport — acceptable transit, partial, 1 transfer', () => {
  // S_mode = 0.65; S_comfort = comfortMatrix['standard']['transit'] = 0.8
  // S_transfer = 1-1/2 = 0.5; S_direct = 0.5
  // score = 0.40*0.65+0.25*0.8+0.15*0.5+0.20*0.5 = 0.26+0.2+0.075+0.1=0.635
  // NOTE: README says "B8 bus row: 0.36→0.3695" - this is for a different config
  const { score, breakdown } = scoreTransport(
    { mode: 'transit', transfers: 1, directness: 'partial' },
    userHistoryLover,
  );
  it('S_mode = 0.65',   () => near(breakdown.S_mode,    0.65, 'S_mode transit'));
  it('S_comfort = 0.8', () => near(breakdown.S_comfort, 0.8,  'S_comfort transit'));
  it('score ~0.635',    () => near(score, 0.635, 'B8 transit partial'));
});

describe('B8 scoreTransport — low walk preference', () => {
  // S_mode = 0.25; S_comfort = standard walk = 0.7
  // S_transfer = 1; S_direct = 1
  // score = 0.40*0.25+0.25*0.7+0.15*1+0.20*1 = 0.1+0.175+0.15+0.2 = 0.625
  const { score } = scoreTransport(
    { mode: 'walk', transfers: 0, directness: 'direct' },
    userHistoryLover,
  );
  it('score ~0.625 for low walk pref', () => near(score, 0.625, 'B8 walk'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B9 – Weather Preference
// ════════════════════════════════════════════════════════════════════════════════

describe('B9 scoreWeather — perfect weather, outdoor fort', () => {
  // tempC=28 in [20,32] → S_temp=1; clear: rain=0→S_rain=max(0,1-0/0.5)=1; wind=0.1→S_wind=max(0,1-0.1/0.4)=0.75
  // S_weather = 0.40*1+0.40*1+0.20*0.75 = 0.4+0.4+0.15 = 0.95
  // O_sens=0.8 → S_adjusted=1-0.8*(1-0.95)=1-0.04=0.96
  // README notes B9 good-weather Osens=1 is 0.852 — this test uses Osens=0.8
  const { score, breakdown } = scoreWeather(
    { condition: 'clear', tempC: 28 },
    fort,
    userHistoryLover,
  );
  it('S_temp = 1.0',       () => near(breakdown.S_temp,    1.0, 'S_temp'));
  it('S_weather ~0.95',    () => near(breakdown.S_weather, 0.95, 'S_weather'));
  it('S_adjusted ~0.96',   () => near(score, 0.96, 'B9 perfect outdoor'));
});

describe('B9 scoreWeather — outdoor fort (O_sens=1) good weather', () => {
  // S_weather = 0.95 (same); O_sens=1.0
  // S_adjusted = 1 - 1.0*(1-0.95) = 0.95
  // But README says 0.852 — that's for different weather conditions
  // Our spec: clear day tempC=28: S_adjusted=0.95 with O_sens=1
  const outerFort = { ...fort, outdoorSensitivity: 1.0 };
  const { score } = scoreWeather({ condition: 'clear', tempC: 28 }, outerFort, userHistoryLover);
  it('S_adjusted=0.95 with O_sens=1 and clear weather', () => near(score, 0.95, 'B9 O=1 clear'));
});

describe('B9 scoreWeather — indoor museum in rain', () => {
  // rain: rain=0.5→S_rain=max(0,1-0.5/0.5)=0; wind=0.3
  //   S_wind=max(0,1-0.3/0.4)=max(0,0.25)=0.25
  // tempC=27 in [20,32] → S_temp=1
  // S_weather=0.40*1+0.40*0+0.20*0.25=0.4+0+0.05=0.45
  // museum O_sens=0.1 → S_adjusted=1-0.1*(1-0.45)=1-0.055=0.945
  const { score, breakdown } = scoreWeather(
    { condition: 'rain', tempC: 27 },
    museum,
    userHistoryLover,
  );
  it('S_rain = 0 (at rain tolerance)',   () => near(breakdown.S_rain,  0,    'S_rain'));
  it('S_weather = 0.45',                 () => near(breakdown.S_weather, 0.45, 'S_weather rain'));
  it('S_adjusted ~0.945 (mostly indoor)',() => near(score, 0.945, 'B9 indoor rain'));
});

describe('B9 scoreWeather — extreme heat, outdoor fort', () => {
  // tempC=46; heatTol=8; over by 14; S_temp=max(0,1-14/8)=0
  // clear: rain=0→1; wind=0.1→0.75
  // S_weather=0.40*0+0.40*1+0.20*0.75=0+0.4+0.15=0.55
  // O_sens=0.8 → S_adjusted=1-0.8*(1-0.55)=1-0.36=0.64
  const { score, breakdown } = scoreWeather(
    { condition: 'heat', tempC: 46 },
    fort,
    userHistoryLover,
  );
  it('S_temp = 0 (extreme heat)',  () => near(breakdown.S_temp, 0, 'S_temp heat'));
  it('S_adjusted ~0.64',          () => near(score, 0.64, 'B9 extreme heat'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B10 – Route Continuity
// ════════════════════════════════════════════════════════════════════════════════

describe('B10 scoreContinuity — straight-line route (no backtrack)', () => {
  // Moving south: prev(29,77)→current(28.8,77)→next(28.6,77) — same direction
  // v1=[0,-0.2], v2=[0,-0.2]; cosine=1; D_j=(1+1)/2=1
  // B_j=0; Cluster_j: centroid=next→dist=0→Cluster=1
  // score = 0.35*1+0.25*1+0.20*1+0.20*(1-1)=0.35+0.25+0.2+0=0.8
  const { score, breakdown } = scoreContinuity({
    prev:    { lat: 29.0, lng: 77.0 },
    current: { lat: 28.8, lng: 77.0 },
    next:    { lat: 28.6, lng: 77.0 },
    centroid:{ lat: 28.6, lng: 77.0 },
    visitedDist: [],
    currentDist: 22,
  });
  it('D_j = 1.0 (same direction)', () => near(breakdown.D_j, 1.0, 'D_j'));
  it('Cluster_j ~1.0',             () => near(breakdown.Cluster_j, 1.0, 'Cluster_j'));
  it('score ~0.80',                () => near(score, 0.80, 'B10 straight'));
});

describe('B10 scoreContinuity — full U-turn', () => {
  // v1=[0,-0.2] south, v2=[0,+0.2] north; cosine=-1; D_j=(−1+1)/2=0
  // B_j=0 (no visited); Cluster=1 (centroid=next)
  // score = 0.35*0+0.25*1+0.20*1+0.20*1=0+0.25+0.2+0.2=0.65
  const { score, breakdown } = scoreContinuity({
    prev:    { lat: 29.0, lng: 77.0 },
    current: { lat: 28.8, lng: 77.0 },
    next:    { lat: 29.0, lng: 77.0 },   // going back
    centroid:{ lat: 29.0, lng: 77.0 },
    visitedDist: [],
    currentDist: 22,
  });
  it('D_j = 0.0 (U-turn)',  () => near(breakdown.D_j, 0.0, 'D_j uturn'));
  it('score ~0.65',          () => near(score, 0.65, 'B10 uturn'));
});

describe('B10 scoreContinuity — no prev (first stop)', () => {
  // D_j = 0.5 (neutral); B_j=0; Cluster=1
  // score = 0.35*0.5+0.25*1+0.20*1+0.20*0.5=0.175+0.25+0.2+0.1=0.725
  const { score, breakdown } = scoreContinuity({
    prev: null,
    current: { lat: 28.6, lng: 77.2 },
    next:    { lat: 28.65, lng: 77.25 },
    centroid:{ lat: 28.65, lng: 77.25 },
    visitedDist: [], currentDist: 5,
  });
  it('D_j = 0.5 (no prev)',  () => near(breakdown.D_j, 0.5, 'D_j first'));
  it('score ~0.725',          () => near(score, 0.725, 'B10 first stop'));
});

// ════════════════════════════════════════════════════════════════════════════════
// B11 – Future Value
// ════════════════════════════════════════════════════════════════════════════════

describe('B11 placeValue', () => {
  // V_i = w_p*B2 + w_u*B1 = 0.60*1.0 + 0.40*0.728 = 0.6+0.2912=0.8912
  const V = placeValue(0.728, 1.0);
  it('V_i ~0.891 for HIGH-priority history place', () => near(V, 0.8912, 'V_i fort'));
});

describe('B11 scoreFutureValue — rich remaining pool', () => {
  const makeEntry = (V_i, lat, lng) => ({ place: { lat, lng }, V_i });
  // remaining: 3 places with V=[0.9,0.8,0.7] → R=0.8
  // future: 2 places with V=[0.6,0.4] → F=0.5
  // candidateLoc=(28.65,77.24) → within sigmaC=3km: all remaining are ~0 km → Cluster~0.8
  // H_val: high-value (>=0.7): 3+0 out of 5 → 0.6
  // score = 0.30*0.8 + 0.25*0.5 + 0.20*Cluster + 0.25*0.6
  const remaining = [
    makeEntry(0.9, 28.65, 77.24),
    makeEntry(0.8, 28.655, 77.241),
    makeEntry(0.7, 28.648, 77.239),
  ];
  const future = [
    makeEntry(0.6, 28.5, 77.1),
    makeEntry(0.4, 28.4, 77.0),
  ];
  const { score, breakdown } = scoreFutureValue({
    remainingToday: remaining,
    futureDays: future,
    candidateLoc: { lat: 28.65, lng: 77.24 },
  });
  it('R_remaining = 0.8',     () => near(breakdown.R_remaining, 0.8, 'R_remaining'));
  it('F_future = 0.5',        () => near(breakdown.F_future,    0.5, 'F_future'));
  it('H_val = 0.6',           () => near(breakdown.H_val,       0.6, 'H_val'));
  it('score in [0,1]',        () => assert.ok(score >= 0 && score <= 1));
});

describe('B11 scoreFutureValue — no remaining (last stop)', () => {
  // remaining=[] → R=1 (incentivise last stop)
  // future=[] → F=1 (single-day trip)
  // no candidateLoc → ClusterVal=0.5
  // H_val=0
  // score = 0.30*1+0.25*1+0.20*0.5+0.25*0=0.3+0.25+0.1=0.65
  const { score, breakdown } = scoreFutureValue({
    remainingToday: [], futureDays: [],
  });
  it('R_remaining = 1 (last stop)',  () => assert.equal(breakdown.R_remaining, 1));
  it('F_future = 1 (no future days)',() => assert.equal(breakdown.F_future, 1));
  it('score ~0.65',                  () => near(score, 0.65, 'B11 last stop'));
});
