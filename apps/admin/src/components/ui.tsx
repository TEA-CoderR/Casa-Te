import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@casa-te/shared';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <div className="muted">{subtitle}</div>}</div>
    {actions && <div className="row">{actions}</div>}</div>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${status}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const cls = status === 'paid' ? 'paid' : status === 'unpaid' ? 'muted' : status === 'failed' ? 'bad' : 'warn';
  return <span className={`badge ${cls}`}>{PAYMENT_STATUS_LABELS[status]}</span>;
}

export function Notice({ tone, children }: PropsWithChildren<{ tone?: 'error' | 'warn' }>) {
  return <div className={`notice ${tone ?? ''}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Loading() { return <p className="muted">Caricamento…</p>; }

export function Empty({ children }: PropsWithChildren) { return <p className="muted" style={{ padding: 20, textAlign: 'center' }}>{children}</p>; }

export function Modal({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="row" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><span className="spacer" />
        <button className="ghost" onClick={onClose} aria-label="Chiudi">✕</button></div>
      {children}
    </div>
  </div>;
}

export function Field({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="field">{label}{children}{hint && <span className="small muted">{hint}</span>}</label>;
}

export function Pager({ page, hasMore, onPage }: { page: number; hasMore: boolean; onPage: (p: number) => void }) {
  return <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
    <button className="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>← Precedente</button>
    <span className="muted small">Pagina {page + 1}</span>
    <button className="secondary" disabled={!hasMore} onClick={() => onPage(page + 1)}>Successiva →</button>
  </div>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
