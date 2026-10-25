import type { BackendMode } from '../backend/types';

export interface SavedGame {
  code: string;
  mode: BackendMode;
  name: string;
  playerId: string | null;
  openedAt: number;
}

const GAMES_KEY = 'hs:games';

function read(): SavedGame[] {
  try {
    const list = JSON.parse(localStorage.getItem(GAMES_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: SavedGame[]) {
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(list));
  } catch {
    // Speicher nicht verfügbar (z.B. privater Modus)
  }
}

export function savedGames(): SavedGame[] {
  return read().sort((a, b) => b.openedAt - a.openedAt);
}

export function savedGame(mode: BackendMode, code: string): SavedGame | undefined {
  return read().find((g) => g.mode === mode && g.code === code);
}

export function saveGame(entry: Partial<SavedGame> & { code: string; mode: BackendMode }) {
  const list = read();
  const i = list.findIndex((g) => g.mode === entry.mode && g.code === entry.code);
  const prev = i >= 0 ? list[i] : { name: '', playerId: null, openedAt: 0 };
  const next: SavedGame = { ...prev, ...entry, openedAt: Date.now() } as SavedGame;
  if (i >= 0) list[i] = next;
  else list.push(next);
  write(list);
}

// Im Testmodus gilt die Identität pro Tab, damit mehrere Tabs mehrere Spieler sein können.
const tabKey = (code: string) => `hs:tab-player:${code}`;

export function getPlayerId(mode: BackendMode, code: string): string | null {
  if (mode === 'local') {
    try {
      return sessionStorage.getItem(tabKey(code));
    } catch {
      return null;
    }
  }
  return savedGame(mode, code)?.playerId ?? null;
}

export function setPlayerId(mode: BackendMode, code: string, playerId: string, name: string) {
  if (mode === 'local') {
    try {
      sessionStorage.setItem(tabKey(code), playerId);
    } catch {
      // ignorieren
    }
  }
  saveGame({ code, mode, name, playerId });
}

export function forgetGame(mode: BackendMode, code: string) {
  try {
    sessionStorage.removeItem(tabKey(code));
  } catch {
    // ignorieren
  }
  write(read().filter((g) => !(g.mode === mode && g.code === code)));
}

export function getPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`hs:pref:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function setPref<T>(key: string, value: T) {
  try {
    localStorage.setItem(`hs:pref:${key}`, JSON.stringify(value));
  } catch {
    // ignorieren
  }
  window.dispatchEvent(new Event('hs-pref'));
}
