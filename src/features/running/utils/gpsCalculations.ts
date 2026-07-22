export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

// ─── Kalman Filter ────────────────────────────────────────────────────────────
// Applied per-axis (lat, lng) to smooth out GPS measurement noise in real time.
// Q: process noise — how much we expect position to drift between updates.
// R: measurement noise — derived from reported GPS accuracy.
class KalmanFilter1D {
  private Q: number;
  private P = 1;
  private x: number | null = null;
  constructor(q: number) { this.Q = q; }

  filter(z: number, R: number): number {
    if (this.x === null) { this.x = z; return z; }
    this.P += this.Q;
    const K = this.P / (this.P + R);
    this.x += K * (z - this.x);
    this.P *= (1 - K);
    return this.x;
  }

  reset() { this.P = 1; this.x = null; }
}

// Runner moves ~5 m/s → ~4.5e-5 deg/step. Q = variance = (4.5e-5)² ≈ 2e-9.
const GPS_PROCESS_NOISE = 2e-9;
const GPS_DEFAULT_ACCURACY_M = 12;

export class GpsKalmanFilter {
  private lat = new KalmanFilter1D(GPS_PROCESS_NOISE);
  private lng = new KalmanFilter1D(GPS_PROCESS_NOISE);

  filter(point: GpsPoint): GpsPoint {
    const accuracyM = point.accuracy ?? GPS_DEFAULT_ACCURACY_M;
    // R = variance in degrees². 1 degree lat ≈ 111 000 m.
    const R = Math.pow(accuracyM / 111000, 2);
    return {
      ...point,
      lat: this.lat.filter(point.lat, R),
      lng: this.lng.filter(point.lng, R),
    };
  }

  reset() { this.lat.reset(); this.lng.reset(); }
}

// ─── Douglas-Peucker simplification ──────────────────────────────────────────
// Removes points that are nearly collinear, keeping route shape intact.
// epsilonDeg: tolerance in degrees (1e-5 ≈ 1.1 m, 2.5e-5 ≈ 2.8 m).
function perpDistSq(p: GpsPoint, a: GpsPoint, b: GpsPoint): number {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    return Math.pow(p.lng - a.lng, 2) + Math.pow(p.lat - a.lat, 2);
  }
  const t = Math.max(0, Math.min(1,
    ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy),
  ));
  return Math.pow(p.lng - a.lng - t * dx, 2) + Math.pow(p.lat - a.lat - t * dy, 2);
}

export function douglasPeucker(points: GpsPoint[], epsilonDeg: number): GpsPoint[] {
  if (points.length <= 2) return points;
  const epsSq = epsilonDeg * epsilonDeg;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  function rdp(start: number, end: number) {
    let maxDSq = 0, maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistSq(points[i], points[start], points[end]);
      if (d > maxDSq) { maxDSq = d; maxIdx = i; }
    }
    if (maxDSq > epsSq) {
      keep[maxIdx] = true;
      rdp(start, maxIdx);
      rdp(maxIdx, end);
    }
  }

  rdp(0, points.length - 1);
  return points.filter((_, i) => keep[i]);
}

// ─── Catmull-Rom spline ───────────────────────────────────────────────────────
// Generates a smooth curve that passes through every GPS waypoint.
// segmentsPerSpan controls smoothness; 8 is a good balance for map rendering.
export function catmullRomPath(points: GpsPoint[], segmentsPerSpan = 8): [number, number][] {
  if (points.length < 2) return points.map(p => [p.lat, p.lng] as [number, number]);
  if (points.length === 2) return [[points[0].lat, points[0].lng], [points[1].lat, points[1].lng]];

  const out: [number, number][] = [];
  // Phantom endpoints clamp the spline to the actual start/end positions.
  const pts = [points[0], ...points, points[points.length - 1]];

  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1.lat) + (-p0.lat + p2.lat) * t + (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 + (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3),
        0.5 * ((2 * p1.lng) + (-p0.lng + p2.lng) * t + (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 + (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3),
      ]);
    }
  }
  out.push([points[points.length - 1].lat, points[points.length - 1].lng]);
  return out;
}

export const calculateDistance = (a: GpsPoint, b: GpsPoint): number => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
};

export const calculateTotalDistance = (points: GpsPoint[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(points[i - 1], points[i]);
  }
  return total;
};

export const calculatePace = (distanceKm: number, timeMs: number): number => {
  if (distanceKm <= 0) return 0;
  return timeMs / 60000 / distanceKm;
};

export const formatPace = (pace: number): string => {
  if (!Number.isFinite(pace) || pace <= 0) return '--:--';
  const totalSeconds = Math.round(pace * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
