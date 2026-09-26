import { useState } from 'react';
import type { StaffMemberRow, StaffRole } from '@casa-te/shared';
import { invoke, supabase, unwrap } from '../lib/supabase';
import { errorText, useAsync, useStores } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Field, Loading, Modal, Notice, PageHead, fmtDate } from '../components/ui';

const ROLES: Record<StaffRole, string> = {
  admin: 'Amministratore — tutto, inclusi negozi e personale',
  manager: 'Responsabile — catalogo, prezzi, promozioni, rimborsi, tutti i negozi',
  store_staff: 'Personale negozio — ordini e magazzino del proprio negozio',
};

export function StaffPage() {
  const { session } = useAuth();
  const stores = useStores();
  const staff = useAsync(async () => unwrap(await supabase.from('staff_members').select('*').order('created_at')) as StaffMemberRow[], []);
  const [edit, setEdit] = useState<{ email: string; role: StaffRole; store_id: string; display_name: string; active: boolean; existing: boolean } | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await invoke<{ invited: boolean }>('admin-staff', { email: edit.email, role: edit.role, store_id: edit.store_id || null,
        display_name: edit.display_name, active: edit.active });
      setInfo(res.invited ? `Invito inviato a ${edit.email}: riceverà un link per impostare la password.` : 'Permessi aggiornati.');
      setEdit(null); await staff.reload();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return <>
    <PageHead title="Personale" subtitle="Accessi alla gestione online"
      actions={<button onClick={() => setEdit({ email: '', role: 'store_staff', store_id: '', display_name: '', active: true, existing: false })}>+ Invita persona</button>} />
    {error && !edit && <Notice tone="error">{error}</Notice>}
    {info && <Notice>{info}</Notice>}
    {!staff.data ? <Loading /> : <div className="table-wrap"><table>
      <thead><tr><th>Persona</th><th>Ruolo</th><th>Negozio</th><th>Stato</th><th>Dal</th><th></th></tr></thead>
      <tbody>{staff.data.map((s) => <tr key={s.user_id}><td><strong>{s.display_name ?? s.email}</strong><div className="small muted">{s.email}</div></td>
        <td>{ROLES[s.role].split(' — ')[0]}</td><td>{stores.data?.find((st) => st.id === s.store_id)?.name ?? 'Tutti'}</td>
        <td>{s.active ? <span className="badge">Attivo</span> : <span className="badge muted">Disattivato</span>}</td><td>{fmtDate(s.created_at)}</td>
        <td className="num">{s.user_id !== session?.user.id && s.email && <button className="ghost" onClick={() => setEdit({ email: s.email!, role: s.role, store_id: s.store_id ?? '',
          display_name: s.display_name ?? '', active: s.active, existing: true })}>Modifica</button>}</td></tr>)}</tbody></table></div>}
    {edit && <Modal title={edit.existing ? 'Modifica accesso' : 'Invita persona'} onClose={() => setEdit(null)}>
      <div className="grid">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email"><input type="email" value={edit.email} disabled={edit.existing} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
        <Field label="Nome visualizzato"><input value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} /></Field>
        <Field label="Ruolo"><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as StaffRole })}>
          {(Object.keys(ROLES) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></Field>
        {edit.role === 'store_staff' && <Field label="Negozio"><select value={edit.store_id} onChange={(e) => setEdit({ ...edit, store_id: e.target.value })}>
          <option value="">— seleziona —</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {edit.existing && <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Accesso attivo</label>}
        <button disabled={busy || !edit.email || (edit.role === 'store_staff' && !edit.store_id)} onClick={save}>{edit.existing ? 'Salva' : 'Invia invito'}</button>
      </div>
    </Modal>}
  </>;
}
