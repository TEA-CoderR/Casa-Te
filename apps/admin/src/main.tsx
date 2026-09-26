import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage, ResetPasswordPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { OrdersPage } from './pages/Orders';
import { OrderDetailPage } from './pages/OrderDetail';
import { PickingPage } from './pages/Picking';
import { ProductsPage } from './pages/Products';
import { ProductEditPage } from './pages/ProductEdit';
import { ImportPage } from './pages/Import';
import { CategoriesPage } from './pages/Categories';
import { InventoryPage } from './pages/Inventory';
import { CouponsPage } from './pages/Coupons';
import { ShippingPage } from './pages/Shipping';
import { PickupPointsPage } from './pages/PickupPoints';
import { CustomersPage } from './pages/Customers';
import { StoresPage } from './pages/Stores';
import { StaffPage } from './pages/Staff';

function Guard({ roles, children }: { roles?: Array<'admin' | 'manager' | 'store_staff'>; children: ReactNode }) {
  const { can } = useAuth();
  if (roles && !can(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Root() {
  const { session, staff, loading } = useAuth();
  if (!isConfigured) return <div className="login"><div className="card"><h1>Configurazione mancante</h1>
    <p className="muted">Copia apps/admin/.env.example in apps/admin/.env con URL e chiave anon di Supabase.</p></div></div>;
  if (loading) return <div className="login"><Loading /></div>;
  if (!session) return <Routes><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="*" element={<LoginPage />} /></Routes>;
  if (!staff) return <div className="login"><div className="card"><h1>Accesso non autorizzato</h1>
    <p className="muted">Il tuo account non è abilitato alla gestione. Contatta un amministratore.</p>
    <ResetLogout /></div></div>;
  const M = ['admin', 'manager'] as Array<'admin' | 'manager'>;
  return <Routes>
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<Layout />}>
      <Route index element={<DashboardPage />} />
      <Route path="picking" element={<PickingPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="orders/:id" element={<OrderDetailPage />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="products" element={<Guard roles={M}><ProductsPage /></Guard>} />
      <Route path="products/:id" element={<Guard roles={M}><ProductEditPage /></Guard>} />
      <Route path="import" element={<Guard roles={M}><ImportPage /></Guard>} />
      <Route path="categories" element={<Guard roles={M}><CategoriesPage /></Guard>} />
      <Route path="coupons" element={<Guard roles={M}><CouponsPage /></Guard>} />
      <Route path="shipping" element={<Guard roles={M}><ShippingPage /></Guard>} />
      <Route path="pickup-points" element={<Guard roles={M}><PickupPointsPage /></Guard>} />
      <Route path="customers" element={<Guard roles={M}><CustomersPage /></Guard>} />
      <Route path="stores" element={<Guard roles={['admin']}><StoresPage /></Guard>} />
      <Route path="staff" element={<Guard roles={['admin']}><StaffPage /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}

function ResetLogout() {
  const { signOut } = useAuth();
  return <button className="secondary" onClick={signOut}>Esci</button>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><AuthProvider><Root /></AuthProvider></BrowserRouter>
  </StrictMode>,
);
