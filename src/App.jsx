import React, { useState, useEffect, useRef } from "react";
import { ServiceWrapper } from "./services/ServiceWrapper.js";
import { Autocomplete } from "./components/Autocomplete.jsx";
import { MapComponent } from "./components/MapComponent.jsx";
import { ProviderConsole } from "./components/ProviderConsole.jsx";

// Standard Leaflet style imports
import "leaflet/dist/leaflet.css";

// Instantiate Service Wrapper (outside of component lifecycle to persist state)
const serviceWrapper = new ServiceWrapper();

export default function App() {
  const [center, setCenter] = useState([37.7749, -122.4194]); // Default SF
  const [zoom, setZoom] = useState(13); // Default map zoom
  const [isNationwide, setIsNationwide] = useState(false); // Nationwide Search option
  const [locationError, setLocationError] = useState(false); // Geolocation error tracker
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  
  const [activeProvider, setActiveProvider] = useState(serviceWrapper.activeProviderName);
  const [forceErrorProvider, setForceErrorProvider] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState(serviceWrapper.telemetryLogs);
  
  // Filter States
  const [cuisineFilter, setCuisineFilter] = useState("All");
  const [priceFilter, setPriceFilter] = useState(null); // null = all, 1-4 = specific
  const [premiumOnly, setPremiumOnly] = useState(false); // filters where rating >= 4.0

  // Load initial search on mount, querying browser geolocation to center results on the user
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCenter([latitude, longitude]);
          setLocationError(false);
          executeSearch("restaurants", latitude, longitude, false);
        },
        (error) => {
          console.warn("Geolocation permission denied or failed. Falling back to default center.", error);
          setLocationError(true);
          executeSearch("restaurants", 37.7749, -122.4194, false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      console.warn("Geolocation is not supported by this browser. Falling back to default center.");
      setLocationError(true);
      executeSearch("restaurants", 37.7749, -122.4194, false);
    }
  }, []);

  // Sync telemetry logs regularly from wrapper
  const updateTelemetry = () => {
    setTelemetryLogs([...serviceWrapper.telemetryLogs]);
    setActiveProvider(serviceWrapper.activeProviderName);
  };

  /**
   * Dispatches the search action to the Service Wrapper.
   */
  const executeSearch = async (queryText, lat, lon, forceNationwide = null) => {
    setIsLoading(true);
    updateTelemetry();

    const activeNationwideMode = forceNationwide !== null ? forceNationwide : isNationwide;

    try {
      const searchParams = {
        query: queryText,
        lat: lat,
        lon: lon,
        radius: activeNationwideMode ? 5000000 : 5000,
        isNationwide: activeNationwideMode
      };

      const resultObj = await serviceWrapper.search(searchParams, forceErrorProvider);
      setRestaurants(resultObj.results);

      if (activeNationwideMode) {
        setCenter([39.8283, -98.5795]); // U.S. Geographical Center
        setZoom(4); // Continental view zoom out
      } else if (resultObj.results && resultObj.results.length > 0) {
        const first = resultObj.results[0];
        setCenter([first.location.lat, first.location.lon]);
        setZoom(13); // Local zoom
      }
      
      // Close details panel on new search to avoid profile mismatch
      setIsDetailsOpen(false);
      setSelectedRestaurant(null);
    } catch (error) {
      console.error("Search execution failed:", error);
      alert("All service providers exhausted. Please check your developer console/logs.");
    } finally {
      setIsLoading(false);
      updateTelemetry();
    }
  };

  const handleSearchSubmit = (value) => {
    executeSearch(value, center[0], center[1]);
  };

  /**
   * Triggers lazy-loading of premium fields when a user selects a restaurant.
   */
  const handleSelectRestaurant = async (res) => {
    setSelectedRestaurant(res);
    setIsDetailsOpen(true);
    setIsDetailsLoading(true);
    updateTelemetry();

    try {
      const enrichedDetails = await serviceWrapper.getDetails(res);
      setSelectedRestaurant(enrichedDetails);
      
      // Update restaurant in lists so cached elements are synced
      setRestaurants((prev) =>
        prev.map((item) => (item.id === res.id ? enrichedDetails : item))
      );
    } catch (err) {
      console.error("Failed to lazy load premium details:", err);
    } finally {
      setIsDetailsLoading(false);
      updateTelemetry();
    }
  };

  const handleClearCache = () => {
    localStorage.clear();
    serviceWrapper.telemetryLogs = [];
    serviceWrapper.logTelemetry(
      `evt_${Date.now()}`,
      "CACHE_CLEAR",
      "Cryptographic local storage cache cleared by user.",
      "system",
      "N/A"
    );
    updateTelemetry();
    setRestaurants([]);
    setSelectedRestaurant(null);
    setIsDetailsOpen(false);
  };

  // Get distinct cuisines/categories from current list for filtering
  const availableCuisines = ["All", ...new Set(restaurants.flatMap((r) => r.categories))];

  // Filtering calculations
  const filteredRestaurants = restaurants.filter((res) => {
    const matchesCuisine = cuisineFilter === "All" || res.categories.includes(cuisineFilter);
    const matchesPrice = priceFilter === null || res.pricingTier === priceFilter;
    const matchesPremium = !premiumOnly || (res.premiumData?.rating && res.premiumData.rating >= 4.0);
    return matchesCuisine && matchesPrice && matchesPremium;
  });

  return (
    <div className="app-container">
      {/* 1. Sidebar - Search Results & Navigation */}
      <aside className="sidebar">
        <div className="app-header">
          <div className="brand">
            <span className="brand-icon">🍕</span>
            <h1>DineDiscover MVP</h1>
          </div>
          {locationError && (
            <div style={{ fontSize: "0.75rem", color: "var(--warning)", backgroundColor: "rgba(245, 158, 11, 0.08)", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(245, 158, 11, 0.15)", width: "100%", textAlign: "center" }}>
              ⚠️ Location disabled. Enable <b>Nationwide Mode</b> below to see restaurants across the USA.
            </div>
          )}
          
          {/* Keystroke Debounced Autocomplete */}
          <Autocomplete onSearch={handleSearchSubmit} />
        </div>

        {/* Results Panel */}
        <div className="results-container">
          {isLoading ? (
            <div className="empty-state">
              <div style={{ fontSize: "1.5rem" }} className="loading-spinner">⌛</div>
              <p>Fetching restaurants from provider hierarchy...</p>
            </div>
          ) : filteredRestaurants.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">🍽️</span>
              <p>No restaurants match your active search filters.</p>
            </div>
          ) : (
            filteredRestaurants.map((res) => {
              const isSelected = selectedRestaurant?.id === res.id;
              
              return (
                <div
                  key={res.id}
                  className={`restaurant-card ${isSelected ? "selected" : ""}`}
                  onClick={() => handleSelectRestaurant(res)}
                >
                  <div className="card-header">
                    <h3 className="card-title">{res.name}</h3>
                    <span className={`provider-badge badge-${res.provider}`}>
                      {res.provider}
                    </span>
                  </div>

                  <p className="card-address">{res.location.address}</p>

                  <div className="card-footer">
                    <span className="card-cuisine">{res.categories[0]}</span>
                    
                    {/* Render dollar signs for pricing tier */}
                    <span className="card-price">
                      {[1, 2, 3, 4].map((tier) => (
                        <span
                          key={tier}
                          className={tier <= res.pricingTier ? "price-active" : "price-inactive"}
                        >
                          $
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. Slide-In Details Panel (Lazy Loaded Premium Data) */}
        <div className={`details-panel ${isDetailsOpen ? "open" : ""}`} id="details-slider">
          {selectedRestaurant && (
            <>
              {/* Lazy-loaded photos in header */}
              <div 
                className="details-header" 
                style={{ 
                  backgroundImage: `url(${
                    selectedRestaurant.premiumData?.photos?.[0] || 
                    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80"
                  })` 
                }}
              >
                <button className="details-close-btn" onClick={() => setIsDetailsOpen(false)}>
                  ✕
                </button>
                <div className="details-header-overlay">
                  <span className={`provider-badge badge-${selectedRestaurant.provider}`} style={{ width: "fit-content" }}>
                    {selectedRestaurant.provider}
                  </span>
                  <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{selectedRestaurant.name}</h2>
                </div>
              </div>

              <div className="details-content">
                {isDetailsLoading ? (
                  <div className="empty-state">
                    <div style={{ fontSize: "1.2rem" }}>⌛</div>
                    <p>Loading premium details (Photos, Ratings, Hours & Menu)...</p>
                  </div>
                ) : (
                  <>
                    <div className="rating-container">
                      <div className="stars">
                        {"★".repeat(Math.round(selectedRestaurant.premiumData?.rating || 0)) + 
                         "☆".repeat(5 - Math.round(selectedRestaurant.premiumData?.rating || 0))}
                      </div>
                      <span className="rating-value">
                        {selectedRestaurant.premiumData?.rating?.toFixed(1) || "N/A"}
                      </span>
                      <span className="rating-label">provider rating</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontWeight: 600 }}>📍 LOCATION</span>
                      <p style={{ fontSize: "0.95rem", lineHeight: 1.4 }}>{selectedRestaurant.location.address}</p>
                    </div>

                    {/* Lazy-loaded Hours periods */}
                    {selectedRestaurant.premiumData?.hours?.periods && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontWeight: 600 }}>🕒 BUSINESS HOURS</span>
                        <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {selectedRestaurant.premiumData.hours.isOpen ? (
                            <span style={{ color: "#10b981", fontWeight: 600 }}>Open Now</span>
                          ) : (
                            <span style={{ color: "#ef4444", fontWeight: 600 }}>Closed</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Integrated Documenu Items */}
                    <div className="menu-section">
                      <h3>🍽️ Specialty Menu (Documenu Integration)</h3>
                      <div className="menu-list">
                        {selectedRestaurant.premiumData?.menuItems?.map((dish, i) => (
                          <div key={i} className="menu-item">
                            <div className="menu-item-details">
                              <span className="menu-item-name">{dish.name}</span>
                              <span className="menu-item-description">{dish.description}</span>
                            </div>
                            <span className="menu-item-price">${dish.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* 3. Interactive Leaflet Map View */}
      <MapComponent
        center={center}
        zoom={zoom}
        restaurants={filteredRestaurants}
        selectedId={selectedRestaurant?.id}
        onSelectRestaurant={handleSelectRestaurant}
      />

      {/* 4. Filter Overlays (Sits above map) */}
      <div className="filter-overlay">
        {/* Nationwide toggle chip */}
        <button
          className={`filter-chip ${isNationwide ? "active" : ""}`}
          onClick={() => {
            const nextMode = !isNationwide;
            setIsNationwide(nextMode);
            executeSearch(cuisineFilter === "All" ? "restaurants" : cuisineFilter, center[0], center[1], nextMode);
          }}
          style={{ border: isNationwide ? "1px solid var(--secondary)" : "1px solid rgba(255,255,255,0.07)" }}
        >
          🇺🇸 {isNationwide ? "Nationwide Mode" : "Local Mode"}
        </button>
        {/* Cuisine Filter Select */}
        <select 
          className="filter-chip"
          style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)" }}
          value={cuisineFilter}
          onChange={(e) => setCuisineFilter(e.target.value)}
        >
          <option value="All">All Cuisines</option>
          {availableCuisines.filter(c => c !== "All").map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Pricing filter */}
        <button 
          className={`filter-chip ${priceFilter === null ? "" : "active"}`}
          onClick={() => {
            if (priceFilter === null) setPriceFilter(1);
            else if (priceFilter === 4) setPriceFilter(null);
            else setPriceFilter(priceFilter + 1);
          }}
        >
          💰 {priceFilter === null ? "Any Price" : "$".repeat(priceFilter)}
        </button>

        {/* Premium items filter */}
        <button
          className={`filter-chip ${premiumOnly ? "active" : ""}`}
          onClick={() => setPremiumOnly(!premiumOnly)}
        >
          ⭐ Premium Rated (4+)
        </button>
      </div>

      {/* 5. Telemetry & Failover Debug Overlay */}
      <ProviderConsole
        activeProvider={activeProvider}
        forceErrorProvider={forceErrorProvider}
        setForceErrorProvider={setForceErrorProvider}
        onClearCache={handleClearCache}
        telemetryLogs={telemetryLogs}
      />
    </div>
  );
}
