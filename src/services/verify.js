/**
 * verify.js
 * Service verification test suite.
 * Run in Node to validate standard schemas, Web Crypto cache encryption, and provider failover logic.
 */

import { webcrypto } from "crypto";

// 1. Establish Node Environment Mocks for Browser APIs
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}

globalThis.localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

// Mock window/import.meta.env
globalThis.import = {
  meta: {
    env: {}
  }
};

async function runTests() {
  console.log("=============================================");
  console.log("STARTING MVP SERVICE LAYER VERIFICATION SUITE");
  console.log("=============================================\n");

  let successCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      successCount++;
    } else {
      console.error(`[FAIL] ${message}`);
      failCount++;
    }
  }

  try {
    // Dynamically import helpers to ensure global mocks are set up first
    const { encryptData, decryptData } = await import("./CryptoHelper.js");
    const { ServiceWrapper } = await import("./ServiceWrapper.js");

    // Test 1: CryptoHelper AES-GCM Encryption
    console.log("--- Test 1: Caching Cryptography (Web Crypto API) ---");
    const secretText = JSON.stringify({ secret: "Gourmet Secret Sauce recipe", code: 42 });
    
    const cipherText = await encryptData(secretText);
    assert(cipherText !== secretText, "Encrypted output is not plaintext");
    assert(cipherText.length > secretText.length, "Ciphertext includes IV overhead and is base64 encoded");
    
    const decryptedText = await decryptData(cipherText);
    assert(decryptedText === secretText, "Decrypted text matches the original input string");
    console.log("");

    // Test 2: Standardized JSON Response Schema
    console.log("--- Test 2: Standardized JSON Output Format ---");
    const wrapper = new ServiceWrapper();
    const searchParams = { query: "sushi", lat: 37.7749, lon: -122.4194, radius: 2000 };
    
    const searchResponse = await wrapper.search(searchParams);
    assert(searchResponse.provider === "foursquare", "Initial search starts with Foursquare Pro");
    assert(searchResponse.correlationId !== undefined, "Search response includes a Request Correlation ID");
    assert(Array.isArray(searchResponse.results), "Search results are returned as an array");
    assert(searchResponse.results.length > 0, "Returned at least one restaurant record");

    const restaurant = searchResponse.results[0];
    
    // Validate standardized structure
    assert(restaurant.provider === "foursquare", "Restaurant provider tag matches");
    assert(typeof restaurant.id === "string", "ID is a string");
    assert(typeof restaurant.name === "string", "Name is a string");
    assert(restaurant.location !== undefined, "Location block is present");
    assert(typeof restaurant.location.address === "string", "Address is a string");
    assert(typeof restaurant.location.lat === "number", "Latitude is a number");
    assert(typeof restaurant.location.lon === "number", "Longitude is a number");
    assert(Array.isArray(restaurant.categories), "Categories is an array");
    assert(typeof restaurant.pricingTier === "number", "Pricing Tier is a number");
    assert(restaurant.premiumData !== undefined, "Premium data stub is present");
    assert(restaurant.premiumData.rating === null, "Premium ratings are lazy-loaded (initially null)");
    console.log("");

    // Test 3: Quota Failover and Provider Rotation
    console.log("--- Test 3: Transparent Quota Failover ---");
    // Clear cache to force API call
    localStorage.clear();
    // Force error for foursquare, it should rotate to google
    const failoverResponse = await wrapper.search(searchParams, "foursquare");
    assert(failoverResponse.provider === "google", "Rotated provider from Foursquare to Google after 429 Error");
    assert(wrapper.activeProviderName === "google", "Service wrapper active provider rotated to Google");
    
    // Clear cache to force next API call
    localStorage.clear();
    // Force error for google, it should rotate to tomtom
    const nextFailover = await wrapper.search(searchParams, "google");
    assert(nextFailover.provider === "tomtom", "Rotated provider from Google to TomTom after secondary 429 Error");
    assert(wrapper.activeProviderName === "tomtom", "Service wrapper active provider rotated to TomTom");
    console.log("");

    // Test 4: Local Storage Encrypted Caching
    console.log("--- Test 4: Local Cache Retrieval & Expiry ---");
    // Check if the tomtom search results got cached
    const cacheKey = wrapper.getCacheKey("search", searchParams);
    const rawCache = localStorage.getItem(cacheKey);
    assert(rawCache !== null, "Search results successfully saved to localStorage");
    assert(!rawCache.includes("tom_mock"), "Cached data in localStorage is encrypted (does not contain raw json)");

    const cachedResults = await wrapper.getCachedItem(cacheKey);
    assert(Array.isArray(cachedResults), "Retrieved and decrypted data successfully from cache");
    assert(cachedResults[0].provider === "tomtom", "Cached content matches normalized schema");
    console.log("");

    // Test 5: Lazy Loading of Premium Details & Documenu Menu
    console.log("--- Test 5: Premium Lazy Loading & Menu Integration ---");
    const detailedVenue = await wrapper.getDetails(restaurant);
    assert(detailedVenue.premiumData.rating !== null, "Premium rating successfully lazy-loaded");
    assert(detailedVenue.premiumData.photos.length > 0, "Premium photos loaded");
    assert(Array.isArray(detailedVenue.premiumData.menuItems), "Documenu items merged into restaurant");
    assert(detailedVenue.premiumData.menuItems.length > 0, "Loaded menu items details");
    console.log("");

    console.log("=============================================");
    console.log(`VERIFICATION RESULT: ${successCount} PASSED, ${failCount} FAILED`);
    console.log("=============================================");

    if (failCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error("Verification suite encountered a fatal error:", err);
    process.exit(1);
  }
}

runTests();
