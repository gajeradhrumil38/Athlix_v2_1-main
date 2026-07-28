import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed, Scan } from 'lucide-react';
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

// Auto-recenters on the runner's position while `followMode` is on. A real
// user drag or pinch always fires Leaflet's 'dragstart'/'zoomstart' events —
// our own programmatic setView() below never does (it keeps the zoom level
// unchanged, so Leaflet skips the zoom events, and setView never fires
// 'dragstart' since that's specific to actual pointer/touch dragging) — so
// these are a reliable signal that the runner touched the map themselves,
// used to drop out of follow mode so their pan/zoom isn't fought every 1-2s.
function MapFollowController({
  center, followMode, onUserInteract,
}: { center: [number, number] | null; followMode: boolean; onUserInteract: () => void }) {
  const map = useMap();
  const lastCenterRef = useRef<[number, number] | null>(null);
  const lastCenterUpdateAtRef = useRef(0);

  useEffect(() => {
    map.on('dragstart', onUserInteract);
    map.on('zoomstart', onUserInteract);
    return () => {
      map.off('dragstart', onUserInteract);
      map.off('zoomstart', onUserInteract);
    };
  }, [map, onUserInteract]);

  useEffect(() => {
    if (!followMode || !center) return;

    const now = Date.now();
    const lastCenter = lastCenterRef.current;
    const movedMeters = lastCenter ? map.distance(lastCenter, center) : Number.POSITIVE_INFINITY;
    const shouldRecenter = movedMeters >= 8 || now - lastCenterUpdateAtRef.current >= 1200;

    if (!shouldRecenter) return;

    map.setView(center, map.getZoom(), { animate: false });
    lastCenterRef.current = center;
    lastCenterUpdateAtRef.current = now;
  }, [center, map, followMode]);
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

  // Leaflet's SVG renderer sets this as a plain `stroke` attribute, not an
  // inline style, so a literal `var(--accent)` string wouldn't resolve —
  // read the actual computed color instead of hardcoding the hex value.
  const accentColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C8FF00',
    [],
  );

  const mapRef = useRef<L.Map | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const onUserInteract = useCallback(() => setFollowMode(false), []);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (map && center) map.setView(center, map.getZoom(), { animate: true });
    setFollowMode(true);
  };

  const handleFitRoute = () => {
    if (path.length < 2 || !mapRef.current) return;
    const bounds = L.latLngBounds(path.map((p) => [p.lat, p.lng] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [56, 56] });
    setFollowMode(false);
  };

  return (
    <div className="h-full w-full overflow-hidden" style={{ position: 'relative' }}>
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
        ref={mapRef}
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

        <MapFollowController center={center} followMode={followMode} onUserInteract={onUserInteract} />

        {polylinePositions.length > 1 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: accentColor, weight: 4, opacity: 0.9 }}
          />
        )}

        {currentPosition && (
          <Marker
            position={[currentPosition.lat, currentPosition.lng]}
            icon={currentPositionIcon}
          />
        )}
      </MapContainer>

      {/* Free-look controls: pinch/drag drops out of follow mode (see
          MapFollowController) so the runner can freely explore the traced
          route without it snapping back every 1-2s; these bring it back. */}
      <div className="absolute flex flex-col gap-2" style={{ top: 96, right: 14, zIndex: 30 }}>
        {path.length > 1 && (
          <button
            onClick={handleFitRoute}
            aria-label="Fit whole route on screen"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90"
            style={{ background: 'rgba(13,15,20,0.8)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)' }}
          >
            <Scan className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.85)' }} />
          </button>
        )}
        {!followMode && currentPosition && (
          <button
            onClick={handleRecenter}
            aria-label="Recenter on my location"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90"
            style={{ background: 'var(--accent)', boxShadow: '0 0 0 4px rgba(200,255,0,0.14), 0 6px 18px rgba(0,0,0,0.4)' }}
          >
            <LocateFixed className="h-4 w-4" style={{ color: '#0d0f14' }} />
          </button>
        )}
      </div>
    </div>
  );
};

export const RunMap = React.memo(
  RunMapView,
  (prev, next) => prev.path === next.path && prev.currentPosition === next.currentPosition,
);
