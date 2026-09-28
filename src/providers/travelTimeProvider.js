/**
 * src/providers/travelTimeProvider.js
 * Abstract TravelTimeProvider interface.
 *
 * All providers must implement these methods.
 * The algorithm never calls OSRM or network services directly –
 * it always goes through this interface.
 */

export class TravelTimeProvider {
  /**
   * Return travel info between two locations for a given mode.
   *
   * @param {string} fromId
   * @param {string} toId
   * @param {string} mode - one of the configured modes
   * @returns {Promise<{ minutes: number, km: number, transfers: number, directness: string }|null>}
   *   null if the leg is not feasible for this mode.
   */
  // eslint-disable-next-line no-unused-vars
  async getTravelInfo(fromId, toId, mode) {
    throw new Error('TravelTimeProvider.getTravelInfo() must be implemented');
  }

  /**
   * Build a travel matrix for a set of ids and modes.
   *
   * @param {string[]} ids
   * @param {string[]} modes
   * @param {Map<string, { lat: number, lng: number }>} locations
   * @returns {Promise<object>} travelMatrix in the input schema shape
   */
  // eslint-disable-next-line no-unused-vars
  async buildMatrix(ids, modes, locations) {
    throw new Error('TravelTimeProvider.buildMatrix() must be implemented');
  }
}
