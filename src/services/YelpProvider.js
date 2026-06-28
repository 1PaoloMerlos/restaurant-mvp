import axios from "axios";
import { BaseService } from "./BaseService.js";

/**
 * YelpProvider.js
 * Implementation of Yelp Fusion API wrapper for enrichment and fine dining search.
 */
export class YelpProvider extends BaseService {
  constructor() {
    super("yelp");
    this.apiKey = import.meta.env?.VITE_YELP_KEY || "";
    this.isDemo = !this.apiKey || this.apiKey.includes("your_");
  }

  /**
   * Fetches restaurants from Yelp Fusion API.
   */
  async fetchData(params) {
    const { query, lat, lon, radius = 5000 } = params;

    if (this.isDemo) {
      console.log(`[YelpProvider] Running in DEMO mode for query: "${query}"`);
      return this.generateMockSearch(query, lat, lon, radius);
    }

    try {
      const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
        params: {
          term: query || "restaurant",
          latitude: lat,
          longitude: lon,
          radius: Math.round(radius),
          categories: "restaurants",
          limit: 10
        },
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      return response.data.businesses;
    } catch (error) {
      console.error("[YelpProvider] API error:", error);
      throw error;
    }
  }

  /**
   * Normalizes Yelp businesses.
   */
  normalize(rawBusinesses) {
    if (!Array.isArray(rawBusinesses)) return [];

    return rawBusinesses.map((biz) => {
      const categories = biz.categories?.map((c) => c.title) || ["Restaurant"];
      
      return {
        provider: "yelp",
        id: biz.id,
        name: biz.name,
        location: {
          address: biz.location?.display_address?.join(", ") || biz.location?.address1 || "Address Not Available",
          lat: biz.coordinates?.latitude || 0,
          lon: biz.coordinates?.longitude || 0,
          postalCode: biz.location?.zip_code || ""
        },
        categories: categories,
        pricingTier: biz.price ? biz.price.length : 2, // e.g. "$$$" length = 3
        premiumData: {
          rating: biz.rating || null,
          photos: biz.image_url ? [biz.image_url] : [],
          hours: {},
          menuItems: []
        }
      };
    });
  }

  // --- Mock Generators for Demo Mode ---

  generateMockSearch(query, lat, lon, radius) {
    const names = [
      "Yelp Fine Bistro", "The Yelp Grille", "Star Diner",
      "Epicurean Lounge", "Golden Stars Eatery"
    ];

    const results = [];
    const count = 4;

    for (let i = 0; i < count; i++) {
      const name = names[i % names.length] + ` (${query || "Yelp"})`;
      const offsetLat = (Math.random() - 0.5) * (radius / 111000);
      const offsetLon = (Math.random() - 0.5) * (radius / (111000 * Math.cos(lat * Math.PI / 180)));

      results.push({
        id: `yelp_mock_${i}_${Date.now()}`,
        name: name,
        location: {
          display_address: [`${888 + i * 11} Yelp Blvd, Review Town`],
          zip_code: `YLP-${50000 + i}`
        },
        coordinates: {
          latitude: lat + offsetLat,
          longitude: lon + offsetLon
        },
        categories: [{ title: "Fine Dining" }, { title: "Steakhouse" }],
        price: "$$$$", // Luxury price
        rating: 4.8,
        image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
      });
    }

    return results;
  }
}
