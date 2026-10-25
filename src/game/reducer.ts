import { addActive, activeDuration, gameWindows, localDateString, wallClock, type Interval } from '../lib/time';
import { category, curseDef, MAX_CURSE, radarLabel } from './catalog';
import type { Curse, GameEvent, GameState, Pause, Question, Round, Settings } from './types';

export function defaultSettings(t: number): Settings {
  const w = wallClock(t);
  return {
    startDate: w.hour < 7 ? localDateString(t) : localDateString(t, 1),
    dayStart: '07:00',
    dayEnd: '19:00',
    days: 2,
    hidingMinutes: 120,
    countHidingPhase: false,
    cooldownMinutes: 30,
    cooldownScope: 'all',
    diceCost: 50,
    diceSides: 6,
    splitCount: null,
  };
}

function emptyState(): GameState {
  const settings = defaultSettings(0);
  return {
    name: 'Hide and Seek',
    createdAt: 0,
    createdBy: null,
    settings,
    windows: [],
    teams: [],
    players: {},
    rounds: [],
    questions: [],
    curses: [],
    markers: [],
    expenses: [],
    coinAdjustments: [],
    log: [],
    lastSeq: 0,
  };
}

export function teamName(s: GameState, id: string | null | undefined): string {
  if (!id) return 'ohne Team';
  return s.teams.find((t) => t.id === id)?.name ?? 'unbekanntes Team';
}

export function playerName(s: GameState, id: string | null | undefined): string {
  if (!id) return 'Jemand';
  return s.players[id]?.name ?? 'Jemand';
}

export function questionLabel(q: { text: string; param?: number }): string {
  return q.param != null ? q.text.replace('{radius}', radarLabel(q.param)) : q.text;
}

export function openRound(s: GameState): Round | undefined {
  const last = s.rounds[s.rounds.length - 1];
  return last && last.endedAt == null && s.endedAt == null ? last : undefined;
}

/** Münzen der Hiders in einer Runde */
export function roundCoins(s: GameState, roundId: string) {
  let earned = 0;
  for (const q of s.questions) if (q.roundId === roundId && !q.cancelled) earned += q.coins;
  for (const a of s.coinAdjustments) if (a.roundId === roundId) earned += a.delta;
  let spent = 0;
  for (const c of s.curses) if (c.roundId === roundId) spent += c.cost;
  return { earned, spent, balance: earned - spent };
}

function addPauseForCurse(round: Round, curse: Curse) {
  const def = curseDef(curse.number);
  if (!def?.pausesHidingMinutes) return;
  round.pauses.push({
    id: curse.id,
    start: curse.castAt,
    minutes: def.pausesHidingMinutes,
    reason: `Curse ${def.number}: ${def.title}`,
    end: Infinity,
  });
}

function log(s: GameState, ev: GameEvent, icon: string, text: string) {
  s.log.push({ at: ev.at, icon, text, seq: ev.seq });
}

function apply(s: GameState, ev: GameEvent) {
  const p = ev.payload ?? {};
  const who = playerName(s, ev.playerId);
  const round = openRound(s);
  switch (ev.type) {
    case 'game_created': {
      s.name = String(p.name || 'Hide and Seek');
      s.createdAt = ev.at;
      s.createdBy = ev.playerId;
      s.settings = { ...defaultSettings(ev.at), ...(p.settings ?? {}) };
      s.teams = Array.isArray(p.teams) ? p.teams.map((t: { id: string; name: string; color: string }) => ({ ...t })) : [];
      log(s, ev, '🎬', `Spiel „${s.name}“ erstellt`);
      break;
    }
    case 'settings_updated': {
      if (p.name) s.name = String(p.name);
      if (p.settings) s.settings = { ...s.settings, ...p.settings };
      log(s, ev, '⚙️', `${who} hat die Einstellungen geändert`);
      break;
    }
    case 'team_added': {
      if (!s.teams.some((t) => t.id === p.id)) s.teams.push({ id: p.id, name: String(p.name), color: String(p.color) });
      break;
    }
    case 'team_updated': {
      const t = s.teams.find((x) => x.id === p.id);
      if (t) {
        if (p.name) t.name = String(p.name);
        if (p.color) t.color = String(p.color);
      }
      break;
    }
    case 'team_removed': {
      if (round?.hiderTeamId === p.id) break;
      s.teams = s.teams.filter((t) => t.id !== p.id);
      for (const pl of Object.values(s.players)) if (pl.teamId === p.id) pl.teamId = null;
      break;
    }
    case 'player_joined': {
      const existing = s.players[p.id];
      if (existing) {
        existing.name = String(p.name || existing.name);
        if (p.teamId !== undefined) existing.teamId = p.teamId;
      } else {
        s.players[p.id] = { id: p.id, name: String(p.name || 'Spieler'), teamId: p.teamId ?? null, joinedAt: ev.at };
        log(s, ev, '👋', `${s.players[p.id].name} ist dabei (${teamName(s, p.teamId)})`);
      }
      break;
    }
    case 'player_updated': {
      const pl = s.players[p.id];
      if (!pl) break;
      if (p.name) pl.name = String(p.name);
      if (p.teamId !== undefined && pl.teamId !== p.teamId) {
        pl.teamId = p.teamId;
        log(s, ev, '🔀', `${pl.name} wechselt zu ${teamName(s, p.teamId)}`);
      }
      break;
    }
    case 'player_removed': {
      delete s.players[p.id];
      break;
    }
    case 'round_started': {
      if (round || !s.teams.some((t) => t.id === p.hiderTeamId)) break;
      s.rounds.push({
        id: p.id,
        number: s.rounds.length + 1,
        hiderTeamId: p.hiderTeamId,
        startedAt: ev.at,
        startedBy: ev.playerId,
        seekStartAt: Infinity,
        pauses: [],
      });
      log(s, ev, '🫣', `Runde ${s.rounds.length}: ${teamName(s, p.hiderTeamId)} versteckt sich`);
      break;
    }
    case 'seeking_started': {
      if (!round || round.id !== p.roundId || round.releasedAt != null) break;
      round.releasedAt = ev.at;
      log(s, ev, '🏃', `${who} hat die Seeker vorzeitig losgeschickt`);
      break;
    }
    case 'round_ended': {
      if (!round || round.id !== p.roundId) break;
      round.endedAt = ev.at;
      round.endReason = p.reason === 'aborted' ? 'aborted' : 'found';
      for (const pause of round.pauses) if (pause.minutes == null && pause.endedAt == null) pause.endedAt = ev.at;
      for (const c of s.curses) if (c.roundId === round.id && c.status === 'active') c.status = 'skipped';
      log(
        s,
        ev,
        round.endReason === 'found' ? '🎯' : '⏹️',
        round.endReason === 'found' ? `${teamName(s, round.hiderTeamId)} wurde gefunden!` : `Runde ${round.number} abgebrochen`,
      );
      break;
    }
    case 'pause_started': {
      if (!round || round.id !== p.roundId) break;
      if (round.pauses.some((x) => x.minutes == null && x.endedAt == null)) break;
      round.pauses.push({ id: p.id, start: ev.at, reason: String(p.reason || 'Pause'), end: Infinity });
      log(s, ev, '⏸️', `${who} hat die Hiding-Zeit pausiert${p.reason ? ` (${p.reason})` : ''}`);
      break;
    }
    case 'pause_ended': {
      const r = s.rounds.find((x) => x.id === p.roundId);
      const pause = r?.pauses.find((x) => x.id === p.id);
      if (pause && pause.endedAt == null) {
        pause.endedAt = ev.at;
        log(s, ev, '▶️', `${who} hat die Hiding-Zeit fortgesetzt`);
      }
      break;
    }
    case 'question_asked': {
      if (!round || round.id !== p.roundId) break;
      if (s.questions.some((q) => q.id === p.id)) break;
      const cat = category(p.category);
      const q: Question = {
        id: p.id,
        roundId: p.roundId,
        category: p.category,
        key: String(p.key),
        text: String(p.text),
        param: typeof p.param === 'number' ? p.param : undefined,
        coins: Number(p.coins ?? cat?.coins ?? 0),
        answerMinutes: Number(p.answerMinutes ?? cat?.answerMinutes ?? 5),
        teamId: p.teamId ?? null,
        askedBy: ev.playerId,
        askedAt: ev.at,
        pos: p.pos && typeof p.pos.lat === 'number' ? p.pos : undefined,
        deadline: Infinity,
      };
      s.questions.push(q);
      log(s, ev, cat?.emoji ?? '❓', `${who} fragt (${cat?.name ?? 'Frage'}): ${questionLabel(q)} · +${q.coins} Coins`);
      break;
    }
    case 'question_answered': {
      const q = s.questions.find((x) => x.id === p.id);
      if (!q || q.answer != null || q.cancelled) break;
      q.answer = String(p.answer ?? '');
      q.impossible = !!p.impossible;
      q.answeredAt = ev.at;
      q.answeredBy = ev.playerId;
      log(s, ev, q.impossible ? '🚫' : '💬', `Antwort auf „${questionLabel(q)}“: ${q.impossible ? 'nicht möglich' : q.answer}`);
      break;
    }
    case 'question_cancelled': {
      const q = s.questions.find((x) => x.id === p.id);
      if (!q || q.answer != null || q.cancelled) break;
      q.cancelled = true;
      log(s, ev, '↩️', `${who} hat die Frage „${questionLabel(q)}“ zurückgezogen`);
      break;
    }
    case 'curse_cast': {
      if (!round || round.id !== p.roundId) break;
      const number = Math.max(1, Math.min(MAX_CURSE, Math.round(Number(p.number))));
      const dice = Math.max(0, Math.round(Number(p.dice ?? 1)));
      const cost = Number(p.cost ?? dice * s.settings.diceCost);
      if (roundCoins(s, round.id).balance < cost) break;
      const curse: Curse = {
        id: p.id,
        roundId: round.id,
        number,
        dice,
        rolls: Array.isArray(p.rolls) ? p.rolls.map(Number) : null,
        cost,
        targetTeamId: p.targetTeamId ?? null,
        castAt: ev.at,
        castBy: ev.playerId,
        status: 'active',
      };
      s.curses.push(curse);
      addPauseForCurse(round, curse);
      const def = curseDef(number);
      log(
        s,
        ev,
        '🎲',
        `Curse ${number} „${def?.title}“ für ${curse.targetTeamId ? teamName(s, curse.targetTeamId) : 'alle Seeker'} (${dice} Würfel${
          curse.rolls ? `: ${curse.rolls.join(' + ')}` : ''
        })`,
      );
      break;
    }
    case 'curse_done': {
      const c = s.curses.find((x) => x.id === p.id);
      if (!c || c.status !== 'active') break;
      c.status = 'done';
      c.resolvedAt = ev.at;
      log(s, ev, '✅', `Curse ${c.number} „${curseDef(c.number)?.title}“ erledigt (${who})`);
      break;
    }
    case 'curse_escalated': {
      const c = s.curses.find((x) => x.id === p.id);
      if (!c || c.status !== 'active' || c.number >= MAX_CURSE) break;
      const r = s.rounds.find((x) => x.id === c.roundId);
      c.status = 'skipped';
      c.resolvedAt = ev.at;
      const next: Curse = {
        id: p.newId,
        roundId: c.roundId,
        number: c.number + 1,
        dice: 0,
        rolls: null,
        cost: 0,
        targetTeamId: c.targetTeamId,
        castAt: ev.at,
        castBy: ev.playerId,
        status: 'active',
        escalatedFrom: c.id,
      };
      s.curses.push(next);
      if (r && r.endedAt == null) addPauseForCurse(r, next);
      log(s, ev, '⬆️', `Curse ${c.number} nicht machbar → Curse ${next.number} „${curseDef(next.number)?.title}“`);
      break;
    }
    case 'coins_adjusted': {
      const r = s.rounds.find((x) => x.id === p.roundId);
      if (!r) break;
      const delta = Math.round(Number(p.delta) || 0);
      s.coinAdjustments.push({ roundId: r.id, delta, reason: String(p.reason ?? ''), at: ev.at });
      log(s, ev, '🪙', `${who}: Coins ${delta >= 0 ? '+' : ''}${delta}${p.reason ? ` (${p.reason})` : ''}`);
      break;
    }
    case 'marker_added': {
      if (s.markers.some((m) => m.id === p.id)) break;
      s.markers.push({
        id: p.id,
        kind: p.kind === 'pin' ? 'pin' : 'circle',
        lat: Number(p.lat),
        lng: Number(p.lng),
        radius: p.radius != null ? Number(p.radius) : undefined,
        inside: p.inside ?? null,
        label: String(p.label ?? ''),
        teamId: p.teamId ?? null,
        by: ev.playerId,
        at: ev.at,
      });
      break;
    }
    case 'marker_removed': {
      s.markers = s.markers.filter((m) => m.id !== p.id);
      break;
    }
    case 'expense_added': {
      const amount = Number(p.amount);
      if (!isFinite(amount) || amount <= 0 || s.expenses.some((e) => e.id === p.id)) break;
      s.expenses.push({ id: p.id, paidBy: p.paidBy, amount, note: String(p.note ?? ''), at: ev.at });
      log(s, ev, '🧾', `${playerName(s, p.paidBy)} hat ${amount.toFixed(2)} CHF bezahlt${p.note ? ` (${p.note})` : ''}`);
      break;
    }
    case 'expense_removed': {
      s.expenses = s.expenses.filter((e) => e.id !== p.id);
      break;
    }
    case 'game_ended': {
      if (s.endedAt != null) break;
      s.endedAt = ev.at;
      if (round) {
        round.endedAt = ev.at;
        round.endReason = 'aborted';
        for (const pause of round.pauses) if (pause.minutes == null && pause.endedAt == null) pause.endedAt = ev.at;
      }
      log(s, ev, '🏁', `${who} hat das Spiel beendet`);
      break;
    }
    case 'game_reopened': {
      if (s.endedAt == null) break;
      s.endedAt = undefined;
      log(s, ev, '🔁', `${who} hat das Spiel wieder geöffnet`);
      break;
    }
    default:
      break;
  }
}

/** Berechnete Felder (abhängig von den aktuellen Einstellungen) */
function derive(s: GameState) {
  s.windows = gameWindows(s.settings);
  for (const r of s.rounds) {
    const auto = addActive(r.startedAt, s.settings.hidingMinutes * 60000, s.windows);
    r.seekStartAt = r.releasedAt != null ? Math.min(r.releasedAt, auto) : auto;
    for (const pause of r.pauses) pause.end = pauseEnd(pause, s.windows);
  }
  for (const q of s.questions) q.deadline = addActive(q.askedAt, q.answerMinutes * 60000, s.windows);
}

function pauseEnd(p: Pause, windows: Interval[]): number {
  const fixed = p.minutes != null ? addActive(p.start, p.minutes * 60000, windows) : Infinity;
  return Math.min(fixed, p.endedAt ?? Infinity);
}

export function reduce(events: GameEvent[]): GameState {
  const s = emptyState();
  for (const ev of events) {
    try {
      apply(s, ev);
    } catch (err) {
      console.warn('Event übersprungen', ev, err);
    }
    s.lastSeq = ev.seq;
  }
  derive(s);
  return s;
}

// ---------- Abfragen ----------

export type Role = 'hider' | 'seeker' | 'none';

export function roleOf(s: GameState, playerId: string | null, round: Round | undefined): Role {
  const pl = playerId ? s.players[playerId] : undefined;
  if (!pl?.teamId || !round) return 'none';
  return pl.teamId === round.hiderTeamId ? 'hider' : 'seeker';
}

export type RoundPhase = 'hiding' | 'seeking' | 'ended';

export function roundPhase(r: Round, t: number): RoundPhase {
  if (r.endedAt != null) return 'ended';
  return t < r.seekStartAt ? 'hiding' : 'seeking';
}

export function activePause(r: Round, t: number): Pause | undefined {
  return r.pauses.find((p) => p.start <= t && t < p.end);
}

/** Hiding-Zeit einer Runde bis Zeitpunkt t */
export function hidingTime(s: GameState, r: Round, t: number): number {
  const from = s.settings.countHidingPhase ? r.startedAt : r.seekStartAt;
  const until = Math.min(t, r.endedAt ?? Infinity, s.endedAt ?? Infinity);
  const pauses = r.pauses.map((p) => ({ start: p.start, end: Math.min(p.end, until) }));
  return activeDuration(from, until, s.windows, pauses);
}

export function teamTotals(s: GameState, t: number) {
  return s.teams
    .map((team) => {
      const rounds = s.rounds.filter((r) => r.hiderTeamId === team.id);
      return { team, rounds: rounds.length, total: rounds.reduce((sum, r) => sum + hidingTime(s, r, t), 0) };
    })
    .sort((a, b) => b.total - a.total);
}

/** Bis wann eine Kategorie gesperrt ist (null = frei) */
export function cooldownUntil(s: GameState, r: Round, cat: string, teamId: string | null, t: number): number | null {
  let last = -Infinity;
  for (const q of s.questions) {
    if (q.roundId !== r.id || q.category !== cat || q.cancelled) continue;
    if (s.settings.cooldownScope === 'team' && q.teamId !== teamId) continue;
    last = Math.max(last, q.askedAt);
  }
  if (last === -Infinity) return null;
  const until = addActive(last, s.settings.cooldownMinutes * 60000, s.windows);
  return until > t ? until : null;
}

export function roundQuestions(s: GameState, roundId: string | undefined) {
  return s.questions.filter((q) => q.roundId === roundId && !q.cancelled);
}

export function openQuestions(s: GameState, roundId: string | undefined) {
  return roundQuestions(s, roundId).filter((q) => q.answer == null);
}

export function activeCurses(s: GameState, roundId: string | undefined, teamId?: string | null) {
  return s.curses.filter(
    (c) => c.roundId === roundId && c.status === 'active' && (teamId === undefined || c.targetTeamId == null || c.targetTeamId === teamId),
  );
}

export function curseAutoEnd(s: GameState, c: Curse): number | null {
  const def = curseDef(c.number);
  if (!def?.autoTimerMinutes) return null;
  return addActive(c.castAt, def.autoTimerMinutes * 60000, s.windows);
}
