import { useCallback, useEffect, useState } from 'react';
import { onlineAvailable, type BackendMode } from './backend';
import { normalizeCode } from './lib/ids';
import { GameRoute } from './ui/GameRoute';
import { StartScreen } from './ui/StartScreen';

export interface Route {
  code: string | null;
  mode: BackendMode;
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('g');
  const mode: BackendMode = params.get('m') === 'local' || !onlineAvailable ? 'local' : 'online';
  return { code: code ? normalizeCode(code) : null, mode };
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    const url = new URL(window.location.href);
    url.search = '';
    if (next.code) {
      url.searchParams.set('g', next.code);
      if (next.mode === 'local') url.searchParams.set('m', 'local');
    }
    window.history.pushState(null, '', url);
    setRoute(next);
  }, []);

  if (route.code) {
    return <GameRoute key={`${route.mode}:${route.code}`} code={route.code} mode={route.mode} onLeave={() => navigate({ code: null, mode: route.mode })} />;
  }
  return <StartScreen onOpen={(code, mode) => navigate({ code, mode })} />;
}
