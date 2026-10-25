import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT_PAGE_SIZE, GameNotFoundError, type Backend, type Connection } from '../backend';
import { reduce } from '../game/reducer';
import type { GameEvent, PlayerLocation } from '../game/types';
import { setClockOffset } from '../lib/time';

export type LoadStatus = 'loading' | 'ready' | 'notfound' | 'error';

const EVENT_POLL_MS = 6000;
const LOCATION_POLL_MS = 10000;

export function useGame(backend: Backend, code: string, playerId: string | null) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [live, setLive] = useState(false);
  const [locations, setLocations] = useState<Record<string, PlayerLocation>>({});

  const eventsRef = useRef<GameEvent[]>([]);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const conn = useRef<Connection | null>(null);

  const fetchEvents = useCallback((): Promise<void> => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const run = async () => {
      do {
        again.current = false;
        let after = eventsRef.current[eventsRef.current.length - 1]?.seq ?? 0;
        for (;;) {
          const t0 = Date.now();
          const res = await backend.getEvents(code, after);
          const t1 = Date.now();
          if (t1 - t0 < 3000) setClockOffset(res.serverTime - (t0 + t1) / 2);
          const fresh = res.events.filter((e) => e.seq > after);
          if (fresh.length) {
            eventsRef.current = [...eventsRef.current, ...fresh];
            setEvents(eventsRef.current);
            after = fresh[fresh.length - 1].seq;
          }
          if (res.events.length < EVENT_PAGE_SIZE) break;
        }
      } while (again.current);
    };
    const p = run()
      .then(() => {
        setStatus('ready');
        setOnline(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof GameNotFoundError) setStatus('notfound');
        else {
          setOnline(false);
          setError(err instanceof Error ? err.message : String(err));
          setStatus((s) => (s === 'loading' ? 'error' : s));
        }
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  }, [backend, code]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await backend.getLocations(code);
      const map: Record<string, PlayerLocation> = {};
      for (const l of res.locations) map[l.playerId] = l;
      setLocations((prev) => {
        // Neuere Live-Updates (Broadcast) nicht mit älteren Werten überschreiben
        for (const [id, l] of Object.entries(prev)) if (map[id] && l.updatedAt > map[id].updatedAt) map[id] = l;
        return map;
      });
    } catch {
      // nächster Versuch beim nächsten Intervall
    }
  }, [backend, code]);

  useEffect(() => {
    eventsRef.current = [];
    setEvents([]);
    setStatus('loading');
    void fetchEvents();
    void fetchLocations();
    const c = backend.connect(code, {
      onSync: () => void fetchEvents(),
      onLocation: (loc) => setLocations((prev) => ({ ...prev, [loc.playerId]: loc })),
      onStatus: setLive,
    });
    conn.current = c;
    const evTimer = window.setInterval(() => void fetchEvents(), EVENT_POLL_MS);
    const locTimer = window.setInterval(() => void fetchLocations(), LOCATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchEvents();
        void fetchLocations();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      c.close();
      conn.current = null;
      window.clearInterval(evTimer);
      window.clearInterval(locTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [backend, code, fetchEvents, fetchLocations]);

  const dispatch = useCallback(
    async (type: string, payload: object, asPlayer?: string) => {
      await backend.addEvent(code, asPlayer ?? playerId ?? '', type, payload);
      await fetchEvents();
      conn.current?.notifySync();
    },
    [backend, code, playerId, fetchEvents],
  );

  const shareLocation = useCallback(
    async (loc: PlayerLocation) => {
      await backend.setLocation(code, loc);
      setLocations((prev) => ({ ...prev, [loc.playerId]: loc }));
      conn.current?.sendLocation(loc);
    },
    [backend, code],
  );

  const clearLocation = useCallback(
    async (id: string) => {
      await backend.clearLocation(code, id);
      setLocations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [backend, code],
  );

  const state = useMemo(() => reduce(events), [events]);

  return { state, events, status, error, online, live, locations, dispatch, shareLocation, clearLocation, refresh: fetchEvents };
}

export type GameApi = ReturnType<typeof useGame>;
