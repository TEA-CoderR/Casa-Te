import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatEuro, type AppSettingsRow, type CouponRow, type ProfileRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useDebounced } from '../lib/data';
import { downloadCsv, toCsv } from '../lib/csv';
import { dateLocale, t } from '../lib/i18n';
import { Empty, Loading, Notice, PageHead, Pager, Success } from '../components/ui';
import { Icon } from '../components/Icon';

const PAGE = 50;
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const offerValue = (c: CouponRow) => c.kind === 'percent' ? t('{n}% di sconto', { n: c.value })
  : c.kind === 'fixed' ? t('{amount} di sconto', { amount: formatEuro(c.value) }) : t('Spedizione gratuita');

export function LoyaltyPage() {
  const [view, setView] = useState<'members' | 'all'>('members');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const stats = useAsync(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [members, recent, customers, offers] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('club_member_since', 'is', null),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('club_member_since', since),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('coupons').select('*').eq('club_only', true).order('active', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    return { members: members.count ?? 0, recent: recent.count ?? 0, customers: customers.count ?? 0, offers: unwrap(offers) as CouponRow[] };
  }, []);

  const list = useAsync(async () => {
    let query = supabase.from('profiles').select('*', { count: 'exact' });
    if (view === 'members') query = query.not('club_member_since', 'is', null);
    if (q) { const s = q.replace(/[%,()]/g, ' '); query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`); }
    const res = await query.order(view === 'members' ? 'club_member_since' : 'created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    return { rows: unwrap(res) as ProfileRow[], count: res.count ?? 0 };
  }, [view, q, page]);

  // Club settings live in app_settings (shared with Impostazioni).
  const settings = useAsync(async () => unwrap(await supabase.from('app_settings').select('*').single()) as AppSettingsRow, []);
  const [enabled, setEnabled] = useState(true);
  const [tagline, setTagline] = useState('');
  useEffect(() => { if (settings.data) { setEnabled(settings.data.club_enabled); setTagline(settings.data.club_tagline); } }, [settings.data]);
  const dirty = !!settings.data && (enabled !== settings.data.club_enabled || tagline.trim() !== settings.data.club_tagline);

  const saveSettings = async () => {
    setError(''); setSaved('');
    if (!tagline.trim()) { setError(t('Scrivi una breve descrizione del Club.')); return; }
    const { error: err } = await supabase.from('app_settings').update({ club_enabled: enabled, club_tagline: tagline.trim() }).eq('id', true);
    if (err) { setError(errorText(err)); return; }
    setSaved(t('Impostazioni del Club salvate.'));
    void settings.reload();
  };

  const setMember = async (p: ProfileRow, member: boolean) => {
    setError(''); setSaved(''); setConfirm(null);
    const { error: err } = await supabase.rpc('admin_set_club_membership', { p_user: p.id, p_member: member });
    if (err) { setError(errorText(err)); return; }
    setSaved(member ? t('{name} è ora membro del Club.', { name: p.full_name || p.email || '' }) : t('{name} non è più membro del Club.', { name: p.full_name || p.email || '' }));
    void list.reload(); void stats.reload();
  };

  const exportMembers = async () => {
    const rows = unwrap(await supabase.from('profiles').select('*').not('club_member_since', 'is', null).order('club_member_since').limit(50000)) as ProfileRow[];
    downloadCsv(`membri-club-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((r) => ({
      email: r.email, nome: r.full_name, telefono: r.phone, membro_dal: r.club_member_since, marketing: r.marketing_opt_in ? 'si' : 'no',
    })), ['email', 'nome', 'telefono', 'membro_dal', 'marketing']));
  };

  const s = stats.data;
  const activeOffers = s?.offers.filter((c) => c.active && (!c.ends_at || new Date(c.ends_at) > new Date())) ?? [];

  return <>
    <PageHead title={t('Programma fedeltà')} subtitle={t('CASA & TE Club: iscrizione gratuita, offerte riservate ai membri.')}
      actions={<button className="secondary" onClick={exportMembers}><Icon name="import" size={16} /> {t('Esporta membri (CSV)')}</button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <Success onDismiss={() => setSaved('')}>{saved}</Success>}

    <div className="kpi-row">
      <div className="kpi2 green"><span className="kpi2-icon"><Icon name="crown" size={24} strokeWidth={1.6} /></span>
        <div className="kpi2-body"><div className="kpi2-label">{t('Membri del Club')}</div><div className="kpi2-value">{s ? s.members : '…'}</div>
          <span className="delta muted">{s && s.customers ? t('{p}% dei clienti registrati', { p: Math.round((s.members / s.customers) * 100) }) : ' '}</span></div></div>
      <div className="kpi2 orange"><span className="kpi2-icon"><Icon name="userPlus" size={24} strokeWidth={1.6} /></span>
        <div className="kpi2-body"><div className="kpi2-label">{t('Nuovi membri (30 giorni)')}</div><div className="kpi2-value">{s ? s.recent : '…'}</div></div></div>
      <div className="kpi2 pink"><span className="kpi2-icon"><Icon name="coupons" size={24} strokeWidth={1.6} /></span>
        <div className="kpi2-body"><div className="kpi2-label">{t('Offerte Club attive')}</div><div className="kpi2-value">{s ? activeOffers.length : '…'}</div></div></div>
      <div className="kpi2 sage"><span className="kpi2-icon"><Icon name="receipt" size={24} strokeWidth={1.6} /></span>
        <div className="kpi2-body"><div className="kpi2-label">{t('Utilizzi dei codici Club')}</div>
          <div className="kpi2-value">{s ? s.offers.reduce((n, c) => n + c.redemptions, 0) : '…'}</div></div></div>
    </div>

    <div className="grid two" style={{ marginBottom: 16, alignItems: 'start' }}>
      <section className="panel">
        <div className="panel-head"><h2>{t('Impostazioni del Club')}</h2></div>
        {!settings.data ? <Loading /> : <div style={{ display: 'grid', gap: 14 }}>
          <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('Iscrizioni aperte nel negozio online')}</label>
          <p className="small muted" style={{ margin: 0 }}>{t('Se chiudi le iscrizioni, il Club sparisce dal negozio per chi non è membro. I membri attuali restano iscritti e possono uscire quando vogliono.')}</p>
          <label className="field">{t('Descrizione mostrata ai clienti')}
            <textarea value={tagline} maxLength={200} onChange={(e) => setTagline(e.target.value)} style={{ minHeight: 70 }} />
            <span className="small muted">{t('{n}/200 caratteri', { n: tagline.length })}</span></label>
          <div className="row"><button onClick={saveSettings} disabled={!dirty}>{t('Salva')}</button></div>
        </div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>{t('Offerte riservate ai membri')}</h2>
          <Link to="/coupons" className="panel-link small-link">{t('Gestisci in Marketing')} <Icon name="arrow" size={15} /></Link></div>
        {!s ? <Loading /> : !s.offers.length ? <Empty>{t('Nessun codice riservato al Club. Creane uno in Marketing e spunta l’opzione per i membri del Club.')}</Empty>
          : <ul className="offer-list">{s.offers.map((c) => {
            const live = c.active && (!c.ends_at || new Date(c.ends_at) > new Date());
            return <li key={c.id}>
              <code>{c.code}</code>
              <span className="top5-text"><strong>{c.description || offerValue(c)}</strong>
                <small className="muted">{offerValue(c)}{c.min_subtotal_cents ? ` · ${t('minimo {amount}', { amount: formatEuro(c.min_subtotal_cents) })}` : ''}{c.ends_at ? ` · ${t('fino al {date}', { date: fmtDay(c.ends_at) })}` : ''}</small></span>
              <span className="small muted">{t('{n} utilizzi', { n: c.redemptions })}</span>
              <span className={`badge ${live ? '' : 'muted'}`}>{live ? t('Attiva') : t('Non attiva')}</span>
            </li>;
          })}</ul>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-head"><h2>{view === 'members' ? t('Membri') : t('Tutti i clienti')}</h2>
        <div className="row">
          <div className="segmented" role="group" aria-label={t('Elenco')}>
            <button className={view === 'members' ? 'on' : ''} aria-pressed={view === 'members'} onClick={() => { setView('members'); setPage(0); }}>{t('Membri')}</button>
            <button className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => { setView('all'); setPage(0); }}>{t('Tutti i clienti')}</button>
          </div>
          <input placeholder={t('Email, nome, telefono')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label={t('Cerca')} style={{ minWidth: 240 }} />
        </div>
      </div>
      {list.error && <Notice tone="error">{list.error}</Notice>}
      {!list.data ? <Loading /> : !list.data.rows.length ? <Empty>{view === 'members' ? t('Nessun membro trovato.') : t('Nessun cliente trovato.')}</Empty>
        : <div className="table-scroll"><table className="recent-table">
          <thead><tr><th>{t('Cliente')}</th><th>{t('Telefono')}</th><th>{t('Membro dal')}</th><th>{t('Marketing')}</th><th><span className="sr-only">{t('Azioni')}</span></th></tr></thead>
          <tbody>{list.data.rows.map((p) => <tr key={p.id}>
            <td><strong>{p.full_name || '—'}</strong><div className="small muted">{p.email}</div></td>
            <td>{p.phone || '—'}</td>
            <td>{p.club_member_since ? <span className="status-pill"><Icon name="crown" size={14} />{fmtDay(p.club_member_since)}</span> : <span className="muted">{t('Non iscritto')}</span>}</td>
            <td>{p.marketing_opt_in ? t('Sì') : t('No')}</td>
            <td className="num">{p.club_member_since
              ? confirm === p.id
                ? <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="danger-outline" onClick={() => setMember(p, false)}>{t('Conferma rimozione')}</button>
                    <button className="ghost" onClick={() => setConfirm(null)}>{t('Annulla')}</button></span>
                : <button className="ghost danger" onClick={() => setConfirm(p.id)}>{t('Rimuovi dal Club')}</button>
              : <button className="secondary" onClick={() => setMember(p, true)}>{t('Aggiungi al Club')}</button>}</td>
          </tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} hasMore={(page + 1) * PAGE < list.data.count} onPage={setPage} />}
    </section>
  </>;
}
