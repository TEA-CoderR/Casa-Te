import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { Icon } from './Icon';
import { dateLocale, t } from '../lib/i18n';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@casa-te/shared';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <div className="muted">{subtitle}</div>}</div>
    {actions && <div className="row">{actions}</div>}</div>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${status}`}>{t(ORDER_STATUS_LABELS[status])}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const cls = status === 'paid' ? 'paid' : status === 'unpaid' ? 'muted' : status === 'failed' ? 'bad' : 'warn';
  return <span className={`badge ${cls}`}>{status === 'failed' ? t(PAYMENT_STATUS_LABELS[status]) : t('Pagamento: {status}', { status: t(PAYMENT_STATUS_LABELS[status]).toLowerCase() })}</span>;
}

export function Notice({ tone, children }: PropsWithChildren<{ tone?: 'error' | 'warn' }>) {
  return <div className={`notice ${tone ?? ''}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Loading() { return <p className="muted">{t('Caricamento…')}</p>; }

export function Empty({ children }: PropsWithChildren) { return <p className="muted" style={{ padding: 20, textAlign: 'center' }}>{children}</p>; }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: moves focus inside, traps Tab, restores focus on close.
 * With `dirty`, Esc and backdrop clicks do not discard what the user typed; only the explicit buttons close it.
 */
export function Modal({ title, onClose, children, dirty = false }: PropsWithChildren<{ title: string; onClose: () => void; dirty?: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>('input, select, textarea') ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dirtyRef.current) { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab' || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !dirtyRef.current) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
      <div className="row" style={{ marginBottom: 12 }}><h2 id="modal-title" style={{ margin: 0 }}>{title}</h2><span className="spacer" />
        <button className="ghost" onClick={onClose} aria-label={t('Chiudi senza salvare')}><Icon name="close" /></button></div>
      {children}
    </div>
  </div>;
}

/** Success / info message that screen readers announce. */
export function Success({ children, onDismiss }: PropsWithChildren<{ onDismiss?: () => void }>) {
  return <div className="notice success" role="status">{children}
    {onDismiss && <button className="ghost" onClick={onDismiss} aria-label={t('Chiudi messaggio')} style={{ marginLeft: 'auto' }}><Icon name="close" size={16} /></button>}</div>;
}

export function Field({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="field">{label}{children}{hint && <span className="small muted">{hint}</span>}</label>;
}

export function Pager({ page, hasMore, onPage }: { page: number; hasMore: boolean; onPage: (p: number) => void }) {
  return <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
    <button className="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}><Icon name="back" size={16} /> {t('Precedente')}</button>
    <span className="muted small">{t('Pagina {n}', { n: page + 1 })}</span>
    <button className="secondary" disabled={!hasMore} onClick={() => onPage(page + 1)}>{t('Successiva')} <Icon name="arrow" size={16} /></button>
  </div>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(dateLocale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
