import axios from "axios";
import { BaseService } from "./BaseService.js";

/**
 * GooglePlacesProvider.js
 * Implementation of Google Places (New API) with Field Masking cost optimization.
 * Initially fetches ID, DisplayName, and FormattedAddress (Field Masking).
 * Lazy-loads Ratings, Photos, Hours, PriceLevel on selection.
 */
export class GooglePlacesProvider extends BaseService {
  constructor() {
    super("google");
    this.apiKey = import.meta.env?.VITE_GOOGLE_KEY || "";
    this.isDemo = !this.apiKey || this.apiKey.includes("your_");
  }

  /**
   * Performs restaurant search via Google Places New API with Field Masking.
   */
  async fetchData(params) {
    const { query, lat, lon, radius = 5000, isNationwide = false } = params;

    if (this.isDemo) {
      console.log(`[GooglePlacesProvider] Running in DEMO mode for query: "${query}" (Nationwide: ${isNationwide})`);
      return this.generateMockSearch(query, lat, lon, radius, isNationwide);
    }

    try {
      // New Google Places Search API endpoint
      const response = await axios.post(
        "https://places.googleapis.com/v1/places:searchText",
        {
          textQuery: query || "restaurants",
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: radius
            }
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            // Cost-Containment: Field Masking (only ID, DisplayName, FormattedAddress, Location)
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location"
          }
        }
      );
      return response.data.places;
    } catch (error) {
      console.error("[GooglePlacesProvider] API error:", error);
      throw error;
    }
  }

  /**
   * Fetches detailed/premium fields (Rating, Photos, Hours, PriceLevel) for a specific venue.
   */
  async fetchDetails(placeId) {
    if (this.isDemo) {
      console.log(`[GooglePlacesProvider] DEMO premium fetch for: ${placeId}`);
      return this.generateMockDetails(placeId);
    }

    try {
      // New Google Places Details endpoint
      const response = await axios.get(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            // Lazy load premium billing fields
            "X-Goog-FieldMask": "id,rating,photos,regularOpeningHours,priceLevel"
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error("[GooglePlacesProvider] Premium Details API error:", error);
      throw error;
    }
  }

  /**
   * Normalizes the Google search response (Only standard Pro fields mapped).
   */
  normalize(rawPlaces) {
    if (!Array.isArray(rawPlaces)) return [];

    return rawPlaces.map((place) => {
      return {
        provider: "google",
        id: place.id,
        name: place.displayName?.text || "Unknown Google Place",
        location: {
          address: place.formattedAddress || "Address Not Available",
          lat: place.location?.latitude || 0,
          lon: place.location?.longitude || 0,
          postalCode: "" // Google Places searchText doesn't split postal code directly unless geocoded
        },
        categories: ["Restaurant"], // Default category
        pricingTier: 2, // Standard default
        premiumData: {
          rating: null,
          photos: [],
          hours: {},
          menuItems: []
        }
      };
    });
  }

  /**
   * Enriches standard restaurant item with Google Premium fields.
   */
  normalizePremium(standardRestaurant, rawDetails) {
    // Map Google price level (PRICE_LEVEL_INEXPENSIVE = 1, etc.)
    const pricingMap = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4
    };
    const priceLevel = pricingMap[rawDetails.priceLevel] || 2;

    // Normalize photos (Google returns reference keys; in real app, we query photo endpoint)
    const photos = rawDetails.photos?.slice(0, 3).map((photo) => {
      // In production, we construct the photo url:
      // `https://places.googleapis.com/v1/${photo.name}/media?key=${this.apiKey}&maxWidthPx=800`
      return `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80`;
    }) || [];

    // Normalize opening hours
    const hours = {};
    if (rawDetails.regularOpeningHours) {
      hours.isOpen = rawDetails.regularOpeningHours.openNow;
      hours.periods = rawDetails.regularOpeningHours.periods?.map((period) => ({
        day: period.open?.day,
        open: `${period.open?.hour || ""}${period.open?.minute || ""}`,
        close: `${period.close?.hour || ""}${period.close?.minute || ""}`
      })) || [];
    }

    return {
      ...standardRestaurant,
      pricingTier: priceLevel,
      premiumData: {
        ...standardRestaurant.premiumData,
        rating: rawDetails.rating || null,
        photos: photos.length > 0 ? photos : this.getFallbackPhotos(),
        hours: hours
      }
    };
  }

  // --- Mock Generators for Demo Mode ---

  generateMockSearch(query, lat, lon, radius, isNationwide = false) {
    const names = [
      "The Garden Room", "Burger Joint Central", "Pizzeria Milano", 
      "Gourmet Grill", "Sushi House Google", "Taco Town", "Subway Station"
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
      const name = names[i % names.length] + ` (${query || "Google Bias"})`;
      let resLat = lat;
      let resLon = lon;
      let address = `${500 + i * 12} Google Way, Tech Valley`;

      if (isNationwide) {
        const city = cities[i % cities.length];
        resLat = city.lat + (Math.random() - 0.5) * 0.1;
        resLon = city.lon + (Math.random() - 0.5) * 0.1;
        address = `${600 + i * 18} Search Blvd, ${city.name}`;
      } else {
        const offsetLat = (Math.random() - 0.5) * (radius / 111000);
        const offsetLon = (Math.random() - 0.5) * (radius / (111000 * Math.cos(lat * Math.PI / 180)));
        resLat = lat + offsetLat;
        resLon = lon + offsetLon;
      }

      results.push({
        id: `goog_mock_${i}_${Date.now()}`,
        displayName: { text: name },
        formattedAddress: address,
        location: {
          latitude: resLat,
          longitude: resLon
        }
      });
    }

    return results;
  }

  generateMockDetails(placeId) {
    return {
      id: placeId,
      rating: 4.2 + (Math.random() * 0.8),
      priceLevel: "PRICE_LEVEL_MODERATE",
      photos: [{ name: "mock_photo_ref" }],
      regularOpeningHours: {
        openNow: true,
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } },
          { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 22, minute: 0 } },
          { open: { day: 3, hour: 9, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } },
          { open: { day: 4, hour: 9, minute: 0 }, close: { day: 4, hour: 22, minute: 0 } },
          { open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 23, minute: 0 } }
        ]
      }
    };
  }

  getFallbackPhotos() {
    return ["https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80"];
  }
}
