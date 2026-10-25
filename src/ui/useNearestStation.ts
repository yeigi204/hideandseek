import { useCallback, useEffect, useState } from 'react';
import { nearestStation, StationLookupError, type LatLng } from '../lib/geo';

export type NearestStation =
  | { status: 'loading' }
  | { status: 'error'; error: string; details?: string }
  | { status: 'none' }
  | { status: 'ok'; name: string; dist: number; source: 'osm' | 'timetable' };

const roundedKey = (p: LatLng) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

/** Nächster Bahnhof im Umkreis von 2.5 km. Fragt erst ab ~100 m Bewegung neu an; `retry` für einen neuen Versuch. */
export function useNearestStation(pos: LatLng | null, enabled = true): { result: NearestStation | null; retry: () => void } {
  const [result, setResult] = useState<NearestStation | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = pos ? roundedKey(pos) : null;
  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const [lat, lng] = key.split(',').map(Number);
    setResult({ status: 'loading' });
    nearestStation({ lat, lng })
      .then((best) => !cancelled && setResult(best ? { status: 'ok', ...best } : { status: 'none' }))
      .catch((err) => {
        if (cancelled) return;
        setResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          details: err instanceof StationLookupError ? err.failures.join(' · ') : undefined,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { result, retry };
}
