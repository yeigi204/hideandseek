import type { GameEvent, PlayerLocation } from '../game/types';

export type BackendMode = 'online' | 'local';

export class GameNotFoundError extends Error {
  constructor() {
    super('Spiel nicht gefunden');
  }
}

export interface Connection {
  notifySync(): void;
  sendLocation(loc: PlayerLocation): void;
  close(): void;
}

export interface ConnectionHandlers {
  onSync(): void;
  onLocation(loc: PlayerLocation): void;
  onStatus?(connected: boolean): void;
}

export interface Backend {
  readonly mode: BackendMode;
  createGame(playerId: string, payload: object): Promise<string>;
  addEvent(code: string, playerId: string, type: string, payload: object): Promise<void>;
  getEvents(code: string, after: number): Promise<{ events: GameEvent[]; serverTime: number }>;
  setLocation(code: string, loc: PlayerLocation): Promise<void>;
  clearLocation(code: string, playerId: string): Promise<void>;
  getLocations(code: string): Promise<{ locations: PlayerLocation[]; serverTime: number }>;
  connect(code: string, handlers: ConnectionHandlers): Connection;
}

export const EVENT_PAGE_SIZE = 1000;
