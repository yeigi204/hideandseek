import { useState, type CSSProperties } from 'react';
import { CATEGORIES, category, curseDef } from '../game/catalog';
import {
  activeCurses,
  activePause,
  blockingCurse,
  cooldownUntil,
  hidingTime,
  limitReached,
  openQuestions,
  questionLabel,
  roundCoins,
  roundPhase,
  teamsOnTurn,
  teamTotals,
} from '../game/reducer';
import { useNow } from '../hooks/useNow';
import { distance, fmtDistance } from '../lib/geo';
import { uid } from '../lib/ids';
import { clockState, fmtAgo, fmtClock, fmtDayClock, fmtDuration, fmtDurationWords } from '../lib/time';
import { Countdown, Empty, Modal, Section, StationLookupFailed, TeamChip } from './components';
import { useGameCtx } from './context';
import { useNearestStation } from './useNearestStation';

export function StatusTab() {
  return (
    <div className="stack">
      <ClockCard />
      <RoundCard />
      <RolePanel />
      <Leaderboard />
      <Feed />
    </div>
  );
}

function ClockCard() {
  const { state, openSettings } = useGameCtx();
  const t = useNow();
  const c = clockState(t, state.windows);
  if (state.endedAt != null || c.phase === 'over') {
    const leader = teamTotals(state, t)[0];
    return (
      <div className="hero-card done">
        <div className="hero-label">🏁 Spiel beendet</div>
        {leader && leader.total > 0 && (
          <div className="hero-value">
            {leader.team.name} gewinnt mit {fmtDurationWords(leader.total)}
          </div>
        )}
      </div>
    );
  }
  // Vor dem Start und in der Ruhephase stehen alle Spieluhren still – darum hier keine tickende Uhr
  if (c.phase === 'before' || c.phase === 'rest') {
    const next = c.nextChange ?? t;
    return (
      <div className={`hero-card ${c.phase === 'rest' ? 'rest' : ''}`}>
        <div className="hero-label">{c.phase === 'rest' ? '😴 Ruhephase – das Spiel ist gestoppt' : '⏳ Das Spiel hat noch nicht begonnen'}</div>
        <div className="hero-value">
          {c.phase === 'rest' ? 'Weiter' : 'Start'} {fmtDayClock(next, t)}
        </div>
        <div className="muted small">
          in {fmtDurationWords(next - t)} · bis dahin stehen alle Uhren still.{' '}
          <button className="link-btn inline" onClick={openSettings}>
            Zeiten ändern
          </button>
        </div>
      </div>
    );
  }
  const toRest = (c.nextChange ?? t) - t;
  const isLast = c.nextChange === c.gameEnd;
  return (
    <div className="hero-card live">
      <div className="hero-label">
        {isLast ? '🏁 Spielende' : '😴 Ruhephase'} um {fmtClock(c.nextChange ?? t)}
      </div>
      <div className="hero-value mono">{fmtDuration(toRest)}</div>
      {!isLast && toRest < 3 * 3600000 && (
        <div className="muted small">🚆 Nur noch in Züge steigen, die den Zielbahnhof vor {fmtClock(c.nextChange ?? t)} erreichen.</div>
      )}
    </div>
  );
}

function RoundCard() {
  const { state, round, role, api, run, openGuide } = useGameCtx();
  const t = useNow();
  const [startOpen, setStartOpen] = useState(false);

  if (state.endedAt != null) return null;

  if (!round) {
    return (
      <Section title="Keine Runde aktiv">
        <p className="muted">Startet eine Runde, sobald das Hider-Team bereit ist. Die Hiders haben dann {state.settings.hidingMinutes} Minuten Zeit.</p>
        <button className="btn primary block" onClick={() => setStartOpen(true)}>
          Runde starten
        </button>
        <button className="btn ghost block" onClick={openGuide}>
          📖 Wie funktioniert das Spiel?
        </button>
        <StartRoundDialog open={startOpen} onClose={() => setStartOpen(false)} />
      </Section>
    );
  }

  const phase = roundPhase(round, t);
  const hider = state.teams.find((x) => x.id === round.hiderTeamId);
  const pause = activePause(state, round, t);
  const manualPause = round.pauses.find((p) => p.minutes == null && p.endedAt == null);
  const time = hidingTime(state, round, t);
  const maxMs = state.settings.maxHidingMinutes ? state.settings.maxHidingMinutes * 60000 : null;
  const atLimit = limitReached(state, round, t);

  const found = () => {
    if (!confirm(`${hider?.name ?? 'Das Hider-Team'} wurde gefunden? Die Runde wird beendet.`)) return;
    void run(() => api.dispatch('round_ended', { roundId: round.id, reason: 'found' }), 'Runde beendet 🎯');
  };

  const startEndgame = () => {
    const text =
      role === 'hider'
        ? 'Ist mindestens ein Seeker in eurer Gemeinde und nicht mehr im ÖV? Dann startet das Endspiel: Euer jetziger Ort wird zum Hiding Spot, ihr bewegt euch nicht mehr.'
        : 'Endspiel starten? Das gilt, wenn ihr in der Gemeinde der Hiders seid und nicht mehr im ÖV. Die Hiders bewegen sich ab dann nicht mehr.';
    if (confirm(text)) void run(() => api.dispatch('endgame_started', { roundId: round.id }), '🔒 Endspiel gestartet');
  };

  return (
    <Section title={`Runde ${round.number}`} right={<TeamChip team={hider} small />}>
      {phase === 'hiding' ? (
        <div className="phase">
          <div className="phase-label">🫣 Versteckphase – Seeker starten in</div>
          <div className="big-timer mono">
            <Countdown to={round.seekStartAt} overdueText="jetzt" />
          </div>
          <div className="muted small">um {fmtDayClock(round.seekStartAt, t)}</div>
          {role === 'hider' && (
            <ul className="hints">
              <li>In der Gemeinde, in der ihr nach Ablauf der Zeit seid, müsst ihr bis zum Ende der Runde bleiben.</li>
              <li>Die Gemeinde muss per Zug und mind. stündlich erreichbar sein.</li>
              <li>Haltet euch nur an Orten auf, die als Hiding Spot gelten – beim Endspiel wird euer Standort zum Spot.</li>
            </ul>
          )}
          <button
            className="btn block"
            onClick={() => {
              if (confirm('Seeker jetzt losschicken? Die Versteckphase endet sofort.'))
                void run(() => api.dispatch('seeking_started', { roundId: round.id }));
            }}
          >
            Seeker jetzt starten
          </button>
        </div>
      ) : (
        <div className="phase">
          <div className="phase-label">🔎 Suchphase – Hiding-Zeit</div>
          <div className={`big-timer mono ${clockState(t, state.windows).phase !== 'active' ? 'paused' : ''}`}>{fmtDuration(time)}</div>
          {clockState(t, state.windows).phase === 'rest' && <div className="muted small">⏸ Ruhephase – die Hiding-Zeit steht still.</div>}
          {maxMs != null && !atLimit && <div className="muted small">Rundenlimit {fmtDurationWords(maxMs)} · noch {fmtDuration(maxMs - time)} Hiding-Zeit</div>}
          {pause && !atLimit && (
            <div className="banner warn">
              ⏸️ Hiding-Zeit gestoppt: {pause.reason}
              {isFinite(pause.end) && (
                <>
                  {' '}
                  · noch <Countdown to={pause.end} />
                </>
              )}
            </div>
          )}
          {atLimit ? (
            <>
              <div className="banner ok">
                ⏱️ Rundenlimit erreicht – {hider?.name} bekommt die vollen {fmtDurationWords(maxMs ?? 0)}.
              </div>
              <button
                className="btn primary block"
                onClick={() => void run(() => api.dispatch('round_ended', { roundId: round.id, reason: 'limit' }), 'Runde beendet')}
              >
                Runde beenden
              </button>
            </>
          ) : (
            <>
              {round.endgameAt != null ? (
                <div className="banner bad">
                  🔒 Endspiel seit {fmtClock(round.endgameAt)} – die Hiders bewegen sich nicht mehr.{' '}
                  <button
                    className="link-btn inline"
                    onClick={() => {
                      if (confirm('Endspiel zurücknehmen (nur bei Versehen)?')) void run(() => api.dispatch('endgame_cancelled', { roundId: round.id }));
                    }}
                  >
                    zurücknehmen
                  </button>
                </div>
              ) : (
                <button className="btn block" onClick={startEndgame}>
                  🔒 Endspiel starten
                </button>
              )}
              <div className="row">
                <button className="btn danger grow" onClick={found}>
                  🎯 Gefunden!
                </button>
                {manualPause ? (
                  <button className="btn" onClick={() => void run(() => api.dispatch('pause_ended', { roundId: round.id, id: manualPause.id }))}>
                    ▶️ Weiter
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() => {
                      const reason = prompt('Grund für die Pause (z.B. Notfall, Zugausfall):', '');
                      if (reason != null) void run(() => api.dispatch('pause_started', { roundId: round.id, id: uid(), reason }));
                    }}
                  >
                    ⏸️ Pause
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

export function StartRoundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, api, run, locationsToClear } = useStartRound();
  const t = useNow();
  const totals = teamTotals(state, t);
  const onTurn = teamsOnTurn(state);
  return (
    <Modal open={open} onClose={onClose} title="Wer versteckt sich?">
      <p className="muted small">Jedes Team versteckt sich gleich oft. Abgebrochene Runden zählen nicht.</p>
      <div className="stack-sm">
        {state.teams.map((team) => {
          const info = totals.find((x) => x.team.id === team.id);
          const members = Object.values(state.players).filter((p) => p.teamId === team.id);
          const allowed = members.length > 0 && onTurn.has(team.id);
          return (
            <button
              key={team.id}
              className="team-btn wide on"
              style={{ '--team': team.color } as CSSProperties}
              disabled={!allowed}
              onClick={async () => {
                const ok = await run(() => api.dispatch('round_started', { id: uid(), hiderTeamId: team.id }), `${team.name} versteckt sich!`);
                if (ok) {
                  // Hider-Standorte sofort von der Karte entfernen
                  await Promise.all(locationsToClear(team.id).map((id) => api.clearLocation(id).catch(() => {})));
                  onClose();
                }
              }}
            >
              <strong>{team.name}</strong>
              <small>
                {members.map((m) => m.name).join(', ') || 'keine Spieler'} · bisher {info?.rounds ?? 0}× versteckt
                {members.length > 0 && !allowed && ' · erst wieder dran, wenn alle anderen gleich oft waren'}
              </small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function useStartRound() {
  const { state, api, run } = useGameCtx();
  const locationsToClear = (teamId: string) =>
    Object.values(state.players)
      .filter((p) => p.teamId === teamId && api.locations[p.id])
      .map((p) => p.id);
  return { state, api, run, locationsToClear };
}

function RolePanel() {
  const { state, round, role, myTeam, setTab } = useGameCtx();
  const t = useNow();
  if (!round || role === 'none') return null;

  if (role === 'hider') {
    const coins = roundCoins(state, round.id);
    const open = openQuestions(state, round.id);
    const pending = open.filter((q) => t <= q.deadline).reduce((sum, q) => sum + q.coins, 0);
    const blocking = blockingCurse(state, round.id, null);
    return (
      <Section
        title="Ihr seid die Hiders"
        right={
          <span className="coins">
            🪙 {coins.balance}
            {pending > 0 && <small className="muted"> +{pending}</small>}
          </span>
        }
      >
        {round.endgameAt != null && <div className="banner bad">🔒 Endspiel – bewegt euch nicht mehr! Euer Ort ist jetzt der Hiding Spot.</div>}
        {open.length ? (
          <ul className="list">
            {open.map((q) => (
              <li key={q.id} className="list-row">
                <span className="grow">
                  {category(q.category)?.emoji} {questionLabel(q)}
                </span>
                <span className={t > q.deadline ? 'overdue' : 'mono'}>
                  <Countdown to={q.deadline} showOverdue overdueText="überfällig" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine offenen Fragen.</Empty>
        )}
        {open.some((q) => t > q.deadline) && <div className="banner bad">Überfällig: Eure Hiding-Zeit ist pausiert, bis ihr antwortet.</div>}
        <div className="row">
          {open.length > 0 && (
            <button className="btn primary grow" onClick={() => setTab('fragen')}>
              Fragen beantworten
            </button>
          )}
          <button className="btn grow" onClick={() => setTab('curses')} disabled={coins.balance < state.settings.diceCost || !!blocking}>
            🎲 Curse kaufen ({state.settings.diceCost} Coins)
          </button>
        </div>
        {blocking && <p className="muted small">Curse {blocking.number} ist noch aktiv – neue Würfel erst, wenn die Seeker sie erledigt haben.</p>}
        {roundPhase(round, t) === 'seeking' && round.endgameAt == null && <NearestSeeker />}
        <SpotCheck />
      </Section>
    );
  }

  const curses = activeCurses(state, round.id, myTeam?.id);
  const phase = roundPhase(round, t);
  const waiting = state.settings.oneQuestionAtATime ? openQuestions(state, round.id)[0] : undefined;
  return (
    <Section title="Ihr seid Seeker">
      {curses.length > 0 && (
        <button className="banner bad block-btn" onClick={() => setTab('curses')}>
          🎲 {curses.length === 1 ? `Curse ${curses[0].number}: ${curseDef(curses[0].number)?.title}` : `${curses.length} aktive Curses`} – zuerst erledigen!
        </button>
      )}
      {round.endgameAt != null && <div className="banner">🔒 Endspiel – die Hiders stehen still. Findet sie!</div>}
      {phase === 'hiding' ? (
        <Empty>Wartet, bis die Versteckphase vorbei ist.</Empty>
      ) : (
        <>
          {waiting && (
            <button className="banner warn block-btn" onClick={() => setTab('fragen')}>
              ⏳ Wartet auf Antwort: {questionLabel(waiting)} · <Countdown to={waiting.deadline} showOverdue overdueText="überfällig" />
            </button>
          )}
          <div className="cooldowns">
            {CATEGORIES.map((c) => {
              const until = cooldownUntil(state, round, c.key, myTeam?.id ?? null, t);
              return (
                <button key={c.key} className={`cooldown ${until ? 'wait' : 'ready'}`} onClick={() => setTab('fragen')}>
                  <span>
                    {c.emoji} {c.name}
                  </span>
                  <small>{until ? <Countdown to={until} /> : waiting ? 'nach der Antwort' : 'bereit'}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}

/** Für Hiders: Wie nah ist der nächste Seeker? Hilft zu entscheiden, wann das Endspiel beginnt. */
function NearestSeeker() {
  const { state, round, geo, api, me } = useGameCtx();
  const t = useNow(5000);
  if (!round || !geo.pos) return null;
  const nearest = Object.values(api.locations)
    .filter((l) => l.playerId !== me && state.players[l.playerId] && state.players[l.playerId].teamId !== round.hiderTeamId)
    .map((l) => ({ name: state.players[l.playerId].name, dist: distance(geo.pos!, l), at: l.updatedAt }))
    .sort((a, b) => a.dist - b.dist)[0];
  if (!nearest) return <p className="muted small">📡 Noch kein Seeker-Standort.</p>;
  const close = nearest.dist < 2000;
  return (
    <div className={`banner ${close ? 'warn' : ''}`}>
      📡 Nächster Seeker: <strong>{nearest.name}</strong> · {fmtDistance(nearest.dist)} · {fmtAgo(nearest.at, t)}
      {close && <div className="small">Sind sie in eurer Gemeinde und nicht mehr im ÖV? Dann startet das Endspiel.</div>}
    </div>
  );
}

/** Für Hiders: Ist der aktuelle Ort ein gültiger Hiding Spot? */
function SpotCheck() {
  const { geo } = useGameCtx();
  const [open, setOpen] = useState(false);
  const { result: station, retry } = useNearestStation(geo.pos, open);
  return (
    <details className="guide-details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>📍 Spot prüfen</summary>
      {!geo.pos ? (
        <p className="muted small">{geo.error ?? 'Warte auf GPS …'}</p>
      ) : !station || station.status === 'loading' ? (
        <p className="muted small">🚉 Suche nächsten Bahnhof …</p>
      ) : station.status === 'error' ? (
        <StationLookupFailed error={station.error} details={station.details} onRetry={retry} />
      ) : station.status === 'none' ? (
        <p className="overdue">✗ Kein Bahnhof im Umkreis von 2.5 km.</p>
      ) : (
        <p className={station.dist <= 1000 ? 'pos' : 'overdue'}>
          {station.dist <= 1000 ? '✓' : '✗'} {station.name}: {fmtDistance(station.dist)} Luftlinie (max. 1000 m)
          {station.source === 'timetable' && <span className="muted small"> · Quelle: SBB-Fahrplan</span>}
        </p>
      )}
      <ul className="hints">
        <li>Während der ganzen Spielzeit öffentlich und frei zugänglich, nichts Eingezäuntes.</li>
        <li>Direkt an einer Strasse oder einem Weg, der auf der Karte eingezeichnet ist (höchstens ca. 3 m daneben).</li>
        <li>Nicht in Toiletten, Wohnungen oder Läden.</li>
      </ul>
    </details>
  );
}

function Leaderboard() {
  const { state } = useGameCtx();
  const t = useNow();
  const totals = teamTotals(state, t);
  if (!state.rounds.length) return null;
  return (
    <Section title={state.settings.scoring === 'best' ? 'Rangliste (beste Runde)' : 'Rangliste (Summe)'}>
      <ol className="ranking">
        {totals.map((x, i) => (
          <li key={x.team.id}>
            <span className="rank">{i + 1}.</span>
            <TeamChip team={x.team} small />
            <span className="grow muted small">{x.rounds}× versteckt</span>
            <strong className="mono">{fmtDuration(x.total)}</strong>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Feed() {
  const { state } = useGameCtx();
  const [all, setAll] = useState(false);
  const entries = [...state.log].reverse();
  const shown = all ? entries : entries.slice(0, 12);
  return (
    <Section title="Verlauf">
      <ul className="feed">
        {shown.map((e) => (
          <li key={e.seq}>
            <span className="feed-time mono">{fmtDayClock(e.at)}</span>
            <span>
              {e.icon} {e.text}
            </span>
          </li>
        ))}
      </ul>
      {entries.length > shown.length && (
        <button className="btn ghost block" onClick={() => setAll(true)}>
          Alles anzeigen ({entries.length})
        </button>
      )}
    </Section>
  );
}
