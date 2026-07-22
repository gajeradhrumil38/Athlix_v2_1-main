import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GpsPoint } from '../utils/gpsCalculations';
import { douglasPeucker, catmullRomPath } from '../utils/gpsCalculations';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet's broken default icon URLs when bundled with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const currentPositionIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;
    background:var(--accent,#C8FF00);
    border:3px solid #0d0f14;
    border-radius:50%;
    box-shadow:0 0 12px rgba(200,255,0,0.55);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapAutoCenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  const lastCenterRef = useRef<[number, number] | null>(null);
  const lastCenterUpdateAtRef = useRef(0);

  useEffect(() => {
    if (!center) return;

    const now = Date.now();
    const lastCenter = lastCenterRef.current;
    const movedMeters = lastCenter ? map.distance(lastCenter, center) : Number.POSITIVE_INFINITY;
    const shouldRecenter = movedMeters >= 8 || now - lastCenterUpdateAtRef.current >= 1200;

    if (!shouldRecenter) return;

    map.setView(center, map.getZoom(), { animate: false });
    lastCenterRef.current = center;
    lastCenterUpdateAtRef.current = now;
  }, [center, map]);
  return null;
}

interface RunMapProps {
  path: GpsPoint[];
  currentPosition: GpsPoint | null;
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209]; // fallback center

const RunMapView: React.FC<RunMapProps> = ({ path, currentPosition }) => {
  const center: [number, number] | null = currentPosition
    ? [currentPosition.lat, currentPosition.lng]
    : null;
  const polylinePositions = useMemo(() => {
    if (path.length < 2) return path.map(p => [p.lat, p.lng] as [number, number]);
    // Light simplification (1.5 m tolerance) — removes collinear points on straight roads.
    // Catmull-Rom then generates a smooth curve through the remaining waypoints.
    const simplified = douglasPeucker(path, 1.5e-5);
    return catmullRomPath(simplified, 6);
  }, [path]);

  return (
    <div className="h-full w-full overflow-hidden">
      <style>{`
        /* Match CARTO dark tile background — unloaded tiles are dark, not white */
        .leaflet-container { background: #0d0f14 !important; }
        /* Promote tiles to their own compositor layer to avoid blink on zoom */
        .leaflet-tile { will-change: transform; }
        .leaflet-zoom-anim .leaflet-zoom-animated { will-change: transform; }
        /* We show attribution in the app footer — hide Leaflet's duplicate */
        .leaflet-control-attribution { display: none !important; }
      `}</style>
      <MapContainer
        center={center ?? DEFAULT_CENTER}
        zoom={16}
        style={{ height: '100%', width: '100%', background: '#0d0f14' }}
        zoomControl={false}
        preferCanvas
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          keepBuffer={8}
          updateWhenZooming={false}
          updateWhenIdle
        />

        <MapAutoCenter center={center} />

        {polylinePositions.length > 1 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: '#C8FF00', weight: 4, opacity: 0.9 }}
          />
        )}

        {currentPosition && (
          <Marker
            position={[currentPosition.lat, currentPosition.lng]}
            icon={currentPositionIcon}
          />
        )}
      </MapContainer>
    </div>
  );
};

export const RunMap = React.memo(
  RunMapView,
  (prev, next) => prev.path === next.path && prev.currentPosition === next.currentPosition,
);
