import { useEffect, useState } from 'react';
import { boundsAround, distance, fetchStations, type LatLng } from '../lib/geo';

export type NearestStation = { status: 'loading' } | { status: 'error'; error: string } | { status: 'none' } | { status: 'ok'; name: string; dist: number };

const roundedKey = (p: LatLng) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

/** Nächster Bahnhof im Umkreis von 2.5 km (OpenStreetMap). Fragt erst ab ~100 m Bewegung neu an. */
export function useNearestStation(pos: LatLng | null, enabled = true): NearestStation | null {
  const [res, setRes] = useState<NearestStation | null>(null);
  const key = pos ? roundedKey(pos) : null;
  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const [lat, lng] = key.split(',').map(Number);
    const here = { lat, lng };
    setRes({ status: 'loading' });
    fetchStations(boundsAround(here, 2500))
      .then((list) => {
        if (cancelled) return;
        const best = list.map((s) => ({ name: s.name, dist: distance(here, s.pos) })).sort((a, b) => a.dist - b.dist)[0];
        setRes(best ? { status: 'ok', ...best } : { status: 'none' });
      })
      .catch((e) => !cancelled && setRes({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return res;
}
