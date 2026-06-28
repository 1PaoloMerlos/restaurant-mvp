import axios from "axios";
import { BaseService } from "./BaseService.js";

/**
 * TomTomProvider.js
 * Implementation of the TomTom Search API.
 * Queries the Category Search (v2) endpoint with categorySet=7315 (Restaurants).
 */
export class TomTomProvider extends BaseService {
  constructor() {
    super("tomtom");
    this.apiKey = import.meta.env?.VITE_TOMTOM_KEY || "";
    this.isDemo = !this.apiKey || this.apiKey.includes("your_");
  }

  /**
   * Fetches restaurants using TomTom Category Search (v2).
   */
  async fetchData(params) {
    const { query, lat, lon, radius = 5000, isNationwide = false } = params;

    if (this.isDemo) {
      console.log(`[TomTomProvider] Running in DEMO mode for query: "${query}" (Nationwide: ${isNationwide})`);
      return this.generateMockSearch(query, lat, lon, radius, isNationwide);
    }

    try {
      const searchQuery = query || "restaurants";
      // Category Search (v2) URL
      const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(searchQuery)}.json`;

      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          lat: lat,
          lon: lon,
          radius: Math.round(radius),
          categorySet: "7315", // General Restaurant POI classification
          limit: 10
        }
      });
      return response.data.results;
    } catch (error) {
      console.error("[TomTomProvider] API error:", error);
      throw error;
    }
  }

  /**
   * Normalizes TomTom results.
   */
  normalize(rawResults) {
    if (!Array.isArray(rawResults)) return [];

    return rawResults.map((poi) => {
      // Find category list
      const categories = poi.poi?.categories || ["Restaurant"];
      
      // TomTom address normalization
      const address = poi.address?.freeformAddress || "Address Not Available";
      
      return {
        provider: "tomtom",
        id: poi.id,
        name: poi.poi?.name || "Unknown TomTom Venue",
        location: {
          address: address,
          lat: poi.position?.lat || 0,
          lon: poi.position?.lon || 0,
          postalCode: poi.address?.postalCode || ""
        },
        categories: categories,
        pricingTier: 2, // TomTom search v2 doesn't return price, default to 2
        premiumData: {
          rating: null,
          photos: [],
          hours: {},
          menuItems: []
        }
      };
    });
  }

  // --- Mock Generators for Demo Mode ---

  generateMockSearch(query, lat, lon, radius, isNationwide = false) {
    const names = [
      "TomTom Pizza Corner", "TomTom Burger", "Navigator Steakhouse",
      "Route 66 Bistro", "Map & Fork", "The Compass Cafe"
    ];

    const cities = [
      { name: "New York", lat: 40.7128, lon: -74.0060 },
      { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
      { name: "Chicago", lat: 41.8781, lon: -87.6298 },
      { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
      { name: "Miami", lat: 25.7617, lon: -80.1918 }
    ];

    const results = [];
    const count = isNationwide ? 10 : 5;

    for (let i = 0; i < count; i++) {
      const name = names[i % names.length] + ` (${query || "POI 7315"})`;
      let resLat = lat;
      let resLon = lon;
      let address = `${777 + i * 15} TomTom Route, Mapping City`;

      if (isNationwide) {
        const city = cities[i % cities.length];
        resLat = city.lat + (Math.random() - 0.5) * 0.1;
        resLon = city.lon + (Math.random() - 0.5) * 0.1;
        address = `${888 + i * 22} Route Avenue, ${city.name}`;
      } else {
        const offsetLat = (Math.random() - 0.5) * (radius / 111000);
        const offsetLon = (Math.random() - 0.5) * (radius / (111000 * Math.cos(lat * Math.PI / 180)));
        resLat = lat + offsetLat;
        resLon = lon + offsetLon;
      }

      results.push({
        id: `tom_mock_${i}_${Date.now()}`,
        poi: {
          name: name,
          categories: ["Restaurant", "POI 7315"]
        },
        address: {
          freeformAddress: address,
          postalCode: `MAP-${40000 + i}`
        },
        position: {
          lat: resLat,
          lon: resLon
        }
      });
    }

    return results;
  }
}
