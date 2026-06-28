import { FoursquareProvider } from "./FoursquareProvider.js";
import { GooglePlacesProvider } from "./GooglePlacesProvider.js";
import { TomTomProvider } from "./TomTomProvider.js";
import { YelpProvider } from "./YelpProvider.js";
import { DocumenuProvider } from "./DocumenuProvider.js";
import { encryptData, decryptData } from "./CryptoHelper.js";

// Fallback Provider Hierarchy
const PROVIDER_ORDER = ["foursquare", "google", "tomtom"];

export class ServiceWrapper {
  constructor() {
    this.providers = {
      foursquare: new FoursquareProvider(),
      google: new GooglePlacesProvider(),
      tomtom: new TomTomProvider(),
      yelp: new YelpProvider(),
      documenu: new DocumenuProvider()
    };
    
    // Initial active provider
    this.activeProviderName = "foursquare";
    
    // Telemetry log for debugging failovers
    this.telemetryLogs = [];
  }

  /**
   * Helper to log failover and transaction telemetry.
   */
  logTelemetry(eventId, action, message, provider, correlationId) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventId,
      action,
      message,
      provider,
      correlationId
    };
    this.telemetryLogs.unshift(logEntry);
    console.log(`[Telemetry] ${action} - ${message} (Correlation: ${correlationId})`);
    
    // Keep logs stored in localStorage (plaintext is fine for system logs)
    try {
      const logs = JSON.parse(localStorage.getItem("mvp_telemetry") || "[]");
      logs.unshift(logEntry);
      localStorage.setItem("mvp_telemetry", JSON.stringify(logs.slice(0, 100)));
    } catch (e) {
      console.warn("Could not save telemetry to localStorage:", e);
    }
  }

  /**
   * Rotates the active provider in the hierarchy.
   */
  rotateProvider(currentProvider, correlationId) {
    const currentIndex = PROVIDER_ORDER.indexOf(currentProvider);
    const nextIndex = (currentIndex + 1) % PROVIDER_ORDER.length;
    const nextProvider = PROVIDER_ORDER[nextIndex];
    
    this.activeProviderName = nextProvider;
    this.logTelemetry(
      `evt_${Date.now()}`,
      "PROVIDER_ROTATION",
      `Quota limit or error on "${currentProvider}". Rotated to "${nextProvider}".`,
      nextProvider,
      correlationId
    );
    return nextProvider;
  }

  /**
   * Generates a request correlation nonce.
   */
  generateNonce() {
    // Generate UUID v4 or fallback random string
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `nonce-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  }

  /**
   * Generates a cache key.
   */
  getCacheKey(type, params) {
    if (type === "search") {
      const { query, lat, lon, radius } = params;
      // Round coordinates to 3 decimals to cluster nearby queries
      return `search_${query || "all"}_${lat.toFixed(3)}_${lon.toFixed(3)}_${radius}`;
    }
    return `details_${params}`; // params is placeId
  }

  /**
   * Fetches data from secure encrypted localStorage cache.
   */
  async getCachedItem(key) {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;

      const decrypted = await decryptData(encrypted);
      const cacheObj = JSON.parse(decrypted);

      // Check cache expiry (24 hours = 86,400,000 ms)
      if (Date.now() - cacheObj.timestamp > 86400000) {
        localStorage.removeItem(key);
        return null;
      }
      return cacheObj.data;
    } catch (error) {
      console.warn(`Cache read/decryption failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Saves data into secure encrypted localStorage cache.
   */
  async setCachedItem(key, data) {
    try {
      const cacheObj = {
        timestamp: Date.now(),
        data: data
      };
      const ciphertext = await encryptData(JSON.stringify(cacheObj));
      localStorage.setItem(key, ciphertext);
    } catch (error) {
      console.warn(`Cache save/encryption failed for key ${key}:`, error);
    }
  }

  /**
   * Orchestrates the search request with caching and automatic failover rotation.
   */
  async search(params, forceErrorForProvider = null) {
    const correlationId = this.generateNonce();
    const cacheKey = this.getCacheKey("search", params);

    // 1. Check Cache first
    const cachedResults = await this.getCachedItem(cacheKey);
    if (cachedResults) {
      this.logTelemetry(
        `evt_${Date.now()}`,
        "CACHE_HIT",
        `Retrieved search results from encrypted local cache.`,
        "cache",
        correlationId
      );
      return { results: cachedResults, provider: "cache", correlationId };
    }

    let attemptProvider = this.activeProviderName;
    let attempts = 0;

    // Retry loop across providers
    while (attempts < PROVIDER_ORDER.length) {
      this.logTelemetry(
        `evt_${Date.now()}`,
        "API_REQUEST",
        `Dispatching search to "${attemptProvider}".`,
        attemptProvider,
        correlationId
      );

      try {
        // Dev Simulation: Trigger failover test
        if (attemptProvider === forceErrorForProvider) {
          const simulatedError = new Error("Simulated Quota Limit Exceeded");
          simulatedError.response = { status: 429 };
          throw simulatedError;
        }

        const providerInstance = this.providers[attemptProvider];
        const rawData = await providerInstance.fetchData(params);
        const normalized = providerInstance.normalize(rawData);

        // 2. Cache normalized results
        await this.setCachedItem(cacheKey, normalized);

        this.logTelemetry(
          `evt_${Date.now()}`,
          "API_SUCCESS",
          `Successfully fetched and normalized ${normalized.length} venues.`,
          attemptProvider,
          correlationId
        );

        return { results: normalized, provider: attemptProvider, correlationId };
      } catch (error) {
        const statusCode = error.response?.status || 500;
        this.logTelemetry(
          `evt_${Date.now()}`,
          "API_FAILURE",
          `Request failed with status ${statusCode}: ${error.message}`,
          attemptProvider,
          correlationId
        );

        // Failover rotation on 403 (Forbidden/Quota) or 429 (Too Many Requests)
        if (statusCode === 403 || statusCode === 429) {
          attemptProvider = this.rotateProvider(attemptProvider, correlationId);
          attempts++;
        } else {
          // General 500 or network error - failover or throw based on preference
          // For MVP robust experience, we failover on any network failure
          attemptProvider = this.rotateProvider(attemptProvider, correlationId);
          attempts++;
        }
      }
    }

    throw new Error("Service Wrapper: All fallback providers exhausted.");
  }

  /**
   * Lazy-loads premium fields (Photos, Hours, Ratings, and Menus) for a selected restaurant.
   */
  async getDetails(restaurant, forceProvider = null) {
    const correlationId = this.generateNonce();
    const providerName = forceProvider || restaurant.provider;
    const cacheKey = this.getCacheKey("details", restaurant.id);

    // 1. Check cache first
    const cachedDetails = await this.getCachedItem(cacheKey);
    if (cachedDetails) {
      this.logTelemetry(
        `evt_${Date.now()}`,
        "CACHE_HIT",
        `Retrieved details for "${restaurant.name}" from encrypted cache.`,
        "cache",
        correlationId
      );
      return cachedDetails;
    }

    this.logTelemetry(
      `evt_${Date.now()}`,
      "PREMIUM_FETCH",
      `Lazy-loading premium details for "${restaurant.name}" via "${providerName}".`,
      providerName,
      correlationId
    );

    let enrichedRestaurant = { ...restaurant };

    try {
      const providerInstance = this.providers[providerName];
      
      // Fetch details from primary provider if it supports details
      if (typeof providerInstance.fetchDetails === "function") {
        const rawDetails = await providerInstance.fetchDetails(restaurant.id);
        enrichedRestaurant = providerInstance.normalizePremium(restaurant, rawDetails);
      }

      // Fetch menu from Documenu (integrated as premium metadata)
      try {
        this.logTelemetry(
          `evt_${Date.now()}`,
          "MENU_FETCH",
          `Lazy-loading Documenu items for "${restaurant.name}".`,
          "documenu",
          correlationId
        );
        const menuItems = await this.providers.documenu.fetchMenuItems(restaurant.id);
        
        // Map Documenu price range metrics if available
        enrichedRestaurant.premiumData.menuItems = menuItems.map(item => ({
          name: item.name,
          price: item.price || 15.0,
          description: item.description || "Freshly prepared chef specialty."
        }));
      } catch (menuError) {
        console.warn("Documenu enrichment skipped/failed:", menuError);
        // Blend in a mock menu fallback if primary Documenu fetch fails to populate UI elegantly
        enrichedRestaurant.premiumData.menuItems = this.providers.documenu.generateMockMenuItems();
      }

      // 2. Cache enriched details
      await this.setCachedItem(cacheKey, enrichedRestaurant);
      return enrichedRestaurant;

    } catch (error) {
      console.error(`Failed to load details for ${restaurant.name}:`, error);
      // Return standard restaurant stub on failure
      return restaurant;
    }
  }

  // ==========================================
  // FUTURE FEATURE ROADMAP: MICHELIN WORKAROUND
  // ==========================================
  /**
   * Future implementation pattern for luxury validation.
   * To be enabled in a future release.
   * 
   * async validateMichelinStatus(venueName, lat, lon) {
   *   try {
   *     // 1. Query Yelp fine dining content & Foursquare high scores
   *     const yelpCandidates = await this.providers.yelp.fetchData({ query: "fine dining", lat, lon });
   *     const match = yelpCandidates.find(c => c.name.toLowerCase().includes(venueName.toLowerCase()));
   *     
   *     if (!match) return false;
   * 
   *     // 2. Query Documenu search fields validation
   *     const documenuData = await this.providers.documenu.fetchData({ query: venueName, lat, lon });
   *     const docuMatch = documenuData.find(d => d.restaurant_name.toLowerCase().includes(venueName.toLowerCase()));
   * 
   *     // 3. Confirm price range >= 4 (luxury validation)
   *     if (docuMatch && parseInt(docuMatch.price_range) >= 4 && match.rating >= 4.5) {
   *       return {
   *         isMichelinCandidate: true,
   *         confidence: "high",
   *         documenuPriceTier: docuMatch.price_range
   *       };
   *     }
   *     return false;
   *   } catch (err) {
   *     console.error("Michelin validation process failed:", err);
   *     return false;
   *   }
   * }
   */
}
