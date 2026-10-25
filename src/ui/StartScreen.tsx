import { useState, type CSSProperties } from 'react';
import { getBackend, onlineAvailable, type BackendMode } from '../backend';
import { TEAM_COLORS } from '../game/catalog';
import { defaultSettings } from '../game/reducer';
import { normalizeCode, uid } from '../lib/ids';
import { forgetGame, savedGames, setPlayerId } from '../lib/storage';
import { now } from '../lib/time';
import { DaysPicker, ScheduleSummary } from './components';
import { GuideView } from './GuideView';

export function StartScreen({ onOpen }: { onOpen: (code: string, mode: BackendMode) => void }) {
  const [games, setGames] = useState(savedGames);
  const [joinCode, setJoinCode] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (showGuide) {
    return (
      <div className="guide-page">
        <div className="guide-page-head">
          <button className="btn" onClick={() => setShowGuide(false)}>
            ← Zurück
          </button>
        </div>
        <GuideView settings={defaultSettings(now())} inGame={false} />
      </div>
    );
  }

  return (
    <div className="start">
      <header className="hero">
        <div className="hero-icon">🫣</div>
        <h1>Hide and Seek</h1>
        <p className="muted">Schweiz-Edition · Fragen, Coins, Curses und Live-Standort der Seeker – ohne Life360.</p>
      </header>

      <section className="card">
        <h3>Spiel beitreten</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const code = normalizeCode(joinCode);
            if (code.length >= 4) onOpen(code, onlineAvailable ? 'online' : 'local');
          }}
        >
          <input
            className="code-input"
            placeholder="Spielcode"
            value={joinCode}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button className="btn primary" disabled={normalizeCode(joinCode).length < 4}>
            Beitreten
          </button>
        </form>
      </section>

      {showCreate ? (
        <CreateGame onCreated={onOpen} onCancel={() => setShowCreate(false)} />
      ) : (
        <button className="btn big primary block" onClick={() => setShowCreate(true)}>
          + Neues Spiel erstellen
        </button>
      )}

      {games.length > 0 && (
        <section className="card">
          <h3>Deine Spiele</h3>
          <ul className="list">
            {games.map((g) => (
              <li key={`${g.mode}:${g.code}`} className="list-row">
                <button className="link-btn grow" onClick={() => onOpen(g.code, g.mode)}>
                  <strong>{g.name || 'Hide and Seek'}</strong>
                  <span className="muted">
                    {' '}
                    · {g.code}
                    {g.mode === 'local' ? ' · Testmodus' : ''}
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label="Aus Liste entfernen"
                  onClick={() => {
                    forgetGame(g.mode, g.code);
                    setGames(savedGames());
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn ghost block" onClick={() => {
          window.scrollTo(0, 0);
          setShowGuide(true);
        }}>
        📖 Anleitung & Regeln
      </button>

      <p className="muted small center">
        Tipp: Im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen, dann startet die App wie eine normale App.
      </p>
    </div>
  );
}

function CreateGame({ onCreated, onCancel }: { onCreated: (code: string, mode: BackendMode) => void; onCancel: () => void }) {
  const defaults = defaultSettings(now());
  const [name, setName] = useState('Hide and Seek');
  const [playerName, setPlayerName] = useState('');
  const [teamCount, setTeamCount] = useState(3);
  const [myTeam, setMyTeam] = useState(0);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [days, setDays] = useState(defaults.days);
  const [local, setLocal] = useState(!onlineAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!playerName.trim()) {
      setError('Bitte gib deinen Namen ein.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mode: BackendMode = local ? 'local' : 'online';
      const backend = getBackend(mode);
      const playerId = uid();
      const teams = TEAM_COLORS.slice(0, teamCount).map((c) => ({ id: uid(), name: `Team ${c.name}`, color: c.color }));
      const code = await backend.createGame(playerId, { name: name.trim() || 'Hide and Seek', settings: { ...defaults, startDate, days }, teams });
      await backend.addEvent(code, playerId, 'player_joined', { id: playerId, name: playerName.trim(), teamId: teams[myTeam]?.id ?? null });
      setPlayerId(mode, code, playerId, name);
      onCreated(code, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Neues Spiel</h3>
      <label className="field">
        <span>Name des Spiels</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Dein Name</span>
        <input value={playerName} placeholder="z.B. Lea" onChange={(e) => setPlayerName(e.target.value)} />
      </label>
      <div className="field">
        <span>Anzahl Teams</span>
        <div className="seg">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={teamCount === n ? 'on' : ''}
              onClick={() => {
                setTeamCount(n);
                setMyTeam(Math.min(myTeam, n - 1));
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Dein Team</span>
        <div className="team-pick">
          {TEAM_COLORS.slice(0, teamCount).map((c, i) => (
            <button
              key={c.name}
              className={`team-btn ${myTeam === i ? 'on' : ''}`}
              style={{ '--team': c.color } as CSSProperties}
              onClick={() => setMyTeam(i)}
            >
              Team {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Spieldauer</span>
        <DaysPicker value={days} onChange={setDays} />
      </div>
      <label className="field">
        <span>Starttag (gespielt wird jeweils {defaults.dayStart}–{defaults.dayEnd})</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <ScheduleSummary settings={{ ...defaults, startDate, days }} />
      <label className="check">
        <input type="checkbox" checked={local} disabled={!onlineAvailable} onChange={(e) => setLocal(e.target.checked)} />
        <span>
          Testmodus – nur auf diesem Gerät (mehrere Tabs = mehrere Spieler)
        </span>
      </label>
      <p className="muted small">Teams, Zeiten und alle Regeln kannst du später unter „Mehr“ anpassen.</p>
      {error && <p className="error">{error}</p>}
      <div className="row end">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button className="btn primary" onClick={create} disabled={busy}>
          {busy ? 'Erstelle …' : 'Spiel erstellen'}
        </button>
      </div>
    </section>
  );
}
