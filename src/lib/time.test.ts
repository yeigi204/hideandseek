import { describe, expect, it } from 'vitest';
import { activeDuration, addActive, clockState, gameWindows, zonedToEpoch } from './time';

const H = 3600000;
const M = 60000;

describe('zonedToEpoch', () => {
  it('rechnet Sommer- und Winterzeit korrekt', () => {
    expect(new Date(zonedToEpoch(2026, 7, 1, 7, 0)).toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(new Date(zonedToEpoch(2026, 12, 1, 7, 0)).toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });
  it('funktioniert am Tag der Zeitumstellung', () => {
    // 25.10.2026: um 03:00 wird auf 02:00 zurückgestellt
    expect(new Date(zonedToEpoch(2026, 10, 25, 7, 0)).toISOString()).toBe('2026-10-25T06:00:00.000Z');
    expect(new Date(zonedToEpoch(2026, 10, 24, 19, 0)).toISOString()).toBe('2026-10-24T17:00:00.000Z');
  });
});

describe('Spielfenster', () => {
  const s = { startDate: '2026-06-13', dayStart: '07:00', dayEnd: '19:00', days: 2 };
  const w = gameWindows(s);
  const day1Start = zonedToEpoch(2026, 6, 13, 7, 0);
  const day1End = zonedToEpoch(2026, 6, 13, 19, 0);
  const day2Start = zonedToEpoch(2026, 6, 14, 7, 0);

  it('hat zwei Fenster 07–19 Uhr', () => {
    expect(w).toEqual([
      { start: day1Start, end: day1End },
      { start: day2Start, end: zonedToEpoch(2026, 6, 14, 19, 0) },
    ]);
  });

  it('Ruhephase zählt nicht', () => {
    // 18:00 Tag 1 bis 08:00 Tag 2 = 1 h + 1 h
    expect(activeDuration(day1End - H, day2Start + H, w)).toBe(2 * H);
  });

  it('Pausen werden abgezogen, überlappende nur einmal', () => {
    const pauses = [
      { start: day1Start + H, end: day1Start + 2 * H },
      { start: day1Start + 90 * M, end: day1Start + 150 * M },
    ];
    expect(activeDuration(day1Start, day1Start + 4 * H, w, pauses)).toBe(4 * H - 90 * M);
  });

  it('Versteckphase über die Ruhephase hinweg', () => {
    // Start 18:00, 2 h Versteckzeit → 1 h am Abend, 1 h am Morgen → 08:00
    expect(addActive(day1End - H, 2 * H, w)).toBe(day2Start + H);
  });

  it('Runde in der Ruhephase gestartet beginnt am Morgen', () => {
    expect(addActive(day1End + H, 30 * M, w)).toBe(day2Start + 30 * M);
  });

  it('nach Spielende gibt es keine Zeit mehr', () => {
    expect(addActive(day2Start, 13 * H, w)).toBe(Infinity);
  });

  it('Phasen', () => {
    expect(clockState(day1Start - 1, w).phase).toBe('before');
    expect(clockState(day1Start, w).phase).toBe('active');
    expect(clockState(day1End, w)).toMatchObject({ phase: 'rest', nextChange: day2Start });
    expect(clockState(zonedToEpoch(2026, 6, 14, 19, 0), w).phase).toBe('over');
  });

  it('durchgehendes Spiel (00:00–24:00) wird zusammengefasst', () => {
    const all = gameWindows({ startDate: '2026-06-13', dayStart: '00:00', dayEnd: '24:00', days: 2 });
    expect(all).toHaveLength(1);
    expect(all[0].end - all[0].start).toBe(48 * H);
  });
});
