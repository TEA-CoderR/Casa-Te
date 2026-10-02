import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useStores } from '../lib/data';
import { overviewRange } from '../lib/overview';
import { Icon, type AdminIcon } from './Icon';

const ROLE_LABEL = { admin: 'Amministratore', manager: 'Responsabile', store_staff: 'Personale negozio' } as const;

/** The customer shop: VITE_SHOP_URL, else the site the admin is published under (…/admin/ → …/). */
const BASE = import.meta.env.BASE_URL;
const SHOP_URL: string = import.meta.env.VITE_SHOP_URL || (BASE.endsWith('/admin/') ? BASE.slice(0, -'admin/'.length) : '');

function Item({ to, icon, children, end }: { to: string; icon: AdminIcon; children: string; end?: boolean }) {
  return <NavLink to={to} end={end}><Icon name={icon} size={20} strokeWidth={1.6} /><span>{children}</span></NavLink>;
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
    { label: 'Ordini', path: '/orders' },
    ...(manager ? [{ label: 'Prodotti', path: '/products' }, { label: 'Clienti', path: '/customers' }] : [{ label: 'Magazzino', path: '/inventory' }]),
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
      placeholder={manager ? 'Cerca ordini, prodotti, clienti…' : 'Cerca ordini, prodotti…'} aria-label="Cerca" />
    {open && q && <div className="search-menu" role="listbox">
      {targets.map((t) => <button type="button" key={t.path} role="option" aria-selected={false} onClick={() => go(t.path)}>
        Cerca «<strong>{q}</strong>» in {t.label}</button>)}
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
      <input type="date" value={from} max={to} aria-label="Dal giorno" onChange={(e) => e.target.value && set({ dal: e.target.value, al: to })} />
      <span aria-hidden="true">–</span>
      <input type="date" value={to} min={from} aria-label="Al giorno" onChange={(e) => e.target.value && set({ dal: from, al: e.target.value })} />
    </div>
    {manager && <select className="top-select" value={params.get('negozio') ?? ''} onChange={(e) => set({ negozio: e.target.value })} aria-label="Negozio">
      <option value="">Tutti i negozi</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
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
      <span className="user-text"><strong>{name}</strong><small>{staff ? ROLE_LABEL[staff.role] : ''}</small></span>
      <Icon name="chevronDown" size={16} />
    </button>
    {open && <div className="user-pop" role="menu">
      <div className="small muted" style={{ padding: '6px 10px' }}>{session?.user.email}</div>
      <button role="menuitem" className="ghost" onClick={signOut}><Icon name="logout" size={16} /> Esci</button>
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
    <a className="skip-link" href="#contenuto">Vai al contenuto</a>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">CASA &amp; TE<small>GESTIONE ONLINE</small></div>
        <button className="ghost icon-btn menu-toggle" aria-expanded={menuOpen} aria-controls="nav-principale"
          onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}><Icon name={menuOpen ? 'close' : 'menu'} size={22} /></button>
      </div>
      <nav className="nav" id="nav-principale" aria-label="Navigazione principale">
        <Item to="/" end icon="home">Panoramica</Item>
        <Item to="/orders" icon="clipboard">Gestione ordini</Item>
        <Item to="/picking" icon="picking">Preparazione ordini</Item>
        {manager && <Item to="/products" icon="bag">Gestione prodotti</Item>}
        <Item to="/inventory" icon="warehouse">Gestione inventario</Item>
        {manager && <>
          <Item to="/categories" icon="products">Gestione categorie</Item>
          <Item to="/coupons" icon="megaphone">Marketing</Item>
          <Item to="/customers" icon="customers">Clienti</Item>
          <Item to="/analytics" icon="chart">Analisi dati</Item>
        </>}
        {manager && <>
          <div className="group">Canali di vendita</div>
          {SHOP_URL && <a href={SHOP_URL} target="_blank" rel="noreferrer"><Icon name="monitor" size={20} strokeWidth={1.6} /><span>Negozio online</span>
            <span className="sr-only">(si apre in una nuova scheda)</span></a>}
          {can('admin') && <Item to="/stores" icon="stores">Gestione negozi</Item>}
          <Item to="/reviews" icon="reviews">Recensioni</Item>
          <Item to="/shipping" icon="truck">Tariffe spedizione</Item>
          <Item to="/pickup-points" icon="pickup">Punti di ritiro</Item>
          <div className="group">Impostazioni di sistema</div>
          <Item to="/import" icon="import">Importa prodotti</Item>
          {can('admin') && <Item to="/staff" icon="staff">Gestione staff</Item>}
        </>}
      </nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <GlobalSearch manager={manager} />
        <div className="topbar-right">
          {pathname === '/' && <OverviewFilters manager={manager} />}
          <NavLink to="/picking" className="bell" aria-label={toPrepare ? `${toPrepare} ordini da preparare` : 'Nessun ordine da preparare'}
            title={toPrepare ? `${toPrepare} ordini da preparare` : 'Nessun ordine da preparare'}>
            <Icon name="bell" size={22} strokeWidth={1.6} />{toPrepare > 0 && <span className="bell-badge">{toPrepare > 99 ? '99+' : toPrepare}</span>}
          </NavLink>
          <UserMenu />
        </div>
      </header>
      <main className="main" id="contenuto" tabIndex={-1}><Outlet /></main>
    </div>
  </div>;
}
