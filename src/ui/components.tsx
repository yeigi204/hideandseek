import { useContext, useEffect, type ReactNode } from 'react';
import type { Team } from '../game/types';
import { useNow } from '../hooks/useNow';
import { activeDuration, clockState, fmtDayClock, fmtDuration, gameWindows, isActiveAt, type ScheduleSettings } from '../lib/time';
import { Ctx } from './context';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schliessen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Restzeit bis `to` in Spielzeit: In der Ruhephase (und vor Spielstart) steht sie still und wird mit ⏸ angezeigt.
 * Nach Ablauf "abgelaufen" bzw. überzogen.
 */
export function Countdown({ to, overdueText = 'abgelaufen', showOverdue = false }: { to: number; overdueText?: string; showOverdue?: boolean }) {
  const t = useNow();
  const windows = useContext(Ctx)?.state.windows;
  if (!isFinite(to)) return <span>–</span>;
  if (t >= to) {
    const over = windows?.length ? activeDuration(to, t, windows) : t - to;
    return <span className="overdue">{showOverdue ? `${overdueText} (+${fmtDuration(over)})` : overdueText}</span>;
  }
  if (!windows?.length) return <span className="mono">{fmtDuration(to - t)}</span>;
  const left = activeDuration(t, to, windows);
  const paused = !isActiveAt(t, windows);
  return (
    <span className={`mono ${paused ? 'paused' : ''}`} title={paused ? 'Steht still (Ruhephase)' : undefined}>
      {paused && '⏸ '}
      {fmtDuration(left)}
    </span>
  );
}

export function TeamChip({ team, small }: { team: Team | undefined; small?: boolean }) {
  if (!team) return <span className={`chip ${small ? 'chip-sm' : ''}`}>ohne Team</span>;
  return (
    <span className={`chip ${small ? 'chip-sm' : ''}`} style={{ background: team.color, color: '#fff' }}>
      {team.name}
    </span>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

export function ExternalLinks({ links }: { links?: { label: string; url: string }[] }) {
  if (!links?.length) return null;
  return (
    <div className="links">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          ↗ {l.label}
        </a>
      ))}
    </div>
  );
}

export const DAY_OPTIONS = [1, 2, 3, 4, 5];

export function DaysPicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="seg">
      {DAY_OPTIONS.map((n) => (
        <button key={n} type="button" className={value === n ? 'on' : ''} onClick={() => onChange(n)}>
          {n === 1 ? '1 Tag' : `${n} Tage`}
        </button>
      ))}
    </div>
  );
}

/** Was bedeuten Starttag, Tage und Spielzeit konkret? (Start, Ende und was gerade gilt) */
export function ScheduleSummary({ settings }: { settings: ScheduleSettings }) {
  const t = useNow(30000);
  const w = gameWindows(settings);
  if (!w.length) return null;
  const c = clockState(t, w);
  const status = {
    before: `Bis zum Start stehen alle Uhren still.`,
    active: `Das Spiel läuft jetzt – Ruhephase ab ${fmtDayClock(c.nextChange ?? t, t)}.`,
    rest: `Jetzt ist Ruhephase bis ${fmtDayClock(c.nextChange ?? t, t)}.`,
    over: 'Das Spiel ist damit bereits vorbei.',
  }[c.phase];
  return (
    <p className="banner small">
      Start {fmtDayClock(c.gameStart, 0)} · Ende {fmtDayClock(c.gameEnd, 0)}
      <br />
      {status}
    </p>
  );
}
