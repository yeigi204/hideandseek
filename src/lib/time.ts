// Zeitrechnung für das Spiel: Spielfenster (z.B. 07:00–19:00), Ruhephasen und Pausen.
// Alle Uhrzeiten beziehen sich auf Schweizer Zeit, unabhängig von der Zeitzone des Geräts.

export const TZ = 'Europe/Zurich';

export interface Interval {
  start: number;
  end: number;
}

export interface ScheduleSettings {
  startDate: string; // YYYY-MM-DD
  dayStart: string; // HH:MM
  dayEnd: string; // HH:MM (24:00 erlaubt)
  days: number;
}

// Abweichung der Server-Uhr von der Geräte-Uhr, wird beim Laden der Events gesetzt.
let clockOffset = 0;
export function setClockOffset(ms: number) {
  clockOffset = ms;
}
export function now(): number {
  return Date.now() + clockOffset;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sonntag
}

export function wallClock(t: number, tz = TZ): WallClock {
  const parts = partsFormatter(tz).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset der Zeitzone zum Zeitpunkt t in ms (lokal - UTC). */
export function tzOffset(t: number, tz = TZ): number {
  const w = wallClock(t, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Wandelt eine Schweizer Ortszeit in einen Zeitstempel um. */
export function zonedToEpoch(year: number, month: number, day: number, hour: number, minute: number, tz = TZ): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffset(guess - tzOffset(guess, tz), tz);
  return guess - off1;
}

export function parseHM(hm: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return [0, 0];
  return [Math.min(24, Number(m[1])), Math.min(59, Number(m[2]))];
}

function addDays(dateStr: string, n: number): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Die Zeitfenster, in denen gespielt wird. Alles dazwischen ist Ruhephase. */
export function gameWindows(s: ScheduleSettings): Interval[] {
  const [sh, sm] = parseHM(s.dayStart);
  const [eh, em] = parseHM(s.dayEnd);
  const out: Interval[] = [];
  for (let i = 0; i < Math.max(1, s.days); i++) {
    const [y, m, d] = addDays(s.startDate, i);
    const start = zonedToEpoch(y, m, d, sh, sm);
    let end = zonedToEpoch(y, m, d, eh, em);
    if (end <= start) {
      // Spielende nach Mitternacht
      const [y2, m2, d2] = addDays(s.startDate, i + 1);
      end = zonedToEpoch(y2, m2, d2, eh, em);
    }
    out.push({ start, end });
  }
  return mergeIntervals(out);
}

function overlap(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Spielzeit zwischen a und b: nur innerhalb der Spielfenster, abzüglich Pausen. */
export function activeDuration(a: number, b: number, windows: Interval[], pauses: Interval[] = []): number {
  if (!(b > a)) return 0;
  const merged = mergeIntervals(pauses);
  let total = 0;
  for (const w of windows) {
    const seg = { start: Math.max(a, w.start), end: Math.min(b, w.end) };
    if (seg.end <= seg.start) continue;
    let len = seg.end - seg.start;
    for (const p of merged) len -= overlap(seg, p);
    total += Math.max(0, len);
  }
  return total;
}

/** Zeitpunkt, nachdem ab `start` genau `duration` Spielzeit vergangen ist (Ruhephasen zählen nicht). */
export function addActive(start: number, duration: number, windows: Interval[]): number {
  let remaining = Math.max(0, duration);
  for (const w of windows) {
    if (w.end <= start) continue;
    const s = Math.max(start, w.start);
    const avail = w.end - s;
    if (avail >= remaining) return s + remaining;
    remaining -= avail;
  }
  return Infinity;
}

export type ClockPhase = 'before' | 'active' | 'rest' | 'over';

export interface ClockState {
  phase: ClockPhase;
  /** Nächster Wechsel (Start, Beginn/Ende Ruhephase, Spielende). */
  nextChange: number | null;
  gameStart: number;
  gameEnd: number;
}

export function clockState(t: number, windows: Interval[]): ClockState {
  const gameStart = windows[0]?.start ?? 0;
  const gameEnd = windows[windows.length - 1]?.end ?? 0;
  if (t < gameStart) return { phase: 'before', nextChange: gameStart, gameStart, gameEnd };
  if (t >= gameEnd) return { phase: 'over', nextChange: null, gameStart, gameEnd };
  for (const w of windows) {
    if (t >= w.start && t < w.end) return { phase: 'active', nextChange: w.end, gameStart, gameEnd };
    if (t < w.start) return { phase: 'rest', nextChange: w.start, gameStart, gameEnd };
  }
  return { phase: 'over', nextChange: null, gameStart, gameEnd };
}

export function isActiveAt(t: number, windows: Interval[]): boolean {
  return windows.some((w) => t >= w.start && t < w.end);
}

// ---------- Formatierung ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** 1:02:03 bzw. 2:03 */
export function fmtDuration(ms: number): string {
  if (!isFinite(ms)) return '–';
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const str = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return neg ? `-${str}` : str;
}

/** "2 h 05 min" für längere Zeiten */
export function fmtDurationWords(ms: number): string {
  if (!isFinite(ms)) return '–';
  const totalMin = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${pad(m)} min`;
}

export function fmtClock(t: number): string {
  if (!isFinite(t)) return '–';
  const w = wallClock(t);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function fmtDayClock(t: number, reference = now()): string {
  if (!isFinite(t)) return '–';
  const w = wallClock(t);
  const r = wallClock(reference);
  const sameDay = w.year === r.year && w.month === r.month && w.day === r.day;
  return sameDay ? fmtClock(t) : `${WEEKDAYS[w.weekday]} ${w.day}.${w.month}. ${fmtClock(t)}`;
}

export function fmtAgo(t: number, reference = now()): string {
  const s = Math.max(0, Math.round((reference - t) / 1000));
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  return `vor ${fmtDurationWords(reference - t)}`;
}

/** Heutiges Datum (Schweizer Zeit) als YYYY-MM-DD, optional n Tage später. */
export function localDateString(t: number, plusDays = 0): string {
  const w = wallClock(t);
  const dt = new Date(Date.UTC(w.year, w.month - 1, w.day + plusDays));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
