import axios from "axios";
import { BaseService } from "./BaseService.js";

/**
 * FoursquareProvider.js
 * Implementation of the Foursquare API (v3 Places API).
 * Implements Pro fields for search and lazy-loaded Premium fields for details.
 */
export class FoursquareProvider extends BaseService {
  constructor() {
    super("foursquare");
    // Support both Vite and standard CRA environment variables
    this.apiKey = import.meta.env?.VITE_FSQ_KEY || "";
    this.isDemo = !this.apiKey || this.apiKey.includes("your_");
  }

  /**
   * Fetches restaurants using Foursquare Pro (standard search).
   */
  async fetchData(params) {
    const { query, lat, lon, radius = 5000, isNationwide = false } = params;

    if (this.isDemo) {
      console.log(`[FoursquareProvider] Running in DEMO mode for query: "${query}" (Nationwide: ${isNationwide})`);
      return this.generateMockSearch(query, lat, lon, radius, isNationwide);
    }

    try {
      const response = await axios.get("https://api.foursquare.com/v3/places/search", {
        params: {
          query: query || "restaurant",
          ll: `${lat},${lon}`,
          radius: Math.round(radius),
          categories: "13000", // Dining and Drinking
          limit: 10
        },
        headers: {
          Accept: "application/json",
          Authorization: this.apiKey
        }
      });
      return response.data.results;
    } catch (error) {
      console.error("[FoursquareProvider] API error:", error);
      throw error;
    }
  }

  /**
   * Fetches Foursquare Premium fields (Ratings, Photos, Hours) lazy-loaded.
   */
  async fetchDetails(fsqId) {
    if (this.isDemo) {
      console.log(`[FoursquareProvider] DEMO premium fetch for: ${fsqId}`);
      return this.generateMockDetails(fsqId);
    }

    try {
      // Fetch details endpoint
      const response = await axios.get(`https://api.foursquare.com/v3/places/${fsqId}`, {
        params: {
          fields: "rating,photos,hours,price"
        },
        headers: {
          Accept: "application/json",
          Authorization: this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error("[FoursquareProvider] Premium details API error:", error);
      throw error;
    }
  }

  /**
   * Normalizes standard search results (Pro fields).
   */
  normalize(rawItems) {
    if (!Array.isArray(rawItems)) return [];

    return rawItems.map((item) => {
      // Foursquare categories normalization
      const categories = item.categories?.map((c) => c.name) || ["Restaurant"];
      
      return {
        provider: "foursquare",
        id: item.fsq_id || item.id,
        name: item.name,
        location: {
          address: item.location?.formatted_address || item.location?.address || "Address Not Available",
          lat: item.geocodes?.main?.latitude || 0,
          lon: item.geocodes?.main?.longitude || 0,
          postalCode: item.location?.postcode || ""
        },
        categories: categories,
        pricingTier: item.price || 2, // Default price tier
        premiumData: {
          rating: null, // Lazy-loaded
          photos: [], // Lazy-loaded
          hours: {}, // Lazy-loaded
          menuItems: [] // Lazy-loaded
        }
      };
    });
  }

  /**
   * Integrates lazy loaded premium fields into a standardized object.
   */
  normalizePremium(standardRestaurant, rawDetails) {
    const photos = rawDetails.photos?.map((p) => `${p.prefix}original${p.suffix}`) || [];
    
    // Normalize Foursquare hours
    const hours = {};
    if (rawDetails.hours?.regular) {
      // Simple format conversion
      hours.isOpen = rawDetails.hours.open_now;
      hours.periods = rawDetails.hours.regular.map(period => ({
        day: period.day,
        open: period.open,
        close: period.close
      }));
    }

    return {
      ...standardRestaurant,
      pricingTier: rawDetails.price || standardRestaurant.pricingTier,
      premiumData: {
        ...standardRestaurant.premiumData,
        rating: rawDetails.rating ? rawDetails.rating / 2 : null, // FS rating is out of 10, scale to 5
        photos: photos.length > 0 ? photos : this.getFallbackPhotos(standardRestaurant.categories[0]),
        hours: hours
      }
    };
  }

  // --- Mock Generators for Demo Mode ---

  generateMockSearch(query, lat, lon, radius, isNationwide = false) {
    const cuisines = ["Italian", "French Bistro", "Sushi Bar", "Steakhouse", "Burgers", "Tacos & Cantina", "Thai Cuisine"];
    const names = {
      "Italian": ["Bella Italia", "Trattoria Toscana", "Luigi's Pizza & Pasta"],
      "French Bistro": ["Le Grenier", "Chez Pierre", "Bistro Café du Paris"],
      "Sushi Bar": ["Sakura Sushi", "Oishii Rolls", "Tokyo Express"],
      "Steakhouse": ["The Golden Grate", "Steak & Fire", "Prime Cuts"],
      "Burgers": ["Buns & Brews", "The Craft Burger", "Flip Side Diner"],
      "Tacos & Cantina": ["Tres Amigos", "Cactus Cantina", "El Taco Real"],
      "Thai Cuisine": ["Golden Leaf Thai", "Pad Thai Express", "Bangkok Nights"]
    };

    const cities = [
      { name: "New York", lat: 40.7128, lon: -74.0060 },
      { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
      { name: "Chicago", lat: 41.8781, lon: -87.6298 },
      { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
      { name: "Miami", lat: 25.7617, lon: -80.1918 }
    ];

    const count = isNationwide ? 10 : 6;
    const results = [];
    
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * cuisines.length);
      const cuisine = cuisines[idx];
      const nameList = names[cuisine];
      const name = nameList[Math.floor(Math.random() * nameList.length)] + ` (${query || "Discovery"})`;
      
      let resLat = lat;
      let resLon = lon;
      let address = `${100 + i * 23} Foodie Ave, Local City`;
      
      if (isNationwide) {
        const city = cities[i % cities.length];
        resLat = city.lat + (Math.random() - 0.5) * 0.1;
        resLon = city.lon + (Math.random() - 0.5) * 0.1;
        address = `${200 + i * 15} Gastronomy Way, ${city.name}`;
      } else {
        const offsetLat = (Math.random() - 0.5) * (radius / 111000);
        const offsetLon = (Math.random() - 0.5) * (radius / (111000 * Math.cos(lat * Math.PI / 180)));
        resLat = lat + offsetLat;
        resLon = lon + offsetLon;
      }

      results.push({
        fsq_id: `fsq_mock_${i}_${Date.now()}`,
        name: name,
        location: {
          formatted_address: address,
          address: address,
          postcode: `ZIP-${30000 + i}`
        },
        geocodes: {
          main: {
            latitude: resLat,
            longitude: resLon
          }
        },
        categories: [{ id: `cat_${i}`, name: cuisine }],
        price: (i % 3) + 1
      });
    }
    return results;
  }

  generateMockDetails(fsqId) {
    return {
      rating: 8.4 + (Math.random() * 1.5 - 0.75), // raw rating 0-10
      photos: [
        { prefix: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=", suffix: "&q=80" },
        { prefix: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=", suffix: "&q=80" }
      ],
      hours: {
        open_now: true,
        regular: [
          { day: 1, open: "1100", close: "2200" },
          { day: 2, open: "1100", close: "2200" },
          { day: 3, open: "1100", close: "2200" },
          { day: 4, open: "1100", close: "2300" },
          { day: 5, open: "1100", close: "2300" },
          { day: 6, open: "1100", close: "2359" },
          { day: 7, open: "1200", close: "2100" }
        ]
      },
      price: Math.floor(Math.random() * 3) + 1
    };
  }

  getFallbackPhotos(cuisine) {
    const mapping = {
      "Italian": "https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=800&q=80",
      "French Bistro": "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80",
      "Sushi Bar": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
      "Steakhouse": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      "Burgers": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
      "Tacos & Cantina": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80",
      "Thai Cuisine": "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80"
    };
    return [mapping[cuisine] || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80"];
  }
}
