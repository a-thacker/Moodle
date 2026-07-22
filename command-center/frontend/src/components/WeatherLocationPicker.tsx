// Small modal to change the dashboard's weather location: search a city
// (Open-Meteo geocoding, keyless) or use the device's location services.
// Rendered at the dashboard root so its overlay isn't clipped by the hero tile.

import { useState } from "react";

export interface WeatherLoc {
  lat: number;
  lon: number;
  label: string;
}

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export default function WeatherLocationPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (loc: WeatherLoc | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    setResults([]);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en&format=json`,
      );
      const data = await res.json();
      const rows: GeoResult[] = data.results ?? [];
      setResults(rows);
      if (rows.length === 0) setErr("No matching places.");
    } catch {
      setErr("Search failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setErr("Location services aren't available on this device.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onPick({ lat: r3(p.coords.latitude), lon: r3(p.coords.longitude), label: "My location" });
        setBusy(false);
      },
      () => {
        setErr("Couldn't get your location (permission denied?).");
        setBusy(false);
      },
      { timeout: 10000 },
    );
  }

  function pick(g: GeoResult) {
    const label = [g.name, g.admin1].filter(Boolean).slice(0, 2).join(", ");
    onPick({ lat: r3(g.latitude), lon: r3(g.longitude), label });
  }

  const itemBtn: React.CSSProperties = {
    width: "100%", textAlign: "left", background: "var(--cc-tile)", border: "1px solid #262a3b",
    borderRadius: 9, padding: "9px 12px", cursor: "pointer", color: "var(--cc-text)", fontSize: 13.5,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh", zIndex: 60 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 380, maxWidth: "90vw", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ph ph-map-pin" style={{ color: "var(--cc-accent)", fontSize: 18 }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>Weather location</span>
        </div>

        <form onSubmit={search} style={{ display: "flex", gap: 8 }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city…" autoFocus style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "…" : "Search"}</button>
        </form>

        <button type="button" className="btn" onClick={useMyLocation} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <i className="ph ph-crosshair" style={{ fontSize: 15 }} /> Use my location
        </button>

        {err && <div style={{ fontSize: 12.5, color: "var(--color-accent-200)" }}>{err}</div>}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {results.map((g, i) => (
              <button key={i} type="button" style={itemBtn} onClick={() => pick(g)}>
                {g.name}
                <span style={{ color: "var(--cc-muted)" }}>
                  {g.admin1 ? `, ${g.admin1}` : ""}{g.country_code ? ` · ${g.country_code}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={() => onPick(null)}
          style={{ background: "none", border: "none", color: "var(--cc-muted)", fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer", alignSelf: "flex-start" }}>
          reset to default
        </button>
      </div>
    </div>
  );
}
