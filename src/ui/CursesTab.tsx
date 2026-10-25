import { useEffect, useState } from 'react';
import { CURSES, curseDef, MAX_CURSE } from '../game/catalog';
import { activeCurses, curseAutoEnd, playerName, roundCoins, teamName } from '../game/reducer';
import type { Curse } from '../game/types';
import { useNow } from '../hooks/useNow';
import { uid } from '../lib/ids';
import { fmtClock, fmtDuration } from '../lib/time';
import { Countdown, Empty, ExternalLinks, Modal, Section } from './components';
import { useGameCtx } from './context';

export function CursesTab() {
  const { state, round, role, myTeam } = useGameCtx();
  const active = round ? activeCurses(state, round.id, role === 'seeker' ? myTeam?.id : undefined) : [];
  const past = round ? state.curses.filter((c) => c.roundId === round.id && c.status !== 'active').reverse() : [];

  return (
    <div className="stack">
      {role === 'hider' && round && <DicePanel />}
      <Section title={role === 'seeker' ? 'Eure aktiven Curses' : 'Aktive Curses'}>
        {active.length ? active.map((c) => <CurseCard key={c.id} curse={c} />) : <Empty>Keine aktiven Curses.</Empty>}
      </Section>
      {past.length > 0 && (
        <Section title="Erledigt in dieser Runde">
          <ul className="list">
            {past.map((c) => (
              <li key={c.id} className="list-row">
                <span className="curse-no small">{c.number}</span>
                <span className="grow">{curseDef(c.number)?.title}</span>
                <span className="muted small">{c.status === 'done' ? '✅ erledigt' : '⏭️ übersprungen'}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <AllCurses />
    </div>
  );
}

function DicePanel() {
  const { state, round, api, run } = useGameCtx();
  const [dice, setDice] = useState(1);
  const [target, setTarget] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [rolling, setRolling] = useState<number[] | null>(null);
  const [result, setResult] = useState<{ number: number; rolls: number[] | null } | null>(null);
  if (!round) return null;

  const { diceCost, diceSides } = state.settings;
  const coins = roundCoins(state, round.id).balance;
  const maxDice = Math.min(6, Math.floor(coins / diceCost));
  const count = Math.min(dice, Math.max(1, maxDice));
  const cost = count * diceCost;
  const seekerTeams = state.teams.filter((t) => t.id !== round.hiderTeamId);

  const cast = async (number: number, rolls: number[] | null) => {
    const ok = await run(() =>
      api.dispatch('curse_cast', { id: uid(), roundId: round.id, number, dice: count, rolls, cost, targetTeamId: target }),
    );
    if (ok) setResult({ number, rolls });
  };

  const rollDigital = () => {
    if (!confirm(`${count} Würfel für ${cost} Coins kaufen und würfeln? Das Ergebnis gilt sofort.`)) return;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * diceSides));
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks++;
      setRolling(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * diceSides)));
      if (ticks >= 8) {
        window.clearInterval(id);
        setRolling(null);
        const sum = rolls.reduce((a, b) => a + b, 0);
        void cast(Math.min(MAX_CURSE, sum), rolls);
      }
    }, 90);
  };

  return (
    <Section title="Curse kaufen" right={<span className="coins">🪙 {coins}</span>}>
      {maxDice < 1 ? (
        <Empty>
          Ein Würfel kostet {diceCost} Coins – ihr habt {coins}. Jede Frage der Seeker bringt euch Coins.
        </Empty>
      ) : (
        <>
          <div className="field">
            <span>Anzahl Würfel (je {diceCost} Coins, Summe = Curse-Nummer)</span>
            <div className="seg">
              {Array.from({ length: maxDice }, (_, i) => i + 1).map((n) => (
                <button key={n} className={count === n ? 'on' : ''} onClick={() => setDice(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {seekerTeams.length > 1 && (
            <div className="field">
              <span>Für wen?</span>
              <div className="seg">
                <button className={target == null ? 'on' : ''} onClick={() => setTarget(null)}>
                  Alle Seeker
                </button>
                {seekerTeams.map((t) => (
                  <button key={t.id} className={target === t.id ? 'on' : ''} onClick={() => setTarget(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {rolling && (
            <div className="dice-row">
              {rolling.map((r, i) => (
                <span key={i} className="die rolling">
                  {r}
                </span>
              ))}
            </div>
          )}
          {!manual ? (
            <div className="row">
              <button className="btn big primary grow" onClick={rollDigital} disabled={!!rolling}>
                🎲 Würfeln ({cost} Coins)
              </button>
              <button className="btn" onClick={() => setManual(true)}>
                Echte Würfel
              </button>
            </div>
          ) : (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.round(Number(manualValue));
                if (n >= 1 && confirm(`Curse ${Math.min(MAX_CURSE, n)} für ${cost} Coins senden?`)) void cast(Math.min(MAX_CURSE, n), null);
              }}
            >
              <input
                className="grow"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={`Gewürfelte Summe (${count}–${count * diceSides})`}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
              />
              <button className="btn primary">Senden</button>
              <button type="button" className="btn ghost" onClick={() => setManual(false)}>
                ✕
              </button>
            </form>
          )}
          <p className="muted small">
            Summe über {MAX_CURSE} zählt als Curse {MAX_CURSE}. Die Curse geht sofort an {target ? teamName(state, target) : 'alle Seeker'}.
          </p>
        </>
      )}
      {result && (
        <Modal open onClose={() => setResult(null)} title="Gewürfelt!">
          {result.rolls && (
            <div className="dice-row">
              {result.rolls.map((r, i) => (
                <span key={i} className="die">
                  {r}
                </span>
              ))}
            </div>
          )}
          <CurseText number={result.number} />
          <p className="muted small">Die Seeker wurden benachrichtigt.</p>
        </Modal>
      )}
    </Section>
  );
}

function CurseText({ number }: { number: number }) {
  const def = curseDef(number);
  if (!def) return null;
  return (
    <div className="curse-text">
      <div className="curse-title">
        <span className="curse-no">{def.number}</span> {def.title}
      </div>
      <p className="pre">{def.text}</p>
      {def.songs && (
        <ol className="small">
          {def.songs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      <ExternalLinks links={def.links} />
    </div>
  );
}

function CurseCard({ curse }: { curse: Curse }) {
  const { state, role, api, run } = useGameCtx();
  const def = curseDef(curse.number);
  const autoEnd = curseAutoEnd(state, curse);
  const t = useNow();

  return (
    <div className="curse-card">
      <CurseText number={curse.number} />
      <p className="muted small">
        {curse.escalatedFrom ? 'Nächsthöhere Curse' : `Gewürfelt von ${playerName(state, curse.castBy)}`} um {fmtClock(curse.castAt)} ·{' '}
        {curse.targetTeamId ? teamName(state, curse.targetTeamId) : 'alle Seeker'}
        {curse.rolls ? ` · 🎲 ${curse.rolls.join(' + ')}` : ''}
      </p>
      {autoEnd != null && (
        <div className={`banner ${t < autoEnd ? 'warn' : 'ok'}`}>
          {t < autoEnd ? (
            <>
              ⏳ Läuft noch <Countdown to={autoEnd} />
            </>
          ) : (
            '✅ Zeit abgelaufen'
          )}
        </div>
      )}
      {def?.songs && <SongRoll songs={def.songs} />}
      {def?.timers && <Timers minutes={def.timers} />}
      {role === 'seeker' && (
        <div className="row">
          <button
            className="btn primary grow"
            onClick={() => {
              if (confirm('Curse erledigt und den Hiders dokumentiert (Foto/Video)?')) void run(() => api.dispatch('curse_done', { id: curse.id }), 'Curse erledigt ✅');
            }}
          >
            ✅ Erledigt & dokumentiert
          </button>
          {curse.number < MAX_CURSE && (
            <button
              className="btn"
              onClick={() => {
                if (confirm(`Curse nicht machbar? Erklärt es den Hiders – stattdessen gilt Curse ${curse.number + 1}.`))
                  void run(() => api.dispatch('curse_escalated', { id: curse.id, newId: uid() }));
              }}
            >
              Nicht machbar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SongRoll({ songs }: { songs: string[] }) {
  const [song, setSong] = useState<number | null>(null);
  return (
    <div className="row">
      <button className="btn" onClick={() => setSong(Math.floor(Math.random() * songs.length))}>
        🎲 Song würfeln
      </button>
      {song != null && (
        <strong>
          {song + 1}. {songs[song]}
        </strong>
      )}
    </div>
  );
}

/** Lokale Stoppuhr für Wartezeiten der Curses */
function Timers({ minutes }: { minutes: number[] }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [end]);
  useEffect(() => {
    if (end != null && now >= end) {
      navigator.vibrate?.([300, 100, 300]);
    }
  }, [end, now]);
  return (
    <div className="row wrap">
      {minutes.map((m) => (
        <button
          key={m}
          className="btn small"
          onClick={() => {
            setEnd(Date.now() + m * 60000);
            setNow(Date.now());
          }}
        >
          ⏱️ {m < 1 ? `${m * 60} s` : `${m} min`}
        </button>
      ))}
      {end != null && (
        <span className={now >= end ? 'overdue' : 'mono'}>
          {now >= end ? 'Zeit um!' : fmtDuration(end - now)}
          <button className="icon-btn" onClick={() => setEnd(null)} aria-label="Timer stoppen">
            ✕
          </button>
        </span>
      )}
    </div>
  );
}

function AllCurses() {
  const [open, setOpen] = useState(false);
  return (
    <Section
      title="Alle Curses"
      right={
        <button className="btn small ghost" onClick={() => setOpen(!open)}>
          {open ? 'Ausblenden' : 'Anzeigen'}
        </button>
      }
    >
      {open && (
        <div className="stack-sm">
          {CURSES.map((c) => (
            <CurseText key={c.number} number={c.number} />
          ))}
        </div>
      )}
    </Section>
  );
}
