import { useEffect, type ReactNode } from 'react';
import type { Team } from '../game/types';
import { useNow } from '../hooks/useNow';
import { fmtDuration } from '../lib/time';

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

/** Restzeit bis `to`; nach Ablauf "abgelaufen" bzw. überzogen */
export function Countdown({ to, overdueText = 'abgelaufen', showOverdue = false }: { to: number; overdueText?: string; showOverdue?: boolean }) {
  const t = useNow();
  if (!isFinite(to)) return <span>–</span>;
  const left = to - t;
  if (left <= 0) {
    return <span className="overdue">{showOverdue ? `${overdueText} (+${fmtDuration(-left)})` : overdueText}</span>;
  }
  return <span className="mono">{fmtDuration(left)}</span>;
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
