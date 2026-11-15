import { useEffect, useState } from 'react';
import type { StoreClosureRow, StoreOpeningHoursRow, StoreRow } from '@casa-te/shared';
import { supabase, unwrap } from '../lib/supabase';
import { errorText } from '../lib/data';
import { t } from '../lib/i18n';
import { Field, Loading, Modal, Notice } from '../components/ui';

const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
type Shift = { opens: string; closes: string };
const hhmm = (v: string) => v.slice(0, 5);

/**
 * Pickup times of a store: the customer chooses a one-hour slot inside these hours, from `pickup_lead_minutes`
 * after now, over today and the next two days (pickup_slots). Up to two shifts a day (lunch break); closed days.
 */
export function StoreHoursModal({ store, onClose, onSaved }: { store: StoreRow; onClose: () => void; onSaved: () => void }) {
  const [week, setWeek] = useState<Shift[][] | null>(null);
  const [lead, setLead] = useState(String(store.pickup_lead_minutes ?? 120));
  const [closures, setClosures] = useState<StoreClosureRow[]>([]);
  const [newDay, setNewDay] = useState('');
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const rows = unwrap(await supabase.from('store_opening_hours').select('*').eq('store_id', store.id).order('opens')) as StoreOpeningHoursRow[];
        setWeek(DAYS.map((_, i) => rows.filter((r) => r.weekday === i + 1).map((r) => ({ opens: hhmm(r.opens), closes: hhmm(r.closes) }))));
        const today = new Date().toISOString().slice(0, 10);
        setClosures(unwrap(await supabase.from('store_closures').select('*').eq('store_id', store.id).gte('day', today).order('day')) as StoreClosureRow[]);
      } catch (e) { setError(errorText(e)); }
    })();
  }, [store.id]);

  const setShift = (d: number, i: number, key: keyof Shift, v: string) =>
    setWeek((w) => w!.map((shifts, k) => k !== d ? shifts : shifts.map((s, j) => j === i ? { ...s, [key]: v } : s)));
  const copyMonday = () => setWeek((w) => w!.map(() => w![0].map((s) => ({ ...s }))));

  const save = async () => {
    if (!week) return;
    setError('');
    const rows = week.flatMap((shifts, d) => shifts.filter((s) => s.opens && s.closes).map((s) => ({ store_id: store.id, weekday: d + 1, opens: s.opens, closes: s.closes })));
    if (rows.some((r) => r.opens >= r.closes)) return setError(t("L'orario di chiusura deve essere dopo l'apertura."));
    const minutes = Number(lead);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return setError(t('Tempo di preparazione: da 0 a 1440 minuti.'));
    setBusy(true);
    try {
      unwrap(await supabase.from('store_opening_hours').delete().eq('store_id', store.id));
      if (rows.length) unwrap(await supabase.from('store_opening_hours').insert(rows));
      unwrap(await supabase.from('stores').update({ pickup_lead_minutes: minutes }).eq('id', store.id));
      onSaved(); onClose();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const addClosure = async () => {
    if (!newDay) return;
    setError('');
    try {
      unwrap(await supabase.from('store_closures').upsert({ store_id: store.id, day: newDay, note: newNote.trim() || null }));
      setClosures((c) => [...c.filter((x) => x.day !== newDay), { store_id: store.id, day: newDay, note: newNote.trim() || null }].sort((a, b) => a.day.localeCompare(b.day)));
      setNewDay(''); setNewNote('');
    } catch (e) { setError(errorText(e)); }
  };
  const removeClosure = async (day: string) => {
    try {
      unwrap(await supabase.from('store_closures').delete().eq('store_id', store.id).eq('day', day));
      setClosures((c) => c.filter((x) => x.day !== day));
    } catch (e) { setError(errorText(e)); }
  };

  return <Modal title={t('Orari di ritiro · {name}', { name: store.name })} onClose={onClose}>
    {!week ? <Loading /> : <div className="grid">
      {error && <Notice tone="error">{error}</Notice>}
      <p className="small muted" style={{ margin: 0 }}>{t('Il cliente sceglie una fascia di un’ora dentro questi orari, da oggi ai due giorni successivi. Lascia vuoto un giorno per chiuso.')}</p>
      <table><tbody>{week.map((shifts, d) => <tr key={d}>
        <td style={{ width: 110 }}><strong>{t(DAYS[d])}</strong></td>
        <td>{!shifts.length ? <span className="muted small">{t('Chiuso')}</span> : shifts.map((s, i) => <span key={i} className="row" style={{ flexWrap: 'nowrap', marginBottom: 4 }}>
          <input type="time" value={s.opens} onChange={(e) => setShift(d, i, 'opens', e.target.value)} aria-label={t('{day}: apertura', { day: t(DAYS[d]) })} />
          –<input type="time" value={s.closes} onChange={(e) => setShift(d, i, 'closes', e.target.value)} aria-label={t('{day}: chiusura', { day: t(DAYS[d]) })} />
          <button className="ghost" onClick={() => setWeek((w) => w!.map((x, k) => k !== d ? x : x.filter((_, j) => j !== i)))} aria-label={t('Togli fascia')}>×</button>
        </span>)}</td>
        <td className="num">{shifts.length < 2 && <button className="ghost" onClick={() => setWeek((w) => w!.map((x, k) => k !== d ? x
          : [...x, x.length ? { opens: '15:00', closes: '19:30' } : { opens: '09:00', closes: '19:30' }]))}>{shifts.length ? t('+ Pomeriggio') : t('+ Apri')}</button>}</td>
      </tr>)}</tbody></table>
      <div className="row"><button className="secondary" onClick={copyMonday}>{t('Copia il lunedì su tutti i giorni')}</button></div>
      <Field label={t('Tempo di preparazione (minuti)')} hint={t('La prima fascia disponibile inizia almeno dopo questo tempo.')}>
        <input type="number" min={0} max={1440} step={15} value={lead} onChange={(e) => setLead(e.target.value)} /></Field>
      <button disabled={busy} onClick={save}>{t('Salva orari')}</button>

      <h3 style={{ marginBottom: 0 }}>{t('Giorni di chiusura')}</h3>
      {closures.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{closures.map((c) => <li key={c.day}>
        {new Date(`${c.day}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}{c.note ? ` · ${c.note}` : ''}
        {' '}<button className="ghost" onClick={() => removeClosure(c.day)}>{t('Rimuovi')}</button></li>)}</ul>
        : <p className="small muted" style={{ margin: 0 }}>{t('Nessuna chiusura in programma.')}</p>}
      <div className="row">
        <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} aria-label={t('Giorno di chiusura')} />
        <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={t('Nota (es. Natale)')} maxLength={200} />
        <button className="secondary" disabled={!newDay} onClick={addClosure}>{t('Aggiungi chiusura')}</button>
      </div>
    </div>}
  </Modal>;
}
