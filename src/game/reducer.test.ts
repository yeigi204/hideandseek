import { describe, expect, it } from 'vitest';
import { zonedToEpoch } from '../lib/time';
import { activeCurses, activePause, cooldownUntil, hidingTime, limitReached, openRound, reduce, roundCoins, teamsOnTurn, teamTotals } from './reducer';
import { settle } from './settle';
import type { GameEvent } from './types';

const M = 60000;
const H = 60 * M;
const T0 = zonedToEpoch(2026, 6, 13, 7, 0);

function game(extra: [number, string, string, object][]): GameEvent[] {
  const base: [number, string, string, object][] = [
    [
      0,
      'a',
      'game_created',
      {
        name: 'Test',
        settings: { startDate: '2026-06-13' },
        teams: [
          { id: 'rot', name: 'Team Rot', color: '#f00' },
          { id: 'blau', name: 'Team Blau', color: '#00f' },
        ],
      },
    ],
    [0, 'a', 'player_joined', { id: 'a', name: 'Anna', teamId: 'rot' }],
    [0, 'b', 'player_joined', { id: 'b', name: 'Ben', teamId: 'blau' }],
  ];
  return [...base, ...extra].map(([at, playerId, type, payload], i) => ({ seq: i + 1, at: T0 + at, playerId, type, payload }));
}

describe('Runden und Hiding-Zeit', () => {
  it('Suchphase beginnt nach 2 h, Zeit läuft ab dann', () => {
    const s = reduce(game([[0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }]]));
    const r = openRound(s)!;
    expect(r.seekStartAt).toBe(T0 + 2 * H);
    expect(hidingTime(s, r, T0 + H)).toBe(0);
    expect(hidingTime(s, r, T0 + 3 * H)).toBe(H);
  });

  it('Gefunden beendet die Runde und friert die Zeit ein', () => {
    const s = reduce(
      game([
        [0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }],
        [5 * H, 'b', 'round_ended', { roundId: 'r1', reason: 'found' }],
      ]),
    );
    expect(openRound(s)).toBeUndefined();
    expect(hidingTime(s, s.rounds[0], T0 + 10 * H)).toBe(3 * H);
    expect(teamTotals(s, T0 + 10 * H)[0]).toMatchObject({ total: 3 * H, rounds: 1 });
  });

  it('vorzeitiger Start der Seeker', () => {
    const s = reduce(
      game([
        [0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }],
        [30 * M, 'a', 'seeking_started', { roundId: 'r1' }],
      ]),
    );
    expect(s.rounds[0].seekStartAt).toBe(T0 + 30 * M);
  });

  it('zweite Runde kann erst nach Ende der ersten starten', () => {
    const s = reduce(
      game([
        [0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }],
        [M, 'b', 'round_started', { id: 'r2', hiderTeamId: 'blau' }],
      ]),
    );
    expect(s.rounds).toHaveLength(1);
  });

  it('Ruhephase stoppt die Hiding-Zeit', () => {
    const s = reduce(game([[9 * H, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }]]));
    const r = s.rounds[0];
    // Start 16:00, Suche ab 18:00, um 08:00 am nächsten Tag: 1 h + 1 h
    expect(r.seekStartAt).toBe(T0 + 11 * H);
    expect(hidingTime(s, r, zonedToEpoch(2026, 6, 14, 8, 0))).toBe(2 * H);
  });
});

describe('Fragen, Coins und Curses', () => {
  const seek = T0 + 2 * H;
  const base = game([[0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }]]);
  const offset = (t: number) => t - T0;

  it('Coins gibt es mit der rechtzeitigen Antwort, Curses kosten Coins', () => {
    const s = reduce(
      game([
        [0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }],
        [offset(seek + M), 'b', 'question_asked', { id: 'q1', roundId: 'r1', category: 'relativ', key: 'rel-ns', text: 'x', coins: 40, teamId: 'blau' }],
        [offset(seek + 2 * M), 'a', 'question_answered', { id: 'q1', answer: 'Nördlicher' }],
        [offset(seek + 3 * M), 'b', 'question_asked', { id: 'q2', roundId: 'r1', category: 'radar', key: 'radar', text: 'x', param: 5000, coins: 30, teamId: 'blau' }],
        [offset(seek + 4 * M), 'a', 'question_answered', { id: 'q2', answer: 'Ja' }],
        [offset(seek + 5 * M), 'a', 'curse_cast', { id: 'c1', roundId: 'r1', number: 16, dice: 1, cost: 50 }],
        [offset(seek + 6 * M), 'a', 'curse_cast', { id: 'c2', roundId: 'r1', number: 6, dice: 1, cost: 50 }],
      ]),
    );
    expect(roundCoins(s, 'r1')).toEqual({ earned: 70, spent: 50, balance: 20 });
    expect(s.curses.map((c) => c.id)).toEqual(['c1']);
  });

  it('offene Frage bringt noch keine Coins', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'b', type: 'question_asked', payload: { id: 'q1', roundId: 'r1', category: 'radar', key: 'radar', text: 'x', coins: 30 } },
    ]);
    expect(roundCoins(s, 'r1').balance).toBe(0);
  });

  it('nur eine offene Frage gleichzeitig', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'b', type: 'question_asked', payload: { id: 'q1', roundId: 'r1', category: 'radar', key: 'radar', text: 'x', coins: 30 } },
      { seq: 11, at: seek + M, playerId: 'b', type: 'question_asked', payload: { id: 'q2', roundId: 'r1', category: 'foto', key: 'foto-kirche', text: 'x', coins: 15 } },
      { seq: 12, at: seek + 2 * M, playerId: 'a', type: 'question_answered', payload: { id: 'q1', answer: 'Nein' } },
      { seq: 13, at: seek + 3 * M, playerId: 'b', type: 'question_asked', payload: { id: 'q3', roundId: 'r1', category: 'foto', key: 'foto-kirche', text: 'x', coins: 15 } },
    ]);
    expect(s.questions.map((q) => q.id)).toEqual(['q1', 'q3']);
  });

  it('zu späte Antwort: keine Coins, Hiding-Zeit pausiert bis zur Antwort', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'b', type: 'question_asked', payload: { id: 'q1', roundId: 'r1', category: 'radar', key: 'radar', text: 'x', coins: 30, answerMinutes: 5 } },
      { seq: 11, at: seek + 25 * M, playerId: 'a', type: 'question_answered', payload: { id: 'q1', answer: 'Ja' } },
    ]);
    const r = s.rounds[0];
    expect(roundCoins(s, 'r1').balance).toBe(0);
    // 60 min Suchphase, davon 20 min überfällig
    expect(hidingTime(s, r, seek + H)).toBe(40 * M);
    expect(activePause(s, r, seek + 10 * M)?.reason).toMatch(/überfällig/);
  });

  it('nur eine blockierende Curse gleichzeitig', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'a', type: 'coins_adjusted', payload: { roundId: 'r1', delta: 200 } },
      { seq: 11, at: seek + M, playerId: 'a', type: 'curse_cast', payload: { id: 'c1', roundId: 'r1', number: 3, dice: 1, cost: 50 } },
      { seq: 12, at: seek + 2 * M, playerId: 'a', type: 'curse_cast', payload: { id: 'c2', roundId: 'r1', number: 5, dice: 1, cost: 50 } },
      { seq: 13, at: seek + 3 * M, playerId: 'b', type: 'curse_done', payload: { id: 'c1' } },
      { seq: 14, at: seek + 4 * M, playerId: 'a', type: 'curse_cast', payload: { id: 'c3', roundId: 'r1', number: 5, dice: 1, cost: 50 } },
    ]);
    expect(s.curses.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(roundCoins(s, 'r1').balance).toBe(100);
  });

  it('Endspiel starten und zurücknehmen', () => {
    const s1 = reduce([...base, { seq: 10, at: seek + H, playerId: 'a', type: 'endgame_started', payload: { roundId: 'r1' } }]);
    expect(s1.rounds[0].endgameAt).toBe(seek + H);
    const s2 = reduce([
      ...base,
      { seq: 10, at: seek + H, playerId: 'a', type: 'endgame_started', payload: { roundId: 'r1' } },
      { seq: 11, at: seek + H + M, playerId: 'a', type: 'endgame_cancelled', payload: { roundId: 'r1' } },
    ]);
    expect(s2.rounds[0].endgameAt).toBeUndefined();
  });

  it('Cooldown von 30 min pro Kategorie', () => {
    const s = reduce([
      ...base,
      { seq: 99, at: seek + M, playerId: 'b', type: 'question_asked', payload: { id: 'q1', roundId: 'r1', category: 'foto', key: 'foto-kirche', text: 'x', coins: 15, teamId: 'blau' } },
    ]);
    const r = s.rounds[0];
    expect(cooldownUntil(s, r, 'foto', 'blau', seek + 10 * M)).toBe(seek + 31 * M);
    expect(cooldownUntil(s, r, 'foto', 'blau', seek + 31 * M)).toBeNull();
    expect(cooldownUntil(s, r, 'radar', 'blau', seek + 10 * M)).toBeNull();
    expect(s.questions[0].deadline).toBe(seek + 16 * M);
  });

  it('Curse 20 stoppt die Hiding-Zeit für 30 min, nächsthöhere Curse', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'a', type: 'coins_adjusted', payload: { roundId: 'r1', delta: 100 } },
      { seq: 11, at: seek + H, playerId: 'a', type: 'curse_cast', payload: { id: 'c1', roundId: 'r1', number: 19, dice: 2, cost: 100 } },
      { seq: 12, at: seek + H, playerId: 'b', type: 'curse_escalated', payload: { id: 'c1', newId: 'c2' } },
    ]);
    const r = s.rounds[0];
    expect(activeCurses(s, 'r1').map((c) => c.number)).toEqual([20]);
    expect(hidingTime(s, r, seek + 2 * H)).toBe(2 * H - 30 * M);
  });

  it('Frage zurückziehen gibt keine Coins', () => {
    const s = reduce([
      ...base,
      { seq: 10, at: seek, playerId: 'b', type: 'question_asked', payload: { id: 'q1', roundId: 'r1', category: 'radar', key: 'radar', text: 'x', coins: 30 } },
      { seq: 11, at: seek + M, playerId: 'b', type: 'question_cancelled', payload: { id: 'q1' } },
      { seq: 12, at: seek + 2 * M, playerId: 'a', type: 'question_answered', payload: { id: 'q1', answer: 'Ja' } },
    ]);
    expect(roundCoins(s, 'r1').balance).toBe(0);
  });
});

describe('Wertung', () => {
  const R = (id: string, team: string, start: number, end: number, reason = 'found'): [number, string, string, object][] => [
    [start, 'a', 'round_started', { id, hiderTeamId: team }],
    [end, 'b', 'round_ended', { roundId: id, reason }],
  ];

  it('beste Runde zählt, abgebrochene Runden zählen nicht', () => {
    const s = reduce(game([...R('r1', 'rot', 0, 3 * H), ...R('r2', 'blau', 3 * H, 6 * H, 'aborted'), ...R('r3', 'blau', 6 * H, 9 * H + 30 * M), ...R('r4', 'rot', 10 * H, 12 * H + 30 * M)]));
    const totals = teamTotals(s, T0 + 20 * H);
    expect(totals.map((x) => [x.team.id, x.rounds, x.total])).toEqual([
      ['blau', 1, H + 30 * M],
      ['rot', 2, H],
    ]);
  });

  it('nur Teams mit den wenigsten Runden sind an der Reihe', () => {
    const s = reduce(game([...R('r1', 'rot', 0, 3 * H)]));
    expect([...teamsOnTurn(s)]).toEqual(['blau']);
  });

  it('Rundenlimit begrenzt die Hiding-Zeit', () => {
    const s = reduce(game([[0, 'a', 'round_started', { id: 'r1', hiderTeamId: 'rot' }]]));
    const r = s.rounds[0];
    // Standard: 2 h verstecken, max. 5 h Hiding-Zeit
    expect(limitReached(s, r, T0 + 6 * H)).toBe(false);
    expect(limitReached(s, r, T0 + 7 * H)).toBe(true);
    expect(hidingTime(s, r, T0 + 9 * H)).toBe(5 * H);
  });
});

describe('Kasse', () => {
  it('teilt durch die Anzahl Personen und schlägt Zahlungen vor', () => {
    const res = settle(
      ['a', 'b', 'c'],
      [
        { paidBy: 'a', amount: 60 },
        { paidBy: 'b', amount: 30 },
      ],
      null,
    );
    expect(res.share).toBe(30);
    expect(res.transfers).toEqual([{ from: 'c', to: 'a', amount: 30 }]);
  });
});
