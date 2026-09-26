import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ROLE_LABEL = { admin: 'Amministratore', manager: 'Responsabile', store_staff: 'Personale negozio' } as const;

export function Layout() {
  const { staff, session, signOut, can } = useAuth();
  const manager = can('admin', 'manager');
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">CASA &amp; TE<small>GESTIONE ONLINE</small></div>
      <nav className="nav" aria-label="Navigazione principale">
        <div className="group">Operativo</div>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/picking">Preparazione ordini</NavLink>
        <NavLink to="/orders">Ordini</NavLink>
        <NavLink to="/inventory">Magazzino</NavLink>
        {manager && <>
          <div className="group">Catalogo</div>
          <NavLink to="/products">Prodotti</NavLink>
          <NavLink to="/import">Importa CSV</NavLink>
          <NavLink to="/categories">Categorie</NavLink>
          <div className="group">Vendite</div>
          <NavLink to="/coupons">Codici sconto</NavLink>
          <NavLink to="/shipping">Tariffe spedizione</NavLink>
          <NavLink to="/pickup-points">Punti di ritiro</NavLink>
          <NavLink to="/customers">Clienti</NavLink>
        </>}
        {can('admin') && <>
          <div className="group">Amministrazione</div>
          <NavLink to="/stores">Negozi</NavLink>
          <NavLink to="/staff">Personale</NavLink>
        </>}
      </nav>
      <div className="who">
        <div><strong>{staff?.display_name || session?.user.email}</strong></div>
        <div className="muted">{staff ? ROLE_LABEL[staff.role] : ''}</div>
        <button className="ghost" style={{ paddingLeft: 0 }} onClick={signOut}>Esci</button>
      </div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>;
}
