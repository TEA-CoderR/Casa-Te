import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon, type AdminIcon } from './Icon';

const ROLE_LABEL = { admin: 'Amministratore', manager: 'Responsabile', store_staff: 'Personale negozio' } as const;

function Item({ to, icon, children, end }: { to: string; icon: AdminIcon; children: string; end?: boolean }) {
  return <NavLink to={to} end={end}><Icon name={icon} /><span>{children}</span></NavLink>;
}

export function Layout() {
  const { staff, session, signOut, can } = useAuth();
  const manager = can('admin', 'manager');
  const name = staff?.display_name || session?.user.email || '';
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  return <div className="shell">
    <a className="skip-link" href="#contenuto">Vai al contenuto</a>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">CASA &amp; TE<small>GESTIONE ONLINE</small></div>
        <button className="ghost icon-btn menu-toggle" aria-expanded={menuOpen} aria-controls="nav-principale"
          onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}><Icon name={menuOpen ? 'close' : 'menu'} size={22} /></button>
      </div>
      <nav className="nav" id="nav-principale" aria-label="Navigazione principale">
        <div className="group">Operativo</div>
        <Item to="/" end icon="dashboard">Panoramica</Item>
        <Item to="/picking" icon="picking">Preparazione ordini</Item>
        <Item to="/orders" icon="orders">Ordini</Item>
        <Item to="/inventory" icon="inventory">Magazzino</Item>
        {manager && <>
          <div className="group">Catalogo</div>
          <Item to="/products" icon="products">Prodotti</Item>
          <Item to="/import" icon="import">Importa CSV</Item>
          <Item to="/categories" icon="categories">Categorie</Item>
          <div className="group">Vendite</div>
          <Item to="/coupons" icon="coupons">Codici sconto</Item>
          <Item to="/shipping" icon="shipping">Tariffe spedizione</Item>
          <Item to="/pickup-points" icon="pickup">Punti di ritiro</Item>
          <Item to="/customers" icon="customers">Clienti</Item>
        </>}
        {can('admin') && <>
          <div className="group">Amministrazione</div>
          <Item to="/stores" icon="stores">Negozi</Item>
          <Item to="/staff" icon="staff">Personale</Item>
        </>}
      </nav>
      <div className="who">
        <div className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="who-name">{name}</div>
          <div className="who-role">{staff ? ROLE_LABEL[staff.role] : ''}</div>
        </div>
        <button className="ghost icon-btn" onClick={signOut} title="Esci" aria-label="Esci"><Icon name="logout" /></button>
      </div>
    </aside>
    <main className="main" id="contenuto" tabIndex={-1}><Outlet /></main>
  </div>;
}
