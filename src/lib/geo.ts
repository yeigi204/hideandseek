export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Luftlinie in Metern */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punkt in `meters` Entfernung in Richtung `bearingDeg` */
export function destination(p: LatLng, meters: number, bearingDeg: number): LatLng {
  const d = meters / R;
  const b = rad(bearingDeg);
  const lat1 = rad(p.lat);
  const lng1 = rad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: deg(lng2) };
}

export function circleRing(center: LatLng, meters: number, steps = 72): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const p = destination(center, meters, (360 / steps) * i);
    out.push([p.lat, p.lng]);
  }
  return out;
}

export function fmtDistance(m: number): string {
  if (!isFinite(m)) return '–';
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(2)} km`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Grob die Schweiz plus Rand – für Ausschluss-Flächen auf der Karte. */
export const CH_BOUNDS = { south: 45.6, north: 48.0, west: 5.7, east: 10.7 };

// ---------- Flughäfen & Kantone ----------

export const AIRPORTS = [
  { code: 'ZRH', name: 'Zürich', pos: { lat: 47.4581, lng: 8.5555 } },
  { code: 'GVA', name: 'Genf', pos: { lat: 46.2381, lng: 6.109 } },
  { code: 'BSL', name: 'Basel', pos: { lat: 47.59, lng: 7.5291 } },
];

export function nearestAirport(p: LatLng) {
  return AIRPORTS.map((a) => ({ ...a, dist: distance(p, a.pos) })).sort((a, b) => a.dist - b.dist)[0];
}

export const CANTONS: Record<string, { name: string; region: string }> = {
  ZH: { name: 'Zürich', region: 'Zürich' },
  BE: { name: 'Bern', region: 'Espace Mittelland' },
  LU: { name: 'Luzern', region: 'Zentralschweiz' },
  UR: { name: 'Uri', region: 'Zentralschweiz' },
  SZ: { name: 'Schwyz', region: 'Zentralschweiz' },
  OW: { name: 'Obwalden', region: 'Zentralschweiz' },
  NW: { name: 'Nidwalden', region: 'Zentralschweiz' },
  GL: { name: 'Glarus', region: 'Ostschweiz' },
  ZG: { name: 'Zug', region: 'Zentralschweiz' },
  FR: { name: 'Freiburg', region: 'Espace Mittelland' },
  SO: { name: 'Solothurn', region: 'Espace Mittelland' },
  BS: { name: 'Basel-Stadt', region: 'Nordwestschweiz' },
  BL: { name: 'Basel-Landschaft', region: 'Nordwestschweiz' },
  SH: { name: 'Schaffhausen', region: 'Ostschweiz' },
  AR: { name: 'Appenzell Ausserrhoden', region: 'Ostschweiz' },
  AI: { name: 'Appenzell Innerrhoden', region: 'Ostschweiz' },
  SG: { name: 'St. Gallen', region: 'Ostschweiz' },
  GR: { name: 'Graubünden', region: 'Ostschweiz' },
  AG: { name: 'Aargau', region: 'Nordwestschweiz' },
  TG: { name: 'Thurgau', region: 'Ostschweiz' },
  TI: { name: 'Tessin', region: 'Tessin' },
  VD: { name: 'Waadt', region: 'Genferseeregion' },
  VS: { name: 'Wallis', region: 'Genferseeregion' },
  NE: { name: 'Neuenburg', region: 'Espace Mittelland' },
  GE: { name: 'Genf', region: 'Genferseeregion' },
  JU: { name: 'Jura', region: 'Espace Mittelland' },
};

export interface PlaceInfo {
  canton: string | null; // Kürzel, z.B. LU
  municipality: string | null;
  display: string;
}

const placeCache = new Map<string, PlaceInfo>();

/** Gemeinde und Kanton über OpenStreetMap (Nominatim). */
export async function reverseGeocode(p: LatLng): Promise<PlaceInfo> {
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  const cached = placeCache.get(key);
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=${p.lat}&lon=${p.lng}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Ortssuche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  const addr = data.address ?? {};
  const iso: string | undefined = addr['ISO3166-2-lvl4'];
  const canton = iso && iso.startsWith('CH-') ? iso.slice(3) : null;
  const municipality = addr.municipality ?? addr.city ?? addr.town ?? addr.village ?? null;
  const info: PlaceInfo = { canton, municipality, display: data.display_name ?? '' };
  placeCache.set(key, info);
  return info;
}

export interface Station {
  id: number;
  name: string;
  pos: LatLng;
}

/** Bahnhöfe/Haltestellen der Bahn im Ausschnitt über OpenStreetMap (Overpass). */
export async function fetchStations(bounds: { south: number; west: number; north: number; east: number }): Promise<Station[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:20];node["railway"~"^(station|halt)$"]["station"!~"subway|light_rail|funicular|miniature|monorail"](${bbox});out body;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Bahnhof-Suche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return (data.elements ?? []).map((e: { id: number; lat: number; lon: number; tags?: Record<string, string> }) => ({
    id: e.id,
    name: e.tags?.name ?? 'Bahnhof',
    pos: { lat: e.lat, lng: e.lon },
  }));
}

export function boundsAround(p: LatLng, meters: number) {
  const n = destination(p, meters, 0);
  const s = destination(p, meters, 180);
  const e = destination(p, meters, 90);
  const w = destination(p, meters, 270);
  return { south: s.lat, north: n.lat, east: e.lng, west: w.lng };
}

export function compass(bearing: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}
