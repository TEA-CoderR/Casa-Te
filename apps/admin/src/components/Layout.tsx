import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useStores } from '../lib/data';
import { overviewRange } from '../lib/overview';
import { Icon, type AdminIcon } from './Icon';
import { t } from '../lib/i18n';

const ROLE_LABEL = { admin: 'Amministratore', manager: 'Responsabile', store_staff: 'Personale negozio' } as const;


type Role = 'admin' | 'manager' | 'store_staff';
type Tab = { to: string; label: string; roles?: Role[] };

/**
 * Pages that belong together share one menu entry; the page shows them as tabs.
 * Detail pages (e.g. /products/:id) keep their own header and show no tabs.
 */
const SECTIONS: Array<{ tabs: Tab[] }> = [
  { tabs: [{ to: '/orders', label: 'Tutti gli ordini' }, { to: '/picking', label: 'Preparazione ordini' }] },
  { tabs: [{ to: '/products', label: 'Prodotti' }, { to: '/import', label: 'Importa prodotti' }, { to: '/reviews', label: 'Recensioni' }] },
  { tabs: [{ to: '/coupons', label: 'Codici sconto' }, { to: '/loyalty', label: 'Programma fedeltà' }] },
  { tabs: [{ to: '/stores', label: 'Negozi', roles: ['admin'] }, { to: '/shipping', label: 'Tariffe spedizione' }, { to: '/pickup-points', label: 'Punti di ritiro' }] },
];
const sectionOf = (pathname: string) => SECTIONS.find((s) => s.tabs.some((tab) => tab.to === pathname));

function Item({ to, icon, children, end, also = [] }: { to: string; icon: AdminIcon; children: string; end?: boolean; also?: string[] }) {
  const { pathname } = useLocation();
  // Also highlighted on the other tabs of its section (and their detail pages).
  const inSection = also.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return <NavLink to={to} end={end} className={({ isActive }) => (isActive || inSection ? 'active' : '')}>
    <Icon name={icon} size={20} strokeWidth={1.6} /><span>{children}</span></NavLink>;
}

function SectionTabs() {
  const { pathname } = useLocation();
  const { can } = useAuth();
  const section = sectionOf(pathname);
  const tabs = section?.tabs.filter((tab) => !tab.roles || can(...tab.roles)) ?? [];
  if (tabs.length < 2) return null;
  return <nav className="section-tabs" aria-label={t('Sezioni')}>
    {tabs.map((tab) => <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? 'on' : '')}>{t(tab.label)}</NavLink>)}
  </nav>;
}

/** Search in the top bar: Enter picks the obvious place (order numbers → orders), the menu offers the others. */
function GlobalSearch({ manager }: { manager: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const q = text.trim();
  const targets = [
    { label: t('Ordini'), path: '/orders' },
    ...(manager ? [{ label: t('Prodotti'), path: '/products' }, { label: t('Clienti'), path: '/customers' }] : [{ label: t('Magazzino'), path: '/inventory' }]),
  ];
  const go = (path: string) => { setOpen(false); setText(''); navigate(`${path}?q=${encodeURIComponent(q)}`); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q) return;
    go(/^ct\d/i.test(q) ? '/orders' : manager ? '/products' : '/inventory');
  };
  return <form className="top-search" role="search" ref={box} onSubmit={submit}>
    <Icon name="search" size={19} />
    <input value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      placeholder={manager ? t('Cerca ordini, prodotti, clienti…') : t('Cerca ordini, prodotti…')} aria-label={t('Cerca')} />
    {open && q && <div className="search-menu" role="listbox">
      {targets.map((item) => <button type="button" key={item.path} role="option" aria-selected={false} onClick={() => go(item.path)}>
        {t('Cerca')} «<strong>{q}</strong>» {t('in')} {item.label}</button>)}
    </div>}
  </form>;
}

/** Period and store for the overview, kept in the URL so the page can be shared and reloaded. */
function OverviewFilters({ manager }: { manager: boolean }) {
  const [params, setParams] = useSearchParams();
  const stores = useStores();
  const { from, to } = overviewRange(params);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  return <>
    <div className="date-range">
      <Icon name="calendar" size={18} />
      <input type="date" value={from} max={to} aria-label={t('Dal giorno')} onChange={(e) => e.target.value && set({ dal: e.target.value, al: to })} />
      <span aria-hidden="true">–</span>
      <input type="date" value={to} min={from} aria-label={t('Al giorno')} onChange={(e) => e.target.value && set({ dal: from, al: e.target.value })} />
    </div>
    {manager && <select className="top-select" value={params.get('negozio') ?? ''} onChange={(e) => set({ negozio: e.target.value })} aria-label={t('Negozio')}>
      <option value="">{t('Tutti i negozi')}</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
  </>;
}

function UserMenu() {
  const { staff, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const name = staff?.display_name || session?.user.email || '';
  return <div className="user-menu" ref={ref}>
    <button className="user-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
      <span className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <span className="user-text"><strong>{name}</strong><small>{staff ? t(ROLE_LABEL[staff.role]) : ''}</small></span>
      <Icon name="chevronDown" size={16} />
    </button>
    {open && <div className="user-pop" role="menu">
      <div className="small muted" style={{ padding: '6px 10px' }}>{session?.user.email}</div>
      <button role="menuitem" className="ghost" onClick={signOut}><Icon name="logout" size={16} /> {t('Esci')}</button>
    </div>}
  </div>;
}

export function Layout() {
  const { can } = useAuth();
  const manager = can('admin', 'manager');
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toPrepare, setToPrepare] = useState(0);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  // Bell: paid orders still waiting for someone to start preparing them (RLS limits store staff to their store).
  useEffect(() => {
    let live = true;
    const load = () => supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid')
      .then(({ count }) => { if (live) setToPrepare(count ?? 0); });
    void load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [pathname]);

  return <div className="shell">
    <a className="skip-link" href="#contenuto">{t('Vai al contenuto')}</a>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">CASA &amp; TE<small>GESTIONE ONLINE</small></div>
        <button className="ghost icon-btn menu-toggle" aria-expanded={menuOpen} aria-controls="nav-principale"
          onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? t('Chiudi menu') : t('Apri menu')}><Icon name={menuOpen ? 'close' : 'menu'} size={22} /></button>
      </div>
      <nav className="nav" id="nav-principale" aria-label={t('Navigazione principale')}>
        <Item to="/" end icon="home">{t('Panoramica')}</Item>
        <Item to="/orders" icon="clipboard" also={['/picking']}>{t('Gestione ordini')}</Item>
        {manager && <Item to="/products" icon="bag" also={['/import', '/reviews']}>{t('Gestione prodotti')}</Item>}
        <Item to="/inventory" icon="warehouse">{t('Gestione inventario')}</Item>
        {manager && <>
          <Item to="/categories" icon="products">{t('Gestione categorie')}</Item>
          <Item to="/coupons" icon="megaphone" also={['/loyalty']}>{t('Marketing')}</Item>
          <Item to="/customers" icon="customers">{t('Clienti')}</Item>
          <Item to="/analytics" icon="chart">{t('Analisi dati')}</Item>
        </>}
        <div className="group">{t('Impostazioni di sistema')}</div>
        {manager && <Item to={can('admin') ? '/stores' : '/shipping'} icon="stores" also={['/stores', '/shipping', '/pickup-points']}>{t('Negozi e spedizioni')}</Item>}
        {can('admin') && <Item to="/staff" icon="staff">{t('Gestione staff')}</Item>}
        <Item to="/settings" icon="settings">{t('Impostazioni')}</Item>
        {manager && <Item to="/activity" icon="history">{t('Registro attività')}</Item>}
      </nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <GlobalSearch manager={manager} />
        <div className="topbar-right">
          {pathname === '/' && <OverviewFilters manager={manager} />}
          <NavLink to="/picking" className="bell" aria-label={toPrepare ? t('{n} ordini da preparare', { n: toPrepare }) : t('Nessun ordine da preparare')}
            title={toPrepare ? t('{n} ordini da preparare', { n: toPrepare }) : t('Nessun ordine da preparare')}>
            <Icon name="bell" size={22} strokeWidth={1.6} />{toPrepare > 0 && <span className="bell-badge">{toPrepare > 99 ? '99+' : toPrepare}</span>}
          </NavLink>
          <UserMenu />
        </div>
      </header>
      <main className="main" id="contenuto" tabIndex={-1}><SectionTabs /><Outlet /></main>
    </div>
  </div>;
}
