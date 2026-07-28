import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GpsPoint } from '../utils/gpsCalculations';
import { douglasPeucker, catmullRomPath } from '../utils/gpsCalculations';

const FALLBACK: [number, number] = [28.6139, 77.209];

function FitRoute({ path }: { path: GpsPoint[] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (path.length > 1) {
      const bounds = L.latLngBounds(path.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [70, 70], animate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export const RunRouteBackground: React.FC<{ path: GpsPoint[] }> = ({ path }) => {
  const center: [number, number] =
    path.length > 0
      ? [
          path.reduce((s, p) => s + p.lat, 0) / path.length,
          path.reduce((s, p) => s + p.lng, 0) / path.length,
        ]
      : FALLBACK;

  const smoothPath = useMemo(() => {
    if (path.length < 2) return path.map(p => [p.lat, p.lng] as [number, number]);
    const simplified = douglasPeucker(path, 2.5e-5);
    return catmullRomPath(simplified, 8);
  }, [path]);

  // Leaflet's SVG renderer sets this as a plain `stroke` attribute, not an
  // inline style, so a literal `var(--accent)` string wouldn't resolve —
  // read the actual computed color instead of hardcoding the hex value,
  // so a future accent-color change doesn't leave the route color behind.
  const accentColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C8FF00',
    [],
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        // Blur/saturate only — NOT brightness. CARTO's dark_all tiles
        // measure ~11/255 average brightness on their own (verified by
        // sampling one directly); the brightness(0.58) this used to carry
        // darkened an already near-black tile even further, past the point
        // of being visible at all — the map read as a plain black void
        // with just the route line floating on it. The tile-specific boost
        // below (same fix already applied to the run history map panels)
        // happens BEFORE this blur, so it's safe to keep the softness here.
        filter: 'blur(1.5px) saturate(1.1)',
        opacity: 0.98,
      }}
    >
      <style>{`
        .rrbg .leaflet-container { background: #0d0f14 !important; }
        .rrbg .leaflet-control-attribution,
        .rrbg .leaflet-control-zoom { display: none !important; }
        .rrbg .leaflet-tile { filter: brightness(2.6) contrast(1.3); }
      `}</style>
      <div className="rrbg" style={{ position: 'absolute', inset: 0 }}>
        <MapContainer
          center={center}
          zoom={14}
          style={{ height: '100%', width: '100%', background: '#0d0f14' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          touchZoom={false}
          doubleClickZoom={false}
          keyboard={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution=""
            keepBuffer={4}
            updateWhenZooming={false}
          />
          {smoothPath.length > 1 && (
            <Polyline
              positions={smoothPath}
              pathOptions={{ color: accentColor, weight: 11, opacity: 1 }}
            />
          )}
          <FitRoute path={path} />
        </MapContainer>
      </div>
    </div>
  );
};
