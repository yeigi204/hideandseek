import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameEvent, PlayerLocation } from '../game/types';
import { GameNotFoundError, type Backend, type Connection, type ConnectionHandlers } from './types';

interface RawEvent {
  seq: number;
  player_id: string | null;
  type: string;
  payload: unknown;
  at: number;
}

interface RawLocation {
  player_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: number;
}

export class SupabaseBackend implements Backend {
  readonly mode = 'online' as const;
  private sb: SupabaseClient;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) {
      if (/game not found/i.test(error.message)) throw new GameNotFoundError();
      throw new Error(error.message || 'Serverfehler');
    }
    return data as T;
  }

  async createGame(playerId: string, payload: object): Promise<string> {
    const res = await this.rpc<{ code: string }>('hs_create_game', { p_player_id: playerId, p_payload: payload });
    return res.code;
  }

  async addEvent(code: string, playerId: string, type: string, payload: object): Promise<void> {
    await this.rpc('hs_add_event', { p_code: code, p_player_id: playerId, p_type: type, p_payload: payload });
  }

  async getEvents(code: string, after: number) {
    const res = await this.rpc<{ server_time: number; events: RawEvent[] }>('hs_get_events', { p_code: code, p_after: after });
    const events: GameEvent[] = res.events.map((e) => ({
      seq: Number(e.seq),
      at: Number(e.at),
      playerId: e.player_id,
      type: e.type,
      payload: e.payload,
    }));
    return { events, serverTime: Number(res.server_time) };
  }

  async setLocation(code: string, loc: PlayerLocation) {
    await this.rpc('hs_set_location', {
      p_code: code,
      p_player_id: loc.playerId,
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
    });
  }

  async clearLocation(code: string, playerId: string) {
    await this.rpc('hs_clear_location', { p_code: code, p_player_id: playerId });
  }

  async getLocations(code: string) {
    const res = await this.rpc<{ server_time: number; locations: RawLocation[] }>('hs_get_locations', { p_code: code });
    const locations: PlayerLocation[] = res.locations.map((l) => ({
      playerId: l.player_id,
      lat: l.lat,
      lng: l.lng,
      accuracy: l.accuracy,
      updatedAt: Number(l.updated_at),
    }));
    return { locations, serverTime: Number(res.server_time) };
  }

  connect(code: string, handlers: ConnectionHandlers): Connection {
    const channel = this.sb.channel(`hs-${code.toUpperCase()}`, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'sync' }, () => handlers.onSync());
    channel.on('broadcast', { event: 'loc' }, ({ payload }) => handlers.onLocation(payload as PlayerLocation));
    channel.subscribe((status) => handlers.onStatus?.(status === 'SUBSCRIBED'));
    return {
      notifySync: () => void channel.send({ type: 'broadcast', event: 'sync', payload: {} }),
      sendLocation: (loc) => void channel.send({ type: 'broadcast', event: 'loc', payload: loc }),
      close: () => void this.sb.removeChannel(channel),
    };
  }
}
