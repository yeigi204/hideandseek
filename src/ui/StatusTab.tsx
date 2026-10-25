import { useState, type CSSProperties } from 'react';
import { CATEGORIES, category, curseDef } from '../game/catalog';
import {
  activeCurses,
  activePause,
  cooldownUntil,
  hidingTime,
  openQuestions,
  questionLabel,
  roundCoins,
  roundPhase,
  teamTotals,
} from '../game/reducer';
import { useNow } from '../hooks/useNow';
import { uid } from '../lib/ids';
import { clockState, fmtClock, fmtDayClock, fmtDuration, fmtDurationWords } from '../lib/time';
import { Countdown, Empty, Modal, Section, TeamChip } from './components';
import { useGameCtx } from './context';

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
  const { state } = useGameCtx();
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
  if (c.phase === 'before') {
    return (
      <div className="hero-card">
        <div className="hero-label">Spielstart {fmtDayClock(c.gameStart, t)}</div>
        <div className="hero-value mono">{fmtDuration(c.gameStart - t)}</div>
        <div className="muted small">Vor dem Start laufen keine Uhren. Runden können schon gestartet werden.</div>
      </div>
    );
  }
  if (c.phase === 'rest') {
    return (
      <div className="hero-card rest">
        <div className="hero-label">😴 Ruhephase – das Spiel ist gestoppt</div>
        <div className="hero-value mono">{fmtDuration((c.nextChange ?? t) - t)}</div>
        <div className="muted small">Weiter um {fmtDayClock(c.nextChange ?? t, t)}</div>
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
  const pause = activePause(round, t);
  const manualPause = round.pauses.find((p) => p.minutes == null && p.endedAt == null);

  const found = () => {
    if (!confirm(`${hider?.name ?? 'Das Hider-Team'} wurde gefunden? Die Runde wird beendet.`)) return;
    void run(() => api.dispatch('round_ended', { roundId: round.id, reason: 'found' }), 'Runde beendet 🎯');
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
              <li>Hiding Spot: höchstens 1000 m Luftlinie vom nächsten Bahnhof, frei zugänglich.</li>
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
          <div className="big-timer mono">{fmtDuration(hidingTime(state, round, t))}</div>
          {pause && (
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
        </div>
      )}
    </Section>
  );
}

export function StartRoundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, api, run, locationsToClear } = useStartRound();
  const t = useNow();
  const totals = teamTotals(state, t);
  return (
    <Modal open={open} onClose={onClose} title="Wer versteckt sich?">
      <div className="stack-sm">
        {state.teams.map((team) => {
          const info = totals.find((x) => x.team.id === team.id);
          const members = Object.values(state.players).filter((p) => p.teamId === team.id);
          return (
            <button
              key={team.id}
              className="team-btn wide on"
              style={{ '--team': team.color } as CSSProperties}
              disabled={members.length === 0}
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
    return (
      <Section title="Ihr seid die Hiders" right={<span className="coins">🪙 {coins.balance}</span>}>
        {open.length ? (
          <ul className="list">
            {open.map((q) => (
              <li key={q.id} className="list-row">
                <span className="grow">
                  {category(q.category)?.emoji} {questionLabel(q)}
                </span>
                <span className={t > q.deadline ? 'overdue' : 'mono'}>
                  <Countdown to={q.deadline} showOverdue />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine offenen Fragen.</Empty>
        )}
        <div className="row">
          {open.length > 0 && (
            <button className="btn primary grow" onClick={() => setTab('fragen')}>
              Fragen beantworten
            </button>
          )}
          <button className="btn grow" onClick={() => setTab('curses')} disabled={coins.balance < state.settings.diceCost}>
            🎲 Curse kaufen ({state.settings.diceCost} Coins)
          </button>
        </div>
      </Section>
    );
  }

  const curses = activeCurses(state, round.id, myTeam?.id);
  const phase = roundPhase(round, t);
  return (
    <Section title="Ihr seid Seeker">
      {curses.length > 0 && (
        <button className="banner bad block-btn" onClick={() => setTab('curses')}>
          🎲 {curses.length === 1 ? `Curse ${curses[0].number}: ${curseDef(curses[0].number)?.title}` : `${curses.length} aktive Curses`} – zuerst erledigen!
        </button>
      )}
      {phase === 'hiding' ? (
        <Empty>Wartet, bis die Versteckphase vorbei ist.</Empty>
      ) : (
        <div className="cooldowns">
          {CATEGORIES.map((c) => {
            const until = cooldownUntil(state, round, c.key, myTeam?.id ?? null, t);
            return (
              <button key={c.key} className={`cooldown ${until ? 'wait' : 'ready'}`} onClick={() => setTab('fragen')}>
                <span>
                  {c.emoji} {c.name}
                </span>
                <small>{until ? <Countdown to={until} /> : 'bereit'}</small>
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Leaderboard() {
  const { state } = useGameCtx();
  const t = useNow();
  const totals = teamTotals(state, t);
  if (!state.rounds.length) return null;
  return (
    <Section title="Rangliste (Hiding-Zeit)">
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
