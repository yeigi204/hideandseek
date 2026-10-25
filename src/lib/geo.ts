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

/** Öffentliche Overpass-Server (OpenStreetMap). Der Hauptserver ist oft überlastet (502/504/429). */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let preferredEndpoint = 0;

export class StationLookupError extends Error {
  constructor(readonly failures: string[]) {
    super('Die Kartenserver für die Bahnhof-Suche sind gerade überlastet.');
  }
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw ctrl.signal.aborted ? new Error('Zeitüberschreitung') : err;
  } finally {
    clearTimeout(timer);
  }
}

interface OverpassNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

/** Fragt die Overpass-Server der Reihe nach an; der zuletzt funktionierende kommt zuerst. */
async function overpass(query: string): Promise<OverpassNode[]> {
  const failures: string[] = [];
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const idx = (preferredEndpoint + i) % OVERPASS_ENDPOINTS.length;
    const url = OVERPASS_ENDPOINTS[idx];
    try {
      const data = await fetchJson(url, { method: 'POST', body: new URLSearchParams({ data: query }) });
      if (!Array.isArray(data?.elements)) throw new Error('ungültige Antwort');
      // Bei Überlast kommt teils HTTP 200 mit leerer Liste und einer Fehlermeldung
      if (!data.elements.length && typeof data.remark === 'string' && /error|timeout|timed out/i.test(data.remark)) throw new Error(data.remark);
      preferredEndpoint = idx;
      return data.elements;
    } catch (err) {
      failures.push(`${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new StationLookupError(failures);
}

const stationCache = new Map<string, { at: number; stations: Station[] }>();
const STATION_CACHE_MS = 60 * 60000;

/** Bahnhöfe/Haltestellen der Bahn im Ausschnitt über OpenStreetMap (Overpass). */
export async function fetchStations(bounds: { south: number; west: number; north: number; east: number }): Promise<Station[]> {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map((x) => x.toFixed(4)).join(',');
  const cached = stationCache.get(bbox);
  if (cached && Date.now() - cached.at < STATION_CACHE_MS) return cached.stations;
  const query = `[out:json][timeout:20];node["railway"~"^(station|halt)$"]["station"!~"subway|light_rail|funicular|miniature|monorail"](${bbox});out body;`;
  const stations = (await overpass(query)).map((e) => ({
    id: e.id,
    name: e.tags?.name ?? 'Bahnhof',
    pos: { lat: e.lat, lng: e.lon },
  }));
  stationCache.set(bbox, { at: Date.now(), stations });
  return stations;
}

export interface NearestStationResult {
  name: string;
  dist: number;
  source: 'osm' | 'timetable';
}

/** Ersatzquelle: Fahrplan-API (transport.opendata.ch), nur Haltestellen mit Zug. */
async function nearestTrainFromTimetable(p: LatLng): Promise<NearestStationResult | null> {
  const data = await fetchJson(`https://transport.opendata.ch/v1/locations?x=${p.lat}&y=${p.lng}&type=station`, {}, 10000);
  const list: { name?: string; icon?: string; coordinate?: { x?: number; y?: number } }[] = data?.stations ?? [];
  const trains = list
    .filter((st) => st.icon === 'train' && typeof st.coordinate?.x === 'number' && typeof st.coordinate?.y === 'number')
    .map((st) => {
      // Die API liefert x = Breite, y = Länge; sicherheitshalber prüfen
      let { x, y } = st.coordinate as { x: number; y: number };
      if (x < 20 && y > 40) [x, y] = [y, x];
      return { name: st.name ?? 'Bahnhof', dist: distance(p, { lat: x, lng: y }), source: 'timetable' as const };
    })
    .sort((a, b) => a.dist - b.dist);
  return trains[0] ?? null;
}

/** Nächster Bahnhof im Umkreis von 2.5 km; null = keiner gefunden. */
export async function nearestStation(p: LatLng): Promise<NearestStationResult | null> {
  try {
    const list = await fetchStations(boundsAround(p, 2500));
    const best = list.map((st) => ({ name: st.name, dist: distance(p, st.pos), source: 'osm' as const })).sort((a, b) => a.dist - b.dist)[0];
    return best ?? null;
  } catch (err) {
    if (!(err instanceof StationLookupError)) throw err;
    try {
      const fallback = await nearestTrainFromTimetable(p);
      if (fallback) return fallback;
    } catch (fallbackErr) {
      err.failures.push(`transport.opendata.ch: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
    }
    throw err;
  }
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
