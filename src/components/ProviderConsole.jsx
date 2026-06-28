import React, { useState, useEffect } from "react";

/**
 * ProviderConsole.jsx
 * Debug & Telemetry console overlay.
 * Allows the user to clear the Web Crypto cache and simulate API quota errors (429/403)
 * to test the transparent provider failover rotation.
 */
export function ProviderConsole({ 
  activeProvider, 
  forceErrorProvider, 
  setForceErrorProvider, 
  onClearCache, 
  telemetryLogs 
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [fsqKeyExists, setFsqKeyExists] = useState(false);
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [tomtomKeyExists, setTomtomKeyExists] = useState(false);

  useEffect(() => {
    // Check key presence in environment
    const fsq = import.meta.env?.VITE_FSQ_KEY;
    const goog = import.meta.env?.VITE_GOOGLE_KEY;
    const tom = import.meta.env?.VITE_TOMTOM_KEY;
    
    setFsqKeyExists(!!fsq && !fsq.includes("your_"));
    setGoogleKeyExists(!!goog && !goog.includes("your_"));
    setTomtomKeyExists(!!tom && !tom.includes("your_"));
  }, []);

  const toggleSimulateError = (prov) => {
    if (forceErrorProvider === prov) {
      setForceErrorProvider(null);
    } else {
      setForceErrorProvider(prov);
    }
  };

  if (!isOpen) {
    return (
      <button 
        className="console-btn" 
        style={{ position: "absolute", bottom: "20px", right: "20px", width: "auto", zIndex: 1010, boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}
        onClick={() => setIsOpen(true)}
      >
        🛠️ Open Control Console
      </button>
    );
  }

  return (
    <div className="console-widget" id="developer-console">
      <div className="console-header">
        <h4>🛠️ Telemetry Control Console</h4>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className="status-indicator"></span>
          <button 
            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "1rem" }}
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="console-body">
        <div className="console-row">
          <span className="console-label">Active Provider:</span>
          <span className={`provider-badge badge-${activeProvider}`}>{activeProvider}</span>
        </div>

        <div className="console-row">
          <span className="console-label">API Keys Status:</span>
          <div style={{ display: "flex", gap: "4px", fontSize: "0.65rem" }}>
            <span style={{ color: fsqKeyExists ? "#10b981" : "#ef4444" }}>FSQ {fsqKeyExists ? "✓" : "✗"}</span>
            <span style={{ color: googleKeyExists ? "#10b981" : "#ef4444" }}>GOOG {googleKeyExists ? "✓" : "✗"}</span>
            <span style={{ color: tomtomKeyExists ? "#10b981" : "#ef4444" }}>TOM {tomtomKeyExists ? "✓" : "✗"}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px" }}>
          <span className="console-label" style={{ display: "block", marginBottom: "6px" }}>Simulate API Quota Error (429/403):</span>
          <div style={{ display: "flex", gap: "6px" }}>
            {["foursquare", "google", "tomtom"].map((prov) => {
              const isSimulating = forceErrorProvider === prov;
              return (
                <button
                  key={prov}
                  className={`console-btn ${isSimulating ? "" : "console-btn-danger"}`}
                  style={{ 
                    flex: 1, 
                    fontSize: "0.65rem", 
                    padding: "6px 2px",
                    backgroundColor: isSimulating ? "#ef4444" : "transparent"
                  }}
                  onClick={() => toggleSimulateError(prov)}
                >
                  {isSimulating ? `ERR ${prov.toUpperCase()}` : `Block ${prov.substring(0, 4)}`}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button className="console-btn console-btn-danger" style={{ flex: 1 }} onClick={onClearCache}>
            🧹 Clear Cache
          </button>
        </div>

        <div className="console-logs">
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9ca3af", marginBottom: "4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            LIVE FAILOVER TELEMETRY LOGS:
          </div>
          {telemetryLogs.length === 0 ? (
            <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>No transaction logged yet.</div>
          ) : (
            telemetryLogs.slice(0, 8).map((log, idx) => {
              let logClass = "info";
              if (log.action.includes("FAILURE") || log.action.includes("ROTATION")) logClass = "fail";
              if (log.action.includes("SUCCESS") || log.action.includes("CACHE_HIT")) logClass = "success";
              
              return (
                <div key={idx} className={`log-entry ${logClass}`}>
                  [{log.timestamp.split("T")[1].substring(0,8)}] {log.action}: {log.message}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
