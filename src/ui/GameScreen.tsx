import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BackendMode } from '../backend';
import { curseDef } from '../game/catalog';
import { activeCurses, openQuestions, openRound, questionLabel, roleOf, teamName } from '../game/reducer';
import type { GameApi } from '../hooks/useGame';
import { useGeolocation } from '../hooks/useGeolocation';
import { distance } from '../lib/geo';
import { getPref } from '../lib/storage';
import { CursesTab } from './CursesTab';
import { Ctx, type GameCtx, type TabKey, type ToastKind } from './context';
import { MapTab } from './MapTab';
import { MoreTab } from './MoreTab';
import { alertUser } from './notify';
import { QuestionsTab } from './QuestionsTab';
import { StatusTab } from './StatusTab';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'status', label: 'Status', icon: '⏱️' },
  { key: 'fragen', label: 'Fragen', icon: '❓' },
  { key: 'karte', label: 'Karte', icon: '🗺️' },
  { key: 'curses', label: 'Curses', icon: '🎲' },
  { key: 'mehr', label: 'Mehr', icon: '☰' },
];

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

const SHARE_INTERVAL_MS = 15000;
const SHARE_MIN_MOVE_M = 25;

export function GameScreen({ api, me, code, mode, onLeave }: { api: GameApi; me: string; code: string; mode: BackendMode; onLeave: () => void }) {
  const { state } = api;
  const [tab, setTab] = useState<TabKey>('status');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const geo = useGeolocation(true);
  const round = openRound(state);
  const role = roleOf(state, me, round);
  const myTeam = state.teams.find((t) => t.id === state.players[me]?.teamId);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, okMessage?: string) => {
      try {
        await fn();
        if (okMessage) toast(okMessage, 'ok');
        return true;
      } catch (err) {
        toast(`Fehler: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return false;
      }
    },
    [toast],
  );

  useNewEventAlerts(api, me, toast);
  useLocationSharing(api, me, role === 'hider', geo.pos);
  useWakeLock();

  const ctx: GameCtx = useMemo(
    () => ({ api, state, me, mode, code, geo, round, role, myTeam, setTab, run, toast, leave: onLeave }),
    [api, state, me, mode, code, geo, round, role, myTeam, run, toast, onLeave],
  );

  const badges: Partial<Record<TabKey, number>> = {
    fragen: role === 'hider' ? openQuestions(state, round?.id).length : 0,
    curses: role === 'seeker' ? activeCurses(state, round?.id, myTeam?.id).length : 0,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-title">
            <strong>{state.name}</strong>
            <span className="muted small">
              {code}
              {mode === 'local' ? ' · Testmodus' : ''}
            </span>
          </div>
          <div className="topbar-right">
            {role !== 'none' && <span className={`role role-${role}`}>{role === 'hider' ? '🫣 Hider' : '🔎 Seeker'}</span>}
            <span className={`dot ${api.online ? (api.live ? 'ok' : 'warn') : 'bad'}`} title={api.online ? (api.live ? 'Live verbunden' : 'Verbunden (Abgleich alle paar Sekunden)') : 'Offline'} />
          </div>
        </header>
        {!api.online && <div className="banner bad">Keine Verbindung – Änderungen werden nicht gespeichert.</div>}

        <main className="content">
          {tab === 'status' && <StatusTab />}
          {tab === 'fragen' && <QuestionsTab />}
          <MapTab visible={tab === 'karte'} />
          {tab === 'curses' && <CursesTab />}
          {tab === 'mehr' && <MoreTab />}
        </main>

        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
              {!!badges[t.key] && <span className="badge">{badges[t.key]}</span>}
            </button>
          ))}
        </nav>

        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** Meldet neue Fragen, Antworten, Curses und Rundenwechsel, die andere ausgelöst haben. */
function useNewEventAlerts(api: GameApi, me: string, toast: (t: string, k?: ToastKind) => void) {
  const seen = useRef<number | null>(null);
  const { events, state } = api;
  useEffect(() => {
    const last = events[events.length - 1]?.seq ?? 0;
    if (seen.current == null) {
      seen.current = last;
      return;
    }
    const fresh = events.filter((e) => e.seq > seen.current!);
    seen.current = last;
    const round = openRound(state);
    const role = roleOf(state, me, round);
    const myTeamId = state.players[me]?.teamId ?? null;
    for (const ev of fresh) {
      if (ev.playerId === me) continue;
      const p = ev.payload ?? {};
      if (ev.type === 'question_asked' && role === 'hider') {
        const q = state.questions.find((x) => x.id === p.id);
        if (q) {
          toast(`❓ Neue Frage: ${questionLabel(q)}`);
          alertUser('Neue Frage!', questionLabel(q));
        }
      } else if (ev.type === 'question_answered' && role === 'seeker') {
        const q = state.questions.find((x) => x.id === p.id);
        if (q) {
          toast(`💬 Antwort: ${q.impossible ? 'nicht möglich' : q.answer}`);
          alertUser('Antwort erhalten', `${questionLabel(q)}: ${q.impossible ? 'nicht möglich' : q.answer}`);
        }
      } else if ((ev.type === 'curse_cast' || ev.type === 'curse_escalated') && role === 'seeker') {
        const c = state.curses.find((x) => x.id === (ev.type === 'curse_cast' ? p.id : p.newId));
        if (c && (c.targetTeamId == null || c.targetTeamId === myTeamId)) {
          const title = `Curse ${c.number}: ${curseDef(c.number)?.title ?? ''}`;
          toast(`🎲 ${title}`);
          alertUser('Ihr wurdet verflucht!', title);
        }
      } else if (ev.type === 'round_started') {
        const msg = `Neue Runde: ${teamName(state, p.hiderTeamId)} versteckt sich`;
        toast(`🫣 ${msg}`);
        alertUser('Neue Runde', msg);
      } else if (ev.type === 'round_ended' && p.reason === 'found') {
        toast('🎯 Gefunden! Die Runde ist vorbei.');
        alertUser('Gefunden!', 'Die Runde ist vorbei.');
      }
    }
  }, [events, state, me, toast]);
}

/** Teilt den eigenen Standort, solange man nicht Hider ist (ersetzt Life360). */
function useLocationSharing(api: GameApi, me: string, isHider: boolean, pos: { lat: number; lng: number; accuracy: number } | null) {
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const [enabled, setEnabled] = useState(() => getPref('shareLocation', true));
  const { shareLocation, clearLocation, locations } = api;

  useEffect(() => {
    const onPref = () => setEnabled(getPref('shareLocation', true));
    window.addEventListener('hs-pref', onPref);
    return () => window.removeEventListener('hs-pref', onPref);
  }, []);

  const share = enabled && !isHider;
  const hasStoredLocation = !!locations[me];

  useEffect(() => {
    if (!share && hasStoredLocation) {
      last.current = null;
      void clearLocation(me).catch(() => {});
    }
  }, [share, hasStoredLocation, clearLocation, me]);

  useEffect(() => {
    if (!share || !pos) return;
    const prev = last.current;
    const t = Date.now();
    if (prev && t - prev.at < SHARE_INTERVAL_MS && distance(prev, pos) < SHARE_MIN_MOVE_M) return;
    last.current = { at: t, lat: pos.lat, lng: pos.lng };
    void shareLocation({ playerId: me, lat: pos.lat, lng: pos.lng, accuracy: Math.round(pos.accuracy), updatedAt: t }).catch(() => {
      last.current = null;
    });
  }, [share, pos, me, shareLocation]);
}

/** Hält den Bildschirm wach, wenn in den Einstellungen aktiviert. */
function useWakeLock() {
  const [enabled, setEnabled] = useState(() => getPref('wakeLock', false));
  useEffect(() => {
    const onPref = () => setEnabled(getPref('wakeLock', false));
    window.addEventListener('hs-pref', onPref);
    return () => window.removeEventListener('hs-pref', onPref);
  }, []);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock?.release();
      } catch {
        // nicht verfügbar
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [enabled]);
}
