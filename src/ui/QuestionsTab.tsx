import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  category,
  CUSTOM_QUESTION_KEY,
  questionDef,
  RADAR_DISTANCES,
  radarLabel,
  type CategoryDef,
  type HintKind,
  type QuestionDef,
} from '../game/catalog';
import { cooldownUntil, playerName, questionLabel, roundQuestions, roundPhase, teamName } from '../game/reducer';
import type { Question } from '../game/types';
import { useNow } from '../hooks/useNow';
import {
  boundsAround,
  CANTONS,
  distance,
  fetchStations,
  fmtDistance,
  nearestAirport,
  reverseGeocode,
  type LatLng,
  type PlaceInfo,
} from '../lib/geo';
import { uid } from '../lib/ids';
import { clockState, fmtAgo, fmtClock } from '../lib/time';
import { Countdown, Empty, ExternalLinks, Modal, Section } from './components';
import { useGameCtx } from './context';

interface AskTarget {
  cat: CategoryDef;
  q: QuestionDef | null; // null = eigene Frage
}

export function QuestionsTab() {
  const { state, round, role, me } = useGameCtx();
  const t = useNow();
  const [ask, setAsk] = useState<AskTarget | null>(null);
  const [answer, setAnswer] = useState<Question | null>(null);
  const questions = roundQuestions(state, round?.id);
  const open = questions.filter((q) => q.answer == null);
  const asked = new Set(questions.map((q) => q.key));
  const blocker = askBlocker();

  function askBlocker(): string | null {
    if (!round) return 'Es läuft keine Runde.';
    if (role === 'hider') return null;
    if (role === 'none') return 'Du bist in keinem Team.';
    if (roundPhase(round, t) === 'hiding') return 'Fragen sind erst nach der Versteckphase erlaubt.';
    const phase = clockState(t, state.windows).phase;
    if (phase === 'rest') return 'Ruhephase – das Spiel ist gestoppt.';
    if (phase === 'before') return 'Das Spiel hat noch nicht begonnen.';
    if (phase === 'over') return 'Das Spiel ist vorbei.';
    return null;
  }

  return (
    <div className="stack">
      {role === 'hider' && (
        <Section title="Offene Fragen an euch">
          {open.length ? (
            <ul className="list">
              {open.map((q) => (
                <li key={q.id}>
                  <button className="list-row q-open" onClick={() => setAnswer(q)}>
                    <span className="grow">
                      <strong>
                        {category(q.category)?.emoji} {questionLabel(q)}
                      </strong>
                      <br />
                      <span className="muted small">
                        {playerName(state, q.askedBy)} · {fmtClock(q.askedAt)} · {q.coins} Coins
                      </span>
                    </span>
                    <span className={t > q.deadline ? 'overdue' : 'mono'}>
                      <Countdown to={q.deadline} showOverdue />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Keine offenen Fragen. 🎉</Empty>
          )}
        </Section>
      )}

      {round && questions.length > 0 && <History questions={questions} onAnswer={role === 'hider' ? setAnswer : undefined} />}

      {role !== 'hider' && blocker && <div className="banner warn">{blocker}</div>}
      {role === 'hider' && <p className="muted small center">Fragenkatalog zur Info – stellen können nur die Seeker.</p>}

      {CATEGORIES.map((cat) => {
        const until = round && role === 'seeker' ? cooldownUntil(state, round, cat.key, state.players[me]?.teamId ?? null, t) : null;
        const canAsk = role === 'seeker' && !blocker && !until;
        return (
          <Section
            key={cat.key}
            title={`${cat.emoji} ${cat.name}`}
            right={
              <span className="muted small">
                {cat.coins} Coins · {cat.answerMinutes} min
              </span>
            }
          >
            {until && (
              <div className="banner warn small">
                Nächste {cat.name}-Frage in <Countdown to={until} />
              </div>
            )}
            {cat.intro && <p className="muted small">{cat.intro}</p>}
            <ul className="qlist">
              {cat.questions.map((q) => (
                <li key={q.key}>
                  <button className="q-btn" disabled={!canAsk} onClick={() => setAsk({ cat, q })}>
                    <span className="grow">{q.key === 'radar' ? 'Radius wählen: 30 m … 50 km oder eigener Wert' : q.text}</span>
                    {asked.has(q.key) && q.key !== 'radar' && <span className="tag">gefragt</span>}
                  </button>
                </li>
              ))}
              <li>
                <button className="q-btn ghost" disabled={!canAsk} onClick={() => setAsk({ cat, q: null })}>
                  <span className="grow">+ Eigene {cat.name}-Frage</span>
                </button>
              </li>
            </ul>
          </Section>
        );
      })}

      {ask && <AskDialog target={ask} onClose={() => setAsk(null)} />}
      {answer && <AnswerDialog question={answer} onClose={() => setAnswer(null)} />}
    </div>
  );
}

function History({ questions, onAnswer }: { questions: Question[]; onAnswer?: (q: Question) => void }) {
  const { state, me, api, run } = useGameCtx();
  const t = useNow();
  const list = [...questions].reverse();
  return (
    <Section title="Fragen dieser Runde">
      <ul className="list">
        {list.map((q) => {
          const cat = category(q.category);
          const canCancel = q.answer == null && q.askedBy === me && t - q.askedAt < 2 * 60000;
          return (
            <li key={q.id} className="qa">
              <div className="qa-q">
                <span>
                  {cat?.emoji} <strong>{questionLabel(q)}</strong>
                </span>
                <span className="muted small">
                  {teamName(state, q.teamId)} · {fmtClock(q.askedAt)}
                </span>
              </div>
              {q.answer != null ? (
                <div className={`qa-a ${q.impossible ? 'impossible' : ''}`}>
                  {q.impossible ? `🚫 Nicht möglich${q.answer ? `: ${q.answer}` : ''}` : `💬 ${q.answer}`}
                  <span className="muted small"> · {fmtAgo(q.answeredAt ?? t, t)}</span>
                </div>
              ) : (
                <div className="qa-a pending">
                  ⏳ wartet auf Antwort · <Countdown to={q.deadline} showOverdue overdueText="überfällig" />
                  {onAnswer && (
                    <button className="btn small primary" onClick={() => onAnswer(q)}>
                      Antworten
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="btn small ghost"
                      onClick={() => {
                        if (confirm('Frage zurückziehen? (nur bei Versehen)')) void run(() => api.dispatch('question_cancelled', { id: q.id }));
                      }}
                    >
                      Zurückziehen
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function AskDialog({ target, onClose }: { target: AskTarget; onClose: () => void }) {
  const { state, api, run, round, me, geo } = useGameCtx();
  const { cat, q } = target;
  const [radius, setRadius] = useState<number | null>(q?.key === 'radar' ? 1000 : null);
  const [customRadius, setCustomRadius] = useState('');
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);
  const isRadar = q?.key === 'radar';
  const teamId = state.players[me]?.teamId ?? null;

  const effectiveRadius = isRadar ? (radius ?? (Number(customRadius) > 0 ? Math.round(Number(customRadius)) : null)) : null;
  const text = q ? q.text : customText.trim();
  const valid = !!round && (!isRadar || effectiveRadius != null) && text.length > 0;

  const submit = async () => {
    if (!round || !valid) return;
    setBusy(true);
    const ok = await run(
      () =>
        api.dispatch('question_asked', {
          id: uid(),
          roundId: round.id,
          category: cat.key,
          key: q?.key ?? CUSTOM_QUESTION_KEY,
          text,
          param: effectiveRadius ?? undefined,
          coins: cat.coins,
          answerMinutes: cat.answerMinutes,
          teamId,
          pos: geo.pos ? { lat: geo.pos.lat, lng: geo.pos.lng, acc: Math.round(geo.pos.accuracy) } : undefined,
        }),
      'Frage gestellt',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${cat.emoji} ${cat.name}-Frage stellen`}>
      {q ? (
        <p className="q-text">{isRadar ? cat.intro : q.text}</p>
      ) : (
        <label className="field">
          <span>Eigene Frage</span>
          <textarea rows={3} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Frage an die Hiders" />
        </label>
      )}
      {isRadar && (
        <div className="field">
          <div className="wrap">
            {RADAR_DISTANCES.map((d) => (
              <button key={d} className={`pill ${radius === d ? 'on' : ''}`} onClick={() => setRadius(d)}>
                {radarLabel(d)}
              </button>
            ))}
            <button className={`pill ${radius == null ? 'on' : ''}`} onClick={() => setRadius(null)}>
              ???? eigener Wert
            </button>
          </div>
          {radius == null && (
            <label className="field">
              <span>Radius in Metern</span>
              <input type="number" inputMode="numeric" min={1} value={customRadius} onChange={(e) => setCustomRadius(e.target.value)} />
            </label>
          )}
        </div>
      )}
      <ExternalLinks links={q?.links} />
      <ul className="hints">
        <li>
          Die Hiders erhalten <strong>{cat.coins} Coins</strong> und haben <strong>{cat.answerMinutes} Minuten</strong> Zeit.
        </li>
        <li>Nächste {cat.name}-Frage frühestens in {state.settings.cooldownMinutes} Minuten.</li>
        <li>
          {geo.pos
            ? `Euer Standort wird mitgeschickt (±${Math.round(geo.pos.accuracy)} m) – für Radar & Karte.`
            : 'Kein GPS-Standort – Radar-/Richtungs-Hilfen funktionieren dann nicht.'}
        </li>
      </ul>
      <button className="btn primary block" disabled={!valid || busy} onClick={submit}>
        {busy ? 'Sende …' : isRadar && effectiveRadius ? `Radar ${radarLabel(effectiveRadius)} fragen` : 'Frage stellen'}
      </button>
    </Modal>
  );
}

function AnswerDialog({ question, onClose }: { question: Question; onClose: () => void }) {
  const { api, run, state } = useGameCtx();
  const def = questionDef(question.category, question.key);
  const spec = def?.answer ?? { type: 'text' as const };
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const live = state.questions.find((q) => q.id === question.id) ?? question;

  const send = async (answer: string, impossible = false) => {
    setBusy(true);
    const ok = await run(() => api.dispatch('question_answered', { id: question.id, answer, impossible }), 'Antwort gesendet');
    setBusy(false);
    if (ok) onClose();
  };

  if (live.answer != null || live.cancelled) {
    return (
      <Modal open onClose={onClose} title="Frage">
        <p>{live.cancelled ? 'Diese Frage wurde zurückgezogen.' : `Bereits beantwortet: ${live.answer}`}</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`${category(question.category)?.emoji ?? ''} Frage beantworten`}>
      <p className="q-text">{questionLabel(question)}</p>
      <p className="muted small">
        Zeit: <Countdown to={question.deadline} showOverdue overdueText="überfällig" /> · gefragt von {playerName(state, question.askedBy)}
      </p>
      <ExternalLinks links={def?.links} />
      {def?.hint && <HintPanel kind={def.hint} question={question} onUse={(a) => (spec.type === 'choice' ? void send(a) : setText(a))} />}

      {spec.type === 'choice' && (
        <div className="choice-grid">
          {spec.options.map((o) => (
            <button key={o} className="btn big primary" disabled={busy} onClick={() => void send(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      {spec.type === 'photo' && (
        <>
          <p className="muted small">Foto im WhatsApp-Chat schicken, dann hier bestätigen.</p>
          <button className="btn big primary block" disabled={busy} onClick={() => void send('Foto gesendet 📸')}>
            📸 Foto gesendet
          </button>
        </>
      )}
      {spec.type === 'text' && (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send(text.trim());
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={spec.placeholder ?? 'Antwort'} autoFocus />
          <button className="btn primary block" disabled={busy || !text.trim()}>
            Antwort senden
          </button>
        </form>
      )}

      <details className="impossible-box">
        <summary>Nicht möglich?</summary>
        <p className="muted small">Z.B. kein McDonalds oder kein Gemeindehaus in der Nähe. Die Coins bleiben bei euch.</p>
        <ImpossibleForm busy={busy} onSend={(reason) => void send(reason, true)} />
      </details>
    </Modal>
  );
}

function ImpossibleForm({ busy, onSend }: { busy: boolean; onSend: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="row">
      <input className="grow" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Begründung" />
      <button className="btn" disabled={busy} onClick={() => onSend(reason.trim())}>
        Melden
      </button>
    </div>
  );
}

// ---------- Hilfe für Hiders ----------

function HintPanel({ kind, question, onUse }: { kind: HintKind; question: Question; onUse: (answer: string) => void }) {
  const { geo } = useGameCtx();
  const mine = geo.pos;
  const theirs = question.pos;

  if (!mine) return <div className="hint">📍 Hilfe braucht euren GPS-Standort. {geo.error ?? 'Warte auf Standort …'}</div>;
  if (kind === 'station') return <StationHint pos={mine} onUse={onUse} />;
  if (!theirs) return <div className="hint">Die Seeker hatten beim Fragen keinen GPS-Standort – keine automatische Hilfe.</div>;

  const suggestion = (label: string, answer: string, detail?: string) => (
    <div className="hint">
      <div>
        📐 Berechnet: <strong>{label}</strong>
        {detail && <span className="muted small"> · {detail}</span>}
      </div>
      <button className="btn small" onClick={() => onUse(answer)}>
        Übernehmen
      </button>
      <div className="muted small">Geometrie aus den GPS-Standorten, keine KI – bitte kurz prüfen.</div>
    </div>
  );

  switch (kind) {
    case 'northsouth': {
      const d = distance({ lat: mine.lat, lng: theirs.lng }, theirs);
      const a = mine.lat >= theirs.lat ? 'Nördlicher' : 'Südlicher';
      return suggestion(a, a, `${fmtDistance(d)} ${a === 'Nördlicher' ? 'nördlich' : 'südlich'} der Seeker`);
    }
    case 'eastwest': {
      const d = distance({ lat: theirs.lat, lng: mine.lng }, theirs);
      const a = mine.lng >= theirs.lng ? 'Östlicher' : 'Westlicher';
      return suggestion(a, a, `${fmtDistance(d)} ${a === 'Östlicher' ? 'östlich' : 'westlich'} der Seeker`);
    }
    case 'radar': {
      const d = distance(mine, theirs);
      const inside = question.param != null && d <= question.param;
      return suggestion(inside ? 'Ja' : 'Nein', inside ? 'Ja' : 'Nein', `Distanz ${fmtDistance(d)} (Seeker-Standort beim Fragen)`);
    }
    case 'airport': {
      const a = nearestAirport(mine);
      const b = nearestAirport(theirs);
      const same = a.code === b.code;
      return suggestion(same ? 'Ja' : 'Nein', same ? 'Ja' : 'Nein', `Ihr: ${a.name} (${fmtDistance(a.dist)}), Seeker: ${b.name} (${fmtDistance(b.dist)})`);
    }
    case 'canton':
    case 'grossregion':
      return <PlaceHint kind={kind} mine={mine} theirs={theirs} onUse={onUse} />;
  }
}

const roundedKey = (p: LatLng) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
const fromKey = (k: string): LatLng => {
  const [lat, lng] = k.split(',').map(Number);
  return { lat, lng };
};

function PlaceHint({ kind, mine, theirs, onUse }: { kind: 'canton' | 'grossregion'; mine: LatLng; theirs: LatLng; onUse: (a: string) => void }) {
  const [places, setPlaces] = useState<[PlaceInfo, PlaceInfo] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mineKey = roundedKey(mine);
  const theirsKey = roundedKey(theirs);
  useEffect(() => {
    let cancelled = false;
    Promise.all([reverseGeocode(fromKey(mineKey)), reverseGeocode(fromKey(theirsKey))])
      .then((p) => !cancelled && setPlaces(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [mineKey, theirsKey]);

  if (error) return <div className="hint">Ortssuche nicht möglich: {error}</div>;
  if (!places) return <div className="hint">🔎 Suche Gemeinde und Kanton …</div>;
  const [a, b] = places;
  const fmt = (p: PlaceInfo) => `${p.municipality ?? '?'} (${p.canton ?? '?'})`;
  const sameCanton = a.canton != null && a.canton === b.canton;
  const regionA = a.canton ? CANTONS[a.canton]?.region : undefined;
  const regionB = b.canton ? CANTONS[b.canton]?.region : undefined;
  return (
    <div className="hint">
      <div>
        📍 Ihr: <strong>{fmt(a)}</strong>
        {kind === 'grossregion' && regionA && ` · ${regionA}`}
      </div>
      <div>
        🔎 Seeker: <strong>{fmt(b)}</strong>
        {kind === 'grossregion' && regionB && ` · ${regionB}`}
      </div>
      {kind === 'grossregion' && regionA && regionB && (
        <button className="btn small" onClick={() => onUse(regionA === regionB ? 'Ja' : 'Nein')}>
          Vorschlag übernehmen: {regionA === regionB ? 'Ja' : 'Nein'}
        </button>
      )}
      {kind === 'canton' && <div className="muted small">{sameCanton ? 'Gleicher Kanton.' : 'Verschiedene Kantone.'} Rest bitte nachschlagen.</div>}
      <div className="muted small">Daten: © OpenStreetMap-Mitwirkende</div>
    </div>
  );
}

function StationHint({ pos, onUse }: { pos: LatLng; onUse: (a: string) => void }) {
  const [res, setRes] = useState<{ name: string; dist: number } | null | 'none'>(null);
  const [error, setError] = useState<string | null>(null);
  const posKey = roundedKey(pos);
  useEffect(() => {
    let cancelled = false;
    const here = fromKey(posKey);
    fetchStations(boundsAround(here, 2500))
      .then((list) => {
        if (cancelled) return;
        const best = list.map((s) => ({ name: s.name, dist: distance(here, s.pos) })).sort((x, y) => x.dist - y.dist)[0];
        setRes(best ?? 'none');
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [posKey]);
  if (error) return <div className="hint">Bahnhof-Suche nicht möglich: {error}</div>;
  if (res == null) return <div className="hint">🚉 Suche nächsten Bahnhof …</div>;
  if (res === 'none') return <div className="hint">Kein Bahnhof im Umkreis von 2.5 km gefunden.</div>;
  // Luftlinie × 1.3 als grobe Wegstrecke, 4.5 km/h
  const minutes = Math.max(1, Math.round(((res.dist * 1.3) / 4500) * 60));
  return (
    <div className="hint">
      <div>
        🚉 Nächster Bahnhof: <strong>{res.name}</strong> · {fmtDistance(res.dist)} Luftlinie
      </div>
      <button className="btn small" onClick={() => onUse(`ca. ${minutes} Minuten`)}>
        Schätzung übernehmen: ca. {minutes} min
      </button>
      <div className="muted small">Grobe Schätzung – lieber in Google Maps nachschauen.</div>
    </div>
  );
}
