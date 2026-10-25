import { useEffect, useState, type CSSProperties } from 'react';
import { getBackend, type BackendMode } from '../backend';
import { useGame, type GameApi } from '../hooks/useGame';
import { uid } from '../lib/ids';
import { getPlayerId, saveGame, setPlayerId as storePlayerId } from '../lib/storage';
import { GameScreen } from './GameScreen';

export function GameRoute({ code, mode, onLeave }: { code: string; mode: BackendMode; onLeave: () => void }) {
  const backend = getBackend(mode);
  const [playerId, setPlayerId] = useState<string | null>(() => getPlayerId(mode, code));
  const api = useGame(backend, code, playerId);
  const { state, status } = api;
  const joined = !!playerId && !!state.players[playerId];

  useEffect(() => {
    if (joined) saveGame({ code, mode, name: state.name, playerId });
  }, [joined, code, mode, state.name, playerId]);

  if (status === 'loading') {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="muted">Lade Spiel {code} …</p>
      </div>
    );
  }
  if (status === 'notfound' || status === 'error') {
    return (
      <div className="center-screen">
        <h2>{status === 'notfound' ? 'Spiel nicht gefunden' : 'Verbindung fehlgeschlagen'}</h2>
        <p className="muted">
          {status === 'notfound'
            ? `Zum Code ${code} gibt es kein Spiel${mode === 'local' ? ' auf diesem Gerät' : ''}.`
            : api.error ?? 'Bitte Internetverbindung prüfen.'}
        </p>
        <div className="row">
          {status === 'error' && (
            <button className="btn primary" onClick={() => void api.refresh()}>
              Nochmals versuchen
            </button>
          )}
          <button className="btn" onClick={onLeave}>
            Zur Startseite
          </button>
        </div>
      </div>
    );
  }

  if (!joined || !playerId) {
    return (
      <JoinScreen
        api={api}
        code={code}
        onJoined={(id) => {
          storePlayerId(mode, code, id, state.name);
          setPlayerId(id);
        }}
        onLeave={onLeave}
      />
    );
  }

  return <GameScreen api={api} me={playerId} code={code} mode={mode} onLeave={onLeave} />;
}

function JoinScreen({ api, code, onJoined, onLeave }: { api: GameApi; code: string; onJoined: (id: string) => void; onLeave: () => void }) {
  const { state } = api;
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState<string | null>(state.teams[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = Object.values(state.players);

  const join = async () => {
    if (!name.trim()) {
      setError('Bitte gib deinen Namen ein.');
      return;
    }
    setBusy(true);
    try {
      const id = uid();
      await api.dispatch('player_joined', { id, name: name.trim(), teamId }, id);
      onJoined(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="start">
      <header className="hero">
        <div className="hero-icon">🫣</div>
        <h1>{state.name}</h1>
        <p className="muted">Spielcode {code}</p>
      </header>
      <section className="card">
        <h3>Mitspielen</h3>
        <label className="field">
          <span>Dein Name</span>
          <input value={name} placeholder="z.B. Noah" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="field">
          <span>Dein Team</span>
          <div className="team-pick">
            {state.teams.map((t) => (
              <button
                key={t.id}
                className={`team-btn ${teamId === t.id ? 'on' : ''}`}
                style={{ '--team': t.color } as CSSProperties}
                onClick={() => setTeamId(t.id)}
              >
                {t.name}
                <small>{players.filter((p) => p.teamId === t.id).length} Spieler</small>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" onClick={join} disabled={busy}>
          {busy ? 'Trete bei …' : 'Beitreten'}
        </button>
      </section>
      {players.length > 0 && (
        <section className="card">
          <h3>Schon dabei? (z.B. neues Handy)</h3>
          <p className="muted small">Wähle dich aus, um mit deinem bestehenden Spieler weiterzumachen.</p>
          <div className="wrap">
            {players.map((p) => (
              <button key={p.id} className="btn" onClick={() => onJoined(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}
      <button className="btn ghost block" onClick={onLeave}>
        Zur Startseite
      </button>
    </div>
  );
}
