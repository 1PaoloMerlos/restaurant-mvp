import React, { useState, useEffect, useRef } from "react";

const CUISINES = [
  "Italian", "French Bistro", "Sushi Bar", "Steakhouse", 
  "Burgers", "Tacos & Cantina", "Thai Cuisine", "Pizza", "Salads"
];

/**
 * Autocomplete.jsx
 * Keystroke debounced search input component.
 * Limits query frequency (300ms debounce) to prevent API quota drain.
 */
export function Autocomplete({ onSearch }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search trigger for suggestions
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (query.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      // Filter list of pre-defined categories/cuisines as cost-free autocomplete
      const filtered = CUISINES.filter((item) =>
        item.toLowerCase().includes(query.toLowerCase())
      );
      
      // Also add user query itself as a search suggestion option
      if (!filtered.includes(query)) {
        filtered.unshift(query);
      }
      
      setSuggestions(filtered.slice(0, 5));
    }, 300); // 300ms Cost-containment debounce

    return () => clearTimeout(debounceTimer.current);
  }, [query]);

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setShowDropdown(true);
  };

  const handleSuggestionClick = (value) => {
    setQuery(value);
    setShowDropdown(false);
    onSearch(value);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setShowDropdown(false);
      onSearch(query);
    }
  };

  return (
    <div className="search-container" ref={dropdownRef}>
      <form onSubmit={handleFormSubmit}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search cuisines, restaurants..."
            value={query}
            onChange={handleInputChange}
            onFocus={() => setShowDropdown(true)}
            id="autocomplete-input"
          />
        </div>
      </form>

      {showDropdown && suggestions.length > 0 && (
        <ul className="suggestions-dropdown" id="autocomplete-suggestions">
          {suggestions.map((item, idx) => (
            <li
              key={idx}
              className="suggestion-item"
              onClick={() => handleSuggestionClick(item)}
            >
              🍽️ {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
