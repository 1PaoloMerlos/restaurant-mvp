import axios from "axios";
import { BaseService } from "./BaseService.js";

/**
 * DocumenuProvider.js
 * Implementation of the Documenu API wrapper for menu items fetching.
 */
export class DocumenuProvider extends BaseService {
  constructor() {
    super("documenu");
    this.apiKey = import.meta.env?.VITE_DOCUMENU_KEY || "";
    this.isDemo = !this.apiKey || this.apiKey.includes("your_");
  }

  /**
   * Performs search on Documenu endpoint (to filter restaurants by price >= 4, etc.).
   */
  async fetchData(params) {
    const { query, lat, lon, radius = 5000 } = params;

    if (this.isDemo) {
      console.log(`[DocumenuProvider] Running in DEMO mode for query: "${query}"`);
      return this.generateMockSearch(query, lat, lon, radius);
    }

    try {
      const response = await axios.get("https://api.documenu.com/v2/restaurants/search/fields", {
        params: {
          key: this.apiKey,
          lat: lat,
          lon: lon,
          distance: Math.round(radius / 1609.34), // distance is in miles
          cuisine: query || "",
          limit: 10
        }
      });
      return response.data.data;
    } catch (error) {
      console.error("[DocumenuProvider] API error:", error);
      throw error;
    }
  }

  /**
   * Fetches menu items for a specific restaurant ID.
   */
  async fetchMenuItems(restaurantId) {
    if (this.isDemo) {
      console.log(`[DocumenuProvider] DEMO menu items fetch for restaurant: ${restaurantId}`);
      return this.generateMockMenuItems();
    }

    try {
      const response = await axios.get(`https://api.documenu.com/v2/restaurant/${restaurantId}/menuitems`, {
        params: {
          key: this.apiKey
        }
      });
      return response.data.data; // Array of menu items
    } catch (error) {
      console.error("[DocumenuProvider] Menu items API error:", error);
      throw error;
    }
  }

  /**
   * Normalizes Documenu results.
   */
  normalize(rawRestaurants) {
    if (!Array.isArray(rawRestaurants)) return [];

    return rawRestaurants.map((res) => {
      return {
        provider: "documenu",
        id: res.restaurant_id || res.id,
        name: res.restaurant_name,
        location: {
          address: res.address?.formatted || "Address Not Available",
          lat: res.geo?.lat || 0,
          lon: res.geo?.lon || 0,
          postalCode: res.address?.postal_code || ""
        },
        categories: [res.restaurant_cuisine || "Restaurant"],
        pricingTier: res.price_range ? parseInt(res.price_range) : 2,
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

  generateMockSearch(query, lat, lon, radius) {
    return [
      {
        restaurant_id: "docu_mock_1",
        restaurant_name: `Chez Gourmet (${query || "Documenu"})`,
        address: { formatted: "123 Documenu Blvd, Foodie City", postal_code: "12345" },
        geo: { lat: lat, lon: lon },
        restaurant_cuisine: "Fine Dining",
        price_range: "4" // Price level 4 (luxury)
      }
    ];
  }

  generateMockMenuItems() {
    return [
      { name: "Pan-Seared Sea Scallops", price: 34.0, description: "With sweet pea purée and crispy pancetta." },
      { name: "Truffle Butter Filet Mignon", price: 48.0, description: "8oz prime cut with roasted wild mushrooms." },
      { name: "Deconstructed Meyer Lemon Tart", price: 14.0, description: "With toasted Italian meringue and raspberry coulis." }
    ];
  }
}
