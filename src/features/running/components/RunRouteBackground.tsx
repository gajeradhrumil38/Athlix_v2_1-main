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

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'blur(1.5px) brightness(0.58) saturate(1.1)',
        opacity: 0.98,
      }}
    >
      <style>{`
        .rrbg .leaflet-container { background: #0d0f14 !important; }
        .rrbg .leaflet-control-attribution,
        .rrbg .leaflet-control-zoom { display: none !important; }
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
              pathOptions={{ color: '#C8FF00', weight: 11, opacity: 1 }}
            />
          )}
          <FitRoute path={path} />
        </MapContainer>
      </div>
    </div>
  );
};
