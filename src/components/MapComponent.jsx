import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Setup custom HTML/CSS map marker icon to match dark foodie theme
const createCustomIcon = (isHighlighted = false) => {
  return L.divIcon({
    className: `custom-restaurant-pin ${isHighlighted ? "highlighted" : ""}`,
    html: `
      <div class="pin-ring"></div>
      <div class="pin-dot"></div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

/**
 * ChangeMapView helper component.
 * Programmatically moves map viewpoint when center coordinates change.
 */
function ChangeMapView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom || 14, { animate: true, duration: 0.8 });
    }
  }, [center, zoom, map]);
  return null;
}

/**
 * MapComponent.jsx
 * Map visualization showing nearby restaurant markers.
 * Utilizes Leaflet (open-source) to avoid costly map engine key fees.
 */
export function MapComponent({ center, zoom = 13, restaurants, selectedId, onSelectRestaurant }) {
  const defaultCenter = [37.7749, -122.4194]; // San Francisco
  const activeCenter = center && center[0] && center[1] ? center : defaultCenter;

  return (
    <div className="map-container">
      <MapContainer
        center={activeCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false} // Disable to position zoom control in custom place or hide
      >
        {/* OpenStreetMap Dark Styled Tile Server */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Dynamic center sync view controller */}
        <ChangeMapView center={activeCenter} zoom={zoom} />

        {/* Restaurant Pins */}
        {restaurants.map((res) => {
          const lat = res.location.lat;
          const lon = res.location.lon;

          if (!lat || !lon) return null;

          const isSelected = res.id === selectedId;

          return (
            <Marker
              key={res.id}
              position={[lat, lon]}
              icon={createCustomIcon(isSelected)}
              eventHandlers={{
                click: () => onSelectRestaurant(res)
              }}
            >
              <Popup>
                <div style={{ color: "#f3f4f6", fontFamily: "Outfit, sans-serif" }}>
                  <h4 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px" }}>{res.name}</h4>
                  <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "6px" }}>{res.location.address}</p>
                  <span className={`provider-badge badge-${res.provider}`} style={{ display: "inline-block" }}>
                    {res.provider}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
