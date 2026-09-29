/**
 * src/dayStateManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DayStateManager – tracks the mutable state of a single day as the solver
 * incrementally builds the schedule.
 *
 * Holds: current time, current location, budget spent, visited places,
 * schedule entries built so far, meal flags, and running score.
 *
 * All mutations go through methods so we can easily clone() for search.
 */

/**
 * @typedef {object} ScheduleEntry
 * @property {string}  type         – 'travel' | 'visit' | 'wait' | 'meal' | 'return'
 * @property {string}  placeId      – place id (or 'hotel' for hotel)
 * @property {string}  mode         – transport mode used to arrive
 * @property {number}  startMin     – start time (minutes from midnight)
 * @property {number}  endMin       – end time
 * @property {number}  travelMin    – travel time to this place
 * @property {number}  waitMin      – wait for opening (0 for most)
 * @property {number}  visitMin     – time spent at place
 * @property {number}  costTransport– transport cost (INR)
 * @property {number}  costEntry    – entry/ticket cost (INR)
 * @property {number}  kmFromPrev   – distance from previous stop
 */

export class DayStateManager {
  /**
   * @param {object} dayInput  – normalized day (dayIndex, date, dayStart, dayEnd, hotel, dailyBudget)
   * @param {object} tripInput – normalized trip (totalBudget)
   * @param {number} budgetSpentBefore – INR already spent on prior days
   */
  constructor(dayInput, tripInput, budgetSpentBefore = 0) {
    this.dayIndex   = dayInput.dayIndex;
    this.date       = dayInput.date;
    this.dayStart   = dayInput.dayStart;    // minutes from midnight
    this.dayEnd     = dayInput.dayEnd;      // minutes from midnight
    this.hotel      = dayInput.hotel ?? dayInput.startLocation ?? dayInput.endLocation; // { id, lat, lng }

    this.totalBudget      = tripInput.totalBudget   ?? Infinity;
    this.dailyBudget      = dayInput.dailyBudget    ?? Infinity;
    this.budgetSpentBefore = budgetSpentBefore;

    // Mutable state
    this.currentTimeMin  = this.dayStart;
    this.currentLocation = { ...this.hotel };   // starts at hotel
    this.budgetSpent     = 0;                   // spent today

    /** @type {Set<string>} */
    this.visitedIds  = new Set();
    this.mealsServed = new Set();               // 'lunch', 'dinner'

    /** @type {ScheduleEntry[]} */
    this.schedule    = [];

    this.totalScore  = 0;   // cumulative weighted B-score
    this.stopCount   = 0;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  get budgetRemaining() {
    return Math.min(
      this.dailyBudget  - this.budgetSpent,
      this.totalBudget  - this.budgetSpentBefore - this.budgetSpent,
    );
  }

  hasVisited(placeId) { return this.visitedIds.has(placeId); }
  hasMeal(type)       { return this.mealsServed.has(type); }

  // ── Mutations ────────────────────────────────────────────────────────────────

  /**
   * Commit a stop to the schedule. Updates time, location, budget, visited set.
   * @param {ScheduleEntry} entry
   */
  addEntry(entry) {
    this.schedule.push(entry);
    this.currentTimeMin  = entry.endMin;
    if (entry.type === 'visit' || entry.type === 'meal') {
      this.currentLocation = { id: entry.placeId };  // location tracking via id
      this.visitedIds.add(entry.placeId);
      this.stopCount++;
    }
    this.budgetSpent += (entry.costTransport ?? 0) + (entry.costEntry ?? 0);
  }

  markMeal(type) { this.mealsServed.add(type); }

  addScore(delta) { this.totalScore += delta; }

  // ── Clone (for search tree branching) ───────────────────────────────────────

  clone() {
    const c = Object.create(DayStateManager.prototype);
    c.dayIndex    = this.dayIndex;
    c.date        = this.date;
    c.dayStart    = this.dayStart;
    c.dayEnd      = this.dayEnd;
    c.hotel       = this.hotel;
    c.totalBudget = this.totalBudget;
    c.dailyBudget = this.dailyBudget;
    c.budgetSpentBefore = this.budgetSpentBefore;

    c.currentTimeMin  = this.currentTimeMin;
    c.currentLocation = { ...this.currentLocation };
    c.budgetSpent     = this.budgetSpent;
    c.visitedIds      = new Set(this.visitedIds);
    c.mealsServed     = new Set(this.mealsServed);
    c.schedule        = this.schedule.map((e) => ({ ...e }));
    c.totalScore      = this.totalScore;
    c.stopCount       = this.stopCount;
    return c;
  }

  // ── Snapshot (for output/report) ─────────────────────────────────────────────

  snapshot() {
    return {
      dayIndex:     this.dayIndex,
      date:         this.date,
      budgetSpent:  this.budgetSpent,
      stopCount:    this.stopCount,
      totalScore:   this.totalScore,
      mealsServed:  [...this.mealsServed],
      schedule:     this.schedule.map((e) => ({ ...e })),
    };
  }
}

export default DayStateManager;
