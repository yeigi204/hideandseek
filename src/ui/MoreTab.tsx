import { useState, type CSSProperties } from 'react';
import { TEAM_COLORS } from '../game/catalog';
import { hidingTime, openRound, playerName, teamTotals } from '../game/reducer';
import { round05, settle } from '../game/settle';
import type { Settings } from '../game/types';
import { useNow } from '../hooks/useNow';
import { uid } from '../lib/ids';
import { forgetGame, getPref, setPref } from '../lib/storage';
import { fmtDayClock, fmtDuration } from '../lib/time';
import { Empty, Section, TeamChip } from './components';
import { useGameCtx } from './context';
import { notificationsSupported, requestNotifications } from './notify';
import { GuideView } from './GuideView';
import { StartRoundDialog } from './StatusTab';

export type MoreSub = 'spiel' | 'kasse' | 'regeln' | 'einstellungen';

export function MoreTab({ sub, setSub }: { sub: MoreSub; setSub: (s: MoreSub) => void }) {
  const { state } = useGameCtx();
  return (
    <div className="stack">
      <div className="seg full">
        {(
          [
            ['spiel', 'Spiel'],
            ['kasse', 'Kasse'],
            ['regeln', 'Regeln'],
            ['einstellungen', 'Einstellungen'],
          ] as [MoreSub, string][]
        ).map(([k, label]) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'spiel' && <GameView />}
      {sub === 'kasse' && <KasseView />}
      {sub === 'regeln' && <GuideView settings={state.settings} inGame />}
      {sub === 'einstellungen' && <SettingsView />}
    </div>
  );
}

// ---------- Spiel ----------

function GameView() {
  const { state, code, mode, api, run, toast } = useGameCtx();
  const t = useNow();
  const [startOpen, setStartOpen] = useState(false);
  const round = openRound(state);
  const link = (() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('g', code);
    if (mode === 'local') url.searchParams.set('m', 'local');
    return url.toString();
  })();

  const share = async () => {
    const text = `Komm ins Hide-and-Seek-Spiel „${state.name}“! Code: ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: state.name, text, url: link });
        return;
      } catch {
        // abgebrochen → kopieren
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      toast('Link kopiert', 'ok');
    } catch {
      prompt('Link kopieren:', link);
    }
  };

  return (
    <>
      <Section title="Einladen">
        <div className="invite">
          <div className="invite-code mono">{code}</div>
          <button className="btn primary" onClick={share}>
            Link teilen
          </button>
        </div>
        {mode === 'local' && <p className="muted small">Testmodus: Das Spiel existiert nur in diesem Browser.</p>}
      </Section>

      <TeamsEditor />

      <Section title="Runden">
        {state.rounds.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hider</th>
                <th>Start</th>
                <th>Zeit</th>
              </tr>
            </thead>
            <tbody>
              {state.rounds.map((r) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>
                    <TeamChip team={state.teams.find((x) => x.id === r.hiderTeamId)} small />
                  </td>
                  <td className="small">{fmtDayClock(r.startedAt, t)}</td>
                  <td className="mono">
                    {fmtDuration(hidingTime(state, r, t))}
                    {r.endedAt == null ? ' ⏱️' : r.endReason === 'found' ? ' 🎯' : ' ⏹️'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Noch keine Runde gespielt.</Empty>
        )}
        {!round && state.endedAt == null && (
          <button className="btn primary block" onClick={() => setStartOpen(true)}>
            Neue Runde starten
          </button>
        )}
        {round && (
          <button
            className="btn ghost block"
            onClick={() => {
              if (confirm('Runde abbrechen? Die bisherige Hiding-Zeit zählt.')) void run(() => api.dispatch('round_ended', { roundId: round.id, reason: 'aborted' }));
            }}
          >
            Runde abbrechen
          </button>
        )}
        <StartRoundDialog open={startOpen} onClose={() => setStartOpen(false)} />
      </Section>

      <Section title="Gesamtwertung">
        <ol className="ranking">
          {teamTotals(state, t).map((x, i) => (
            <li key={x.team.id}>
              <span className="rank">{i + 1}.</span>
              <TeamChip team={x.team} small />
              <span className="grow" />
              <strong className="mono">{fmtDuration(x.total)}</strong>
            </li>
          ))}
        </ol>
        {state.endedAt == null ? (
          <button
            className="btn ghost block"
            onClick={() => {
              if (confirm('Spiel für alle beenden?')) void run(() => api.dispatch('game_ended', {}));
            }}
          >
            Spiel beenden
          </button>
        ) : (
          <button className="btn ghost block" onClick={() => void run(() => api.dispatch('game_reopened', {}))}>
            Spiel wieder öffnen
          </button>
        )}
      </Section>
    </>
  );
}

function TeamsEditor() {
  const { state, api, run } = useGameCtx();
  const round = openRound(state);
  const players = Object.values(state.players);
  const unassigned = players.filter((p) => !p.teamId || !state.teams.some((t) => t.id === p.teamId));

  const addTeam = () => {
    const used = new Set(state.teams.map((t) => t.color));
    const c = TEAM_COLORS.find((x) => !used.has(x.color)) ?? TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
    void run(() => api.dispatch('team_added', { id: uid(), name: `Team ${c.name}`, color: c.color }));
  };

  return (
    <Section
      title="Teams"
      right={
        <button className="btn small" onClick={addTeam}>
          + Team
        </button>
      }
    >
      <div className="stack-sm">
        {state.teams.map((team) => {
          const members = players.filter((p) => p.teamId === team.id);
          return (
            <div key={team.id} className="team-card" style={{ '--team': team.color } as CSSProperties}>
              <div className="row">
                <strong className="grow">{team.name}</strong>
                <button
                  className="icon-btn"
                  aria-label="Team umbenennen"
                  onClick={() => {
                    const name = prompt('Neuer Teamname:', team.name);
                    if (name?.trim()) void run(() => api.dispatch('team_updated', { id: team.id, name: name.trim() }));
                  }}
                >
                  ✏️
                </button>
                {members.length === 0 && round?.hiderTeamId !== team.id && (
                  <button
                    className="icon-btn"
                    aria-label="Team löschen"
                    onClick={() => {
                      if (confirm(`${team.name} löschen?`)) void run(() => api.dispatch('team_removed', { id: team.id }));
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
              <div className="muted small">{members.map((m) => m.name).join(', ') || 'noch niemand'}</div>
            </div>
          );
        })}
        {unassigned.length > 0 && <p className="muted small">Ohne Team: {unassigned.map((p) => p.name).join(', ')}</p>}
      </div>
    </Section>
  );
}

// ---------- Kasse ----------

function KasseView() {
  const { state, me, api, run } = useGameCtx();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paidBy, setPaidBy] = useState(me);
  const players = Object.values(state.players);
  const result = settle(
    players.map((p) => p.id),
    state.expenses,
    state.settings.splitCount,
  );
  const n = state.settings.splitCount ?? players.length;

  const add = async () => {
    const value = Number(amount.replace(',', '.'));
    if (!(value > 0)) return;
    const ok = await run(() => api.dispatch('expense_added', { id: uid(), paidBy, amount: Math.round(value * 100) / 100, note: note.trim() }), 'Beleg erfasst');
    if (ok) {
      setAmount('');
      setNote('');
    }
  };

  return (
    <>
      <Section title="Kassenbon erfassen">
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="row">
            <input className="grow" inputMode="decimal" placeholder="Betrag CHF" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <input placeholder="Wofür? (z.B. Zugbillett, Znüni)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary block" disabled={!(Number(amount.replace(',', '.')) > 0)}>
            Hinzufügen
          </button>
        </form>
      </Section>

      <Section title="Abrechnung">
        <div className="kpis">
          <div>
            <small>Total</small>
            <strong>{result.total.toFixed(2)}</strong>
          </div>
          <div>
            <small>Pro Person (÷ {n})</small>
            <strong>{round05(result.share).toFixed(2)}</strong>
          </div>
        </div>
        <ul className="list">
          {result.balances.map((b) => (
            <li key={b.id} className="list-row">
              <span className="grow">{playerName(state, b.id)}</span>
              <span className="muted small">bezahlt {b.paid.toFixed(2)}</span>
              <strong className={b.balance >= 0 ? 'pos' : 'neg'}>
                {b.balance >= 0 ? '+' : ''}
                {round05(b.balance).toFixed(2)}
              </strong>
            </li>
          ))}
        </ul>
        {result.transfers.length > 0 && (
          <>
            <h4>So wird ausgeglichen</h4>
            <ul className="list">
              {result.transfers.map((tr, i) => (
                <li key={i} className="list-row">
                  {playerName(state, tr.from)} → {playerName(state, tr.to)}: <strong>{tr.amount.toFixed(2)} CHF</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        {n !== players.length && (
          <p className="muted small">
            Es wird durch {n} geteilt, aber nur {players.length} Personen sind in der App – die übrigen schulden je {round05(result.share).toFixed(2)} CHF.
          </p>
        )}
      </Section>

      <Section title="Belege">
        {state.expenses.length ? (
          <ul className="list">
            {[...state.expenses].reverse().map((e) => (
              <li key={e.id} className="list-row">
                <span className="grow">
                  <strong>{e.amount.toFixed(2)}</strong> · {playerName(state, e.paidBy)}
                  {e.note && <span className="muted"> · {e.note}</span>}
                </span>
                <button
                  className="icon-btn"
                  aria-label="Beleg löschen"
                  onClick={() => {
                    if (confirm('Beleg löschen?')) void run(() => api.dispatch('expense_removed', { id: e.id }));
                  }}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Noch keine Belege.</Empty>
        )}
      </Section>
    </>
  );
}

// ---------- Einstellungen ----------

function SettingsView() {
  const { state, me, api, run, code, mode, leave, myTeam } = useGameCtx();
  const player = state.players[me];
  const [share, setShare] = useState(() => getPref('shareLocation', true));
  const [wake, setWake] = useState(() => getPref('wakeLock', false));
  const [notif, setNotif] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));

  return (
    <>
      <Section title="Ich">
        <label className="field">
          <span>Name</span>
          <input
            defaultValue={player?.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== player?.name) void run(() => api.dispatch('player_updated', { id: me, name }), 'Name gespeichert');
            }}
          />
        </label>
        <div className="field">
          <span>Team</span>
          <div className="team-pick">
            {state.teams.map((t) => (
              <button
                key={t.id}
                className={`team-btn ${myTeam?.id === t.id ? 'on' : ''}`}
                style={{ '--team': t.color } as CSSProperties}
                onClick={() => {
                  if (myTeam?.id !== t.id && confirm(`Zu ${t.name} wechseln?`)) void run(() => api.dispatch('player_updated', { id: me, teamId: t.id }));
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Dieses Gerät">
        <label className="check">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => {
              setShare(e.target.checked);
              setPref('shareLocation', e.target.checked);
            }}
          />
          <span>Standort teilen, wenn ich Seeker bin (als Hider wird er nie geteilt)</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={wake}
            onChange={(e) => {
              setWake(e.target.checked);
              setPref('wakeLock', e.target.checked);
            }}
          />
          <span>Bildschirm wach halten (Standort wird nur bei offener App aktualisiert)</span>
        </label>
        {notif !== 'unsupported' && notif !== 'granted' && (
          <button className="btn block" onClick={async () => setNotif(await requestNotifications())}>
            🔔 Benachrichtigungen erlauben
          </button>
        )}
        {notif === 'granted' && <p className="muted small">🔔 Benachrichtigungen sind erlaubt.</p>}
        {notif === 'denied' && <p className="muted small">Benachrichtigungen wurden im Browser blockiert.</p>}
      </Section>

      <GameSettingsForm />

      <Section title="Spiel verlassen">
        <p className="muted small">
          Entfernt das Spiel {code} nur von diesem Gerät. Du kannst jederzeit mit dem Code wieder beitreten und dich auswählen.
        </p>
        <button
          className="btn ghost block"
          onClick={() => {
            if (confirm('Spiel auf diesem Gerät verlassen?')) {
              forgetGame(mode, code);
              leave();
            }
          }}
        >
          Verlassen
        </button>
      </Section>
    </>
  );
}

function GameSettingsForm() {
  const { state, api, run } = useGameCtx();
  const [s, setS] = useState<Settings>(state.settings);
  const [name, setName] = useState(state.name);
  const dirty = JSON.stringify(s) !== JSON.stringify(state.settings) || name !== state.name;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const num = (v: string, min = 0) => Math.max(min, Math.round(Number(v) || 0));

  return (
    <Section title="Spielregeln (für alle)">
      <label className="field">
        <span>Name des Spiels</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Starttag</span>
          <input type="date" value={s.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </label>
        <label className="field">
          <span>Anzahl Tage</span>
          <input type="number" min={1} max={14} value={s.days} onChange={(e) => set('days', num(e.target.value, 1))} />
        </label>
        <label className="field">
          <span>Spielzeit ab</span>
          <input type="time" value={s.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
        </label>
        <label className="field">
          <span>Ruhephase ab</span>
          <input type="time" value={s.dayEnd === '24:00' ? '00:00' : s.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} />
        </label>
        <label className="field">
          <span>Versteckzeit (min)</span>
          <input type="number" min={0} value={s.hidingMinutes} onChange={(e) => set('hidingMinutes', num(e.target.value))} />
        </label>
        <label className="field">
          <span>Cooldown pro Kategorie (min)</span>
          <input type="number" min={0} value={s.cooldownMinutes} onChange={(e) => set('cooldownMinutes', num(e.target.value))} />
        </label>
        <label className="field">
          <span>Preis pro Würfel</span>
          <input type="number" min={1} value={s.diceCost} onChange={(e) => set('diceCost', num(e.target.value, 1))} />
        </label>
        <label className="field">
          <span>Würfelseiten</span>
          <select value={s.diceSides} onChange={(e) => set('diceSides', Number(e.target.value))}>
            <option value={6}>W6 (Summe = Curse)</option>
            <option value={20}>W20</option>
          </select>
        </label>
        <label className="field">
          <span>Kasse teilen durch</span>
          <input
            type="number"
            min={1}
            placeholder="alle Spieler"
            value={s.splitCount ?? ''}
            onChange={(e) => set('splitCount', e.target.value ? num(e.target.value, 1) : null)}
          />
        </label>
      </div>
      <div className="field">
        <span>Cooldown gilt</span>
        <div className="seg">
          <button className={s.cooldownScope === 'all' ? 'on' : ''} onClick={() => set('cooldownScope', 'all')}>
            für alle Seeker
          </button>
          <button className={s.cooldownScope === 'team' ? 'on' : ''} onClick={() => set('cooldownScope', 'team')}>
            pro Seeker-Team
          </button>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.countHidingPhase} onChange={(e) => set('countHidingPhase', e.target.checked)} />
        <span>Versteckphase zählt zur Hiding-Zeit</span>
      </label>
      <p className="muted small">Ausserhalb der Spielzeit (Ruhephase) laufen keine Uhren. Für einen Testlauf z.B. 00:00 bis 00:00 einstellen (= ganzer Tag).</p>
      <div className="row end">
        {dirty && (
          <button
            className="btn"
            onClick={() => {
              setS(state.settings);
              setName(state.name);
            }}
          >
            Zurücksetzen
          </button>
        )}
        <button
          className="btn primary"
          disabled={!dirty}
          onClick={() => void run(() => api.dispatch('settings_updated', { name: name.trim() || state.name, settings: s }), 'Einstellungen gespeichert')}
        >
          Speichern
        </button>
      </div>
    </Section>
  );
}
