// Testmodus: alles bleibt im Browser (localStorage). Mehrere Tabs im selben Browser
// sehen sich gegenseitig – praktisch zum Ausprobieren ohne zweites Handy.
import { randomCode } from '../lib/ids';
import type { GameEvent, PlayerLocation } from '../game/types';
import { GameNotFoundError, type Backend, type Connection, type ConnectionHandlers } from './types';

const eventsKey = (code: string) => `hs:local:${code.toUpperCase()}:events`;
const locsKey = (code: string) => `hs:local:${code.toUpperCase()}:locations`;

function readEvents(code: string): GameEvent[] {
  const raw = localStorage.getItem(eventsKey(code));
  if (raw == null) throw new GameNotFoundError();
  return JSON.parse(raw) as GameEvent[];
}

function readLocs(code: string): Record<string, PlayerLocation> {
  try {
    return JSON.parse(localStorage.getItem(locsKey(code)) ?? '{}');
  } catch {
    return {};
  }
}

function post(code: string, msg: unknown) {
  if (typeof BroadcastChannel === 'undefined') return;
  const bc = new BroadcastChannel(`hs-local-${code.toUpperCase()}`);
  bc.postMessage(msg);
  bc.close();
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;

  async createGame(playerId: string, payload: object): Promise<string> {
    let code = randomCode();
    while (localStorage.getItem(eventsKey(code)) != null) code = randomCode();
    localStorage.setItem(eventsKey(code), '[]');
    await this.addEvent(code, playerId, 'game_created', payload);
    return code;
  }

  async addEvent(code: string, playerId: string, type: string, payload: object): Promise<void> {
    const events = readEvents(code);
    const ev: GameEvent = { seq: events.length + 1, at: Date.now(), playerId, type, payload: JSON.parse(JSON.stringify(payload)) };
    events.push(ev);
    localStorage.setItem(eventsKey(code), JSON.stringify(events));
    post(code, { kind: 'sync' });
  }

  async getEvents(code: string, after: number) {
    return { events: readEvents(code).filter((e) => e.seq > after), serverTime: Date.now() };
  }

  async setLocation(code: string, loc: PlayerLocation) {
    const locs = readLocs(code);
    locs[loc.playerId] = { ...loc, updatedAt: Date.now() };
    localStorage.setItem(locsKey(code), JSON.stringify(locs));
  }

  async clearLocation(code: string, playerId: string) {
    const locs = readLocs(code);
    delete locs[playerId];
    localStorage.setItem(locsKey(code), JSON.stringify(locs));
  }

  async getLocations(code: string) {
    readEvents(code);
    return { locations: Object.values(readLocs(code)), serverTime: Date.now() };
  }

  connect(code: string, handlers: ConnectionHandlers): Connection {
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`hs-local-${code.toUpperCase()}`) : null;
    if (bc) {
      bc.onmessage = (e) => {
        if (e.data?.kind === 'sync') handlers.onSync();
        if (e.data?.kind === 'loc') handlers.onLocation(e.data.loc);
      };
    }
    handlers.onStatus?.(true);
    return {
      notifySync: () => {},
      sendLocation: (loc) => post(code, { kind: 'loc', loc }),
      close: () => bc?.close(),
    };
  }
}
