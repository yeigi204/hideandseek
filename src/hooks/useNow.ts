import { useEffect, useState } from 'react';
import { now } from '../lib/time';

export function useNow(intervalMs = 1000): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}
