import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { Field, Notice } from '../components/ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(t('Credenziali non valide.'));
  };

  const forgot = async () => {
    if (!email.trim()) { setError(t("Inserisci l'email.")); return; }
    setBusy(true); setError('');
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password` });
    setBusy(false);
    setInfo(t('Se l’indirizzo è registrato riceverai un link per impostare la password.'));
  };

  return <div className="login split"><aside className="login-art" aria-hidden="true">
    <div className="brand" style={{ padding: 0 }}>CASA &amp; TE<small>GESTIONE ONLINE</small></div>
    <div>
      <p className="login-quote">{t('Ordini, magazzino e catalogo dei negozi di Arezzo e Lucca, in un unico posto.')}</p>
      <ul className="login-points"><li>{t('Preparazione ordini per negozio')}</li><li>{t('Rimborsi con un clic tramite Stripe')}</li><li>{t('Scorte aggiornate in tempo reale')}</li></ul>
    </div>
    <span className="small" style={{ color: '#9fb697' }}>© {new Date().getFullYear()} CASA &amp; TE</span>
  </aside><form className="card" onSubmit={submit}>
    <div><h1 style={{ marginBottom: 4 }}>{t('Accedi')}</h1><p className="muted" style={{ margin: 0 }}>{t('Area riservata al personale.')}</p></div>
    <Field label={t('Email')}><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
    <Field label={t('Password')}><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
    {error && <Notice tone="error">{error}</Notice>}
    {info && <Notice>{info}</Notice>}
    <button disabled={busy} className="big" style={{ justifyContent: 'center' }}>{t('Accedi')}</button>
    <button type="button" className="ghost" onClick={forgot} disabled={busy}>{t('Password dimenticata / primo accesso')}</button>
  </form></div>;
}

/** Target of invite and password-reset emails (Supabase puts the recovery session in the URL). */
export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) { setError(t('La password deve avere almeno 10 caratteri.')); return; }
    if (password !== confirm) { setError(t('Le password non coincidono.')); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(t('Link scaduto o non valido. Richiedi un nuovo link dalla pagina di accesso.')); return; }
    navigate('/', { replace: true });
  };

  return <div className="login"><form className="card" onSubmit={submit}>
    <h1>{t('Imposta la password')}</h1>
    <Field label={t('Nuova password')} hint={t('Almeno 10 caratteri')}><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    <Field label={t('Conferma password')}><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
    {error && <Notice tone="error">{error}</Notice>}
    <button disabled={busy}>{t('Salva password')}</button>
  </form></div>;
}
