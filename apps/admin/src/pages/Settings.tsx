import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AppSettingsRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync } from '../lib/data';
import { useAuth } from '../lib/auth';
import { LOCALES, dateLocale, getLocale, setLocale, t, type Locale } from '../lib/i18n';
import { Field, Loading, Notice, PageHead, Success } from '../components/ui';
import { Icon } from '../components/Icon';

const ROLE_LABEL = { admin: 'Amministratore', manager: 'Responsabile', store_staff: 'Personale negozio' } as const;

function LanguageCard() {
  const { staff } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = getLocale();
  const choose = async (locale: Locale) => {
    if (locale === current) return;
    setBusy(true); setError('');
    // Saved on the account so the console opens in this language on every device.
    if (staff) {
      const { error: err } = await supabase.rpc('set_my_locale', { p_locale: locale });
      if (err) { setBusy(false); setError(errorText(err)); return; }
    }
    setLocale(locale);
  };
  return <section className="panel">
    <div className="panel-head"><h2>{t('Lingua dell’interfaccia')}</h2></div>
    <p className="small muted" style={{ marginTop: 0 }}>{t('Vale solo per te: ogni membro del personale sceglie la propria lingua. Il negozio online resta in italiano.')}</p>
    <div className="lang-grid" role="radiogroup" aria-label={t('Lingua dell’interfaccia')}>
      {LOCALES.map((l) => <button key={l.id} role="radio" aria-checked={current === l.id} disabled={busy}
        className={`lang-option ${current === l.id ? 'on' : ''}`} onClick={() => choose(l.id)} lang={l.id}>
        <span className="lang-code">{l.id.toUpperCase()}</span><span>{l.label}</span>
        {current === l.id && <Icon name="check" size={18} />}
      </button>)}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
  </section>;
}

function AccountCard() {
  const { staff, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setDone('');
    if (password.length < 10) { setError(t('La password deve avere almeno 10 caratteri.')); return; }
    if (password !== confirm) { setError(t('Le password non coincidono.')); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(errorText(err)); return; }
    setPassword(''); setConfirm('');
    setDone(t('Password aggiornata.'));
  };
  return <section className="panel">
    <div className="panel-head"><h2>{t('Il mio account')}</h2></div>
    <dl className="facts">
      <dt>{t('Nome')}</dt><dd>{staff?.display_name || '—'}</dd>
      <dt>{t('Email')}</dt><dd>{session?.user.email}</dd>
      <dt>{t('Ruolo')}</dt><dd>{staff ? t(ROLE_LABEL[staff.role]) : '—'}</dd>
    </dl>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      <h3 className="sub-title">{t('Cambia password')}</h3>
      <div className="form-grid">
        <Field label={t('Nuova password')} hint={t('Almeno 10 caratteri')}><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label={t('Conferma password')}><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
      <div><button disabled={busy || !password}>{t('Salva password')}</button></div>
    </form>
  </section>;
}

function ShopSettingsCard() {
  const settings = useAsync(async () => unwrap(await supabase.from('app_settings').select('*').single()) as AppSettingsRow, []);
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { if (settings.data) setThreshold(String(settings.data.low_stock_threshold)); }, [settings.data]);
  const value = Number(threshold);
  const valid = /^\d+$/.test(threshold) && value <= 1000;
  const save = async () => {
    setError(''); setDone('');
    if (!valid) { setError(t('Inserisci un numero intero tra 0 e 1000.')); return; }
    const { error: err } = await supabase.from('app_settings').update({ low_stock_threshold: value }).eq('id', true);
    if (err) { setError(errorText(err)); return; }
    setDone(t('Soglia salvata.'));
    void settings.reload();
  };
  return <section className="panel">
    <div className="panel-head"><h2>{t('Magazzino')}</h2></div>
    {!settings.data ? <Loading /> : <>
      <Field label={t('Soglia scorte basse (pezzi)')}
        hint={t('Un prodotto è «sotto scorta» quando in un negozio ne restano al massimo questi pezzi. Usata in Panoramica (Avviso scorte) e in Gestione inventario (Solo scorte basse).')}>
        <input type="number" min={0} max={1000} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ maxWidth: 140 }} />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save} disabled={!valid || value === settings.data.low_stock_threshold}>{t('Salva')}</button>
        <span className="small muted">{t('Ultima modifica: {date}', { date: new Date(settings.data.updated_at).toLocaleString(dateLocale()) })}</span>
      </div>
    </>}
  </section>;
}

/** Minimum order on the goods (after member prices and coupon, before shipping), checked by create_order. */
function MinOrderCard() {
  const settings = useAsync(async () => unwrap(await supabase.from('app_settings').select('*').single()) as AppSettingsRow, []);
  const [euro, setEuro] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { if (settings.data) setEuro(String((settings.data.min_order_cents ?? 0) / 100).replace('.', ',')); }, [settings.data]);
  const cents = Math.round(Number(euro.replace(',', '.')) * 100);
  const valid = /^\d+([.,]\d{1,2})?$/.test(euro.trim()) && cents <= 100000;
  const save = async () => {
    setError(''); setDone('');
    if (!valid) { setError(t('Inserisci un importo tra 0 e 1000 €.')); return; }
    const { error: err } = await supabase.from('app_settings').update({ min_order_cents: cents }).eq('id', true);
    if (err) { setError(errorText(err)); return; }
    setDone(t('Ordine minimo salvato.'));
    void settings.reload();
  };
  return <section className="panel">
    <div className="panel-head"><h2>{t('Ordine minimo')}</h2></div>
    {!settings.data ? <Loading /> : <>
      <Field label={t('Importo minimo dei prodotti (€)')} hint={t('Calcolato sui prodotti dopo Prezzi Soci e codici sconto, spedizione esclusa. 0 = nessun minimo.')}>
        <input inputMode="decimal" value={euro} onChange={(e) => setEuro(e.target.value)} style={{ maxWidth: 140 }} />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save} disabled={!valid || cents === settings.data.min_order_cents}>{t('Salva')}</button>
      </div>
    </>}
  </section>;
}

/** Forced update and maintenance (plan v3 L5): read by the phone app at start and when it comes back to the front. */
function AppGateCard() {
  const settings = useAsync(async () => unwrap(await supabase.from('app_settings').select('*').single()) as AppSettingsRow, []);
  const [version, setVersion] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { if (settings.data) { setVersion(settings.data.min_app_version ?? ''); setMessage(settings.data.maintenance_message ?? ''); } }, [settings.data]);
  const versionOk = version.trim() === '' || /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version.trim());
  const changed = !!settings.data && ((settings.data.min_app_version ?? '') !== version.trim() || (settings.data.maintenance_message ?? '') !== message.trim());
  const save = async () => {
    setError(''); setDone('');
    if (!versionOk) { setError(t('Scrivi la versione come 1.3.0, oppure lascia vuoto.')); return; }
    const { error: err } = await supabase.from('app_settings')
      .update({ min_app_version: version.trim() || null, maintenance_message: message.trim() || null }).eq('id', true);
    if (err) { setError(errorText(err)); return; }
    setDone(t('Impostazioni dell’app salvate.'));
    void settings.reload();
  };
  return <section className="panel">
    <div className="panel-head"><h2>{t('App: aggiornamento e manutenzione')}</h2></div>
    {!settings.data ? <Loading /> : <>
      <Field label={t('Versione minima dell’app')} hint={t('Le app più vecchie chiedono di aggiornare prima di continuare. Vuoto = tutte le versioni.')}>
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.3.0" style={{ maxWidth: 140 }} />
      </Field>
      <Field label={t('Messaggio di manutenzione')} hint={t('Se scritto, app e sito mostrano solo questo messaggio e non si possono fare ordini. Vuoto = negozio aperto.')}>
        <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      {message.trim() && <Notice tone="error">{t('Attenzione: salvando, il negozio online si chiude finché non svuoti il messaggio.')}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Success onDismiss={() => setDone('')}>{done}</Success>}
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={save} disabled={!changed}>{t('Salva')}</button>
      </div>
    </>}
  </section>;
}

export function SettingsPage() {
  const { can } = useAuth();
  const manager = can('admin', 'manager');
  return <>
    <PageHead title={t('Impostazioni')} subtitle={t('Preferenze personali e impostazioni del negozio.')} />
    <div className="grid two" style={{ alignItems: 'start' }}>
      <LanguageCard />
      <AccountCard />
      {manager && <ShopSettingsCard />}
      {manager && <MinOrderCard />}
      {manager && <AppGateCard />}
      {manager && <section className="panel">
        <div className="panel-head"><h2>{t('Altre impostazioni')}</h2></div>
        <ul className="settings-links">
          <li><Link to="/loyalty"><Icon name="crown" size={18} /> {t('Programma fedeltà')}<small className="muted">{t('Iscrizioni e descrizione del Club')}</small></Link></li>
          <li><Link to="/shipping"><Icon name="truck" size={18} /> {t('Tariffe spedizione')}<small className="muted">{t('Prezzi per peso e importo')}</small></Link></li>
          <li><Link to="/pickup-points"><Icon name="pickup" size={18} /> {t('Punti di ritiro')}<small className="muted">{t('Punti convenzionati per il ritiro')}</small></Link></li>
          {can('admin') && <li><Link to="/stores"><Icon name="stores" size={18} /> {t('Gestione negozi')}<small className="muted">{t('Indirizzi, orari e ritiro in negozio')}</small></Link></li>}
          {can('admin') && <li><Link to="/staff"><Icon name="staff" size={18} /> {t('Gestione staff')}<small className="muted">{t('Inviti e ruoli del personale')}</small></Link></li>}
        </ul>
      </section>}
    </div>
  </>;
}
