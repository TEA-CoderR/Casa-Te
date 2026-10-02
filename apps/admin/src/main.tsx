import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { getLocale, onLocaleChange, t } from './lib/i18n';
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
import { ReviewsPage } from './pages/Reviews';
import { ShippingPage } from './pages/Shipping';
import { PickupPointsPage } from './pages/PickupPoints';
import { CustomersPage } from './pages/Customers';
import { StoresPage } from './pages/Stores';
import { StaffPage } from './pages/Staff';
import { AnalyticsPage } from './pages/Analytics';
import { LoyaltyPage } from './pages/Loyalty';
import { SettingsPage } from './pages/Settings';
import { ActivityPage } from './pages/Activity';

function Guard({ roles, children }: { roles?: Array<'admin' | 'manager' | 'store_staff'>; children: ReactNode }) {
  const { can } = useAuth();
  if (roles && !can(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Root() {
  const { session, staff, loading } = useAuth();
  if (!isConfigured) return <div className="login"><div className="card"><h1>{t('Configurazione mancante')}</h1>
    <p className="muted">{t('Copia apps/admin/.env.example in apps/admin/.env con URL e chiave anon di Supabase.')}</p></div></div>;
  if (loading) return <div className="login"><Loading /></div>;
  if (!session) return <Routes><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="*" element={<LoginPage />} /></Routes>;
  // Setting a password must work before the account is enabled as staff: the first administrator
  // sets it from the email link and is granted the admin role afterwards (docs/DEPLOYMENT.md).
  if (!staff) return <Routes>
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="*" element={<div className="login"><div className="card"><h1>{t('Accesso non autorizzato')}</h1>
      <p className="muted">{t('Il tuo account non è abilitato alla gestione. Contatta un amministratore.')}</p>
      <ResetLogout /></div></div>} />
  </Routes>;
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
      <Route path="reviews" element={<Guard roles={M}><ReviewsPage /></Guard>} />
      <Route path="shipping" element={<Guard roles={M}><ShippingPage /></Guard>} />
      <Route path="pickup-points" element={<Guard roles={M}><PickupPointsPage /></Guard>} />
      <Route path="loyalty" element={<Guard roles={M}><LoyaltyPage /></Guard>} />
      <Route path="activity" element={<Guard roles={M}><ActivityPage /></Guard>} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="analytics" element={<Guard roles={M}><AnalyticsPage /></Guard>} />
      <Route path="customers" element={<Guard roles={M}><CustomersPage /></Guard>} />
      <Route path="stores" element={<Guard roles={['admin']}><StoresPage /></Guard>} />
      <Route path="staff" element={<Guard roles={['admin']}><StaffPage /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}

function ResetLogout() {
  const { signOut } = useAuth();
  return <button className="secondary" onClick={signOut}>{t('Esci')}</button>;
}

/** Re-renders the whole console in the new language (t() reads the current locale). */
function LocaleGate() {
  const [locale, setLocaleState] = useState(getLocale());
  useEffect(() => onLocaleChange(setLocaleState), []);
  return <Root key={locale} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthProvider><LocaleGate /></AuthProvider></BrowserRouter>
  </StrictMode>,
);
