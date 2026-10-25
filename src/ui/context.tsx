import { createContext, useContext } from 'react';
import type { BackendMode } from '../backend';
import type { Role } from '../game/reducer';
import type { GameState, Round, Team } from '../game/types';
import type { GameApi } from '../hooks/useGame';
import type { GeoPosition } from '../hooks/useGeolocation';

export type TabKey = 'status' | 'fragen' | 'karte' | 'curses' | 'mehr';

export interface GameCtx {
  api: GameApi;
  state: GameState;
  me: string;
  mode: BackendMode;
  code: string;
  geo: { pos: GeoPosition | null; error: string | null };
  round: Round | undefined;
  role: Role;
  myTeam: Team | undefined;
  setTab: (tab: TabKey) => void;
  /** Öffnet die Anleitung (Mehr → Regeln) */
  openGuide: () => void;
  /** Führt eine Aktion aus und zeigt Fehler als Meldung an. */
  run: (fn: () => Promise<unknown>, okMessage?: string) => Promise<boolean>;
  toast: (text: string, kind?: ToastKind) => void;
  leave: () => void;
}

export type ToastKind = 'info' | 'ok' | 'error';

export const Ctx = createContext<GameCtx | null>(null);

export function useGameCtx(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('GameCtx fehlt');
  return c;
}
