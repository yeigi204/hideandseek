import type { LatLng } from '../lib/geo';
import type { Interval } from '../lib/time';
import type { CategoryKey } from './catalog';

export interface Settings {
  startDate: string; // YYYY-MM-DD (Schweizer Zeit)
  dayStart: string; // HH:MM
  dayEnd: string; // HH:MM
  days: number;
  hidingMinutes: number;
  /** Zählt die Versteckphase zur Hiding-Zeit? */
  countHidingPhase: boolean;
  cooldownMinutes: number;
  cooldownScope: 'team' | 'all';
  diceCost: number;
  diceSides: number;
  /** Anzahl Personen für die Kasse; null = alle Spieler */
  splitCount: number | null;
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface Player {
  id: string;
  name: string;
  teamId: string | null;
  joinedAt: number;
}

export interface Pause {
  id: string;
  start: number;
  /** Feste Dauer in Spielzeit (z.B. Curse 20); sonst offen bis pause_ended */
  minutes?: number;
  endedAt?: number;
  reason: string;
  /** berechnet */
  end: number;
}

export interface Round {
  id: string;
  number: number;
  hiderTeamId: string;
  startedAt: number;
  startedBy: string | null;
  releasedAt?: number;
  /** berechnet: Start der Suchphase */
  seekStartAt: number;
  endedAt?: number;
  endReason?: 'found' | 'aborted';
  pauses: Pause[];
}

export interface Question {
  id: string;
  roundId: string;
  category: CategoryKey | string;
  key: string;
  text: string;
  param?: number;
  coins: number;
  answerMinutes: number;
  teamId: string | null;
  askedBy: string | null;
  askedAt: number;
  pos?: LatLng & { acc?: number };
  answer?: string;
  impossible?: boolean;
  answeredAt?: number;
  answeredBy?: string | null;
  cancelled?: boolean;
  /** berechnet */
  deadline: number;
}

export type CurseStatus = 'active' | 'done' | 'skipped';

export interface Curse {
  id: string;
  roundId: string;
  number: number;
  dice: number;
  rolls: number[] | null;
  cost: number;
  targetTeamId: string | null;
  castAt: number;
  castBy: string | null;
  status: CurseStatus;
  resolvedAt?: number;
  escalatedFrom?: string;
}

export interface MapMarker {
  id: string;
  kind: 'circle' | 'pin';
  lat: number;
  lng: number;
  radius?: number;
  inside?: boolean | null;
  label: string;
  teamId: string | null;
  by: string | null;
  at: number;
}

export interface Expense {
  id: string;
  paidBy: string;
  amount: number;
  note: string;
  at: number;
}

export interface CoinAdjustment {
  roundId: string;
  delta: number;
  reason: string;
  at: number;
}

export interface LogEntry {
  at: number;
  icon: string;
  text: string;
  seq: number;
}

export interface GameState {
  name: string;
  createdAt: number;
  createdBy: string | null;
  settings: Settings;
  windows: Interval[];
  teams: Team[];
  players: Record<string, Player>;
  rounds: Round[];
  questions: Question[];
  curses: Curse[];
  markers: MapMarker[];
  expenses: Expense[];
  coinAdjustments: CoinAdjustment[];
  endedAt?: number;
  log: LogEntry[];
  lastSeq: number;
}

export interface GameEvent {
  seq: number;
  at: number;
  playerId: string | null;
  type: string;
  payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface PlayerLocation {
  playerId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: number;
}
