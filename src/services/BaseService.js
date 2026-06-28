/**
 * BaseService.js
 * Abstract Base Service Wrapper establishing the Implementation-Interface Distinction.
 * Defines the standard contract that all API providers must implement.
 */
export class BaseService {
  constructor(name) {
    if (new.target === BaseService) {
      throw new TypeError("Cannot construct BaseService instances directly. It is abstract.");
    }
    this.name = name; // Name of the provider (e.g. 'foursquare', 'google', 'tomtom')
  }

  /**
   * Fetches raw data from the third-party API.
   * @param {Object} params - Query parameters such as lat, lon, radius, limit, query.
   * @returns {Promise<any>} Raw API response.
   */
  async fetchData(params) {
    throw new Error("Method 'fetchData(params)' must be implemented by subclass.");
  }

  /**
   * Normalizes the raw third-party data into the Standardized JSON Response Object.
   * @param {any} rawData - Raw data returned by the API.
   * @returns {Object[]} Array of standardized restaurant objects.
   */
  normalize(rawData) {
    throw new Error("Method 'normalize(rawData)' must be implemented by subclass.");
  }
}
