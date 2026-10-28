import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { friendlyError } from '@casa-te/shared';
import { linkMemberCard, unlinkMemberCard } from '@/lib/api';
import { colors, fonts } from '@/config/theme';
import { useClubStore } from '@/store/club';
import { Barcode } from './Barcode';
import { Notice, PrimaryButton, SecondaryButton, TextField } from './UI';

/** Linked card: shown as a barcode to scan at the till (points stay in the store system). */
export function MemberCardView({ card, onUnlinked }: { card: string; onUnlinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unlink = async () => {
    setBusy(true); setError('');
    try { await unlinkMemberCard(); onUnlinked(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  return <View>
    <View style={styles.card}>
      <Text style={styles.cardBrand}>Casa & Te · Tessera Soci</Text>
      <View style={styles.barcode}><Barcode value={card} height={70} /></View>
      <Text selectable style={styles.cardNumber}>{card.replace(/(.{4})(?=.)/g, '$1 ')}</Text>
    </View>
    <Text style={styles.note}>Mostrala alla cassa come la tessera: i punti si accumulano e si usano in negozio.</Text>
    {!!error && <Notice tone="error" message={error} />}
    <View style={{ marginTop: 14 }}><SecondaryButton title="Scollega la tessera" onPress={unlink} disabled={busy} /></View>
  </View>;
}

/** Form to link an existing card: card number plus the last 4 phone digits or the birth date on file in store. */
export function MemberCardLink({ onLinked }: { onLinked: () => void }) {
  const [card, setCard] = useState('');
  const [mode, setMode] = useState<'phone' | 'birth'>('phone');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    const digits = card.replace(/[^0-9A-Za-z]/g, '');
    if (digits.length < 4) { setError('Inserisci il numero della tessera.'); return; }
    let birthIso: string | undefined;
    if (mode === 'birth') {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(birth.trim());
      if (!m) { setError('Data di nascita nel formato GG/MM/AAAA.'); return; }
      birthIso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    } else if (!/^\d{4}$/.test(phone.trim())) { setError('Inserisci le ultime 4 cifre del telefono.'); return; }
    setBusy(true);
    try {
      await linkMemberCard({ card: digits, ...(mode === 'phone' ? { phone_last4: phone.trim() } : { birth_date: birthIso }) });
      useClubStore.getState().set(true);
      onLinked();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  return <View>
    <TextField label="Numero della tessera" value={card} onChangeText={setCard} keyboardType="number-pad" autoCapitalize="characters"
      hint="Il numero stampato sotto il codice a barre." />
    <View style={styles.switch} accessibilityRole="radiogroup">
      {([['phone', 'Telefono'], ['birth', 'Data di nascita']] as const).map(([k, label]) =>
        <Pressable key={k} onPress={() => setMode(k)} accessibilityRole="radio" accessibilityState={{ selected: mode === k }}
          style={[styles.switchItem, mode === k && styles.switchOn]}>
          <Text style={[styles.switchText, mode === k && styles.switchTextOn]}>{label}</Text>
        </Pressable>)}
    </View>
    {mode === 'phone'
      ? <TextField label="Ultime 4 cifre del telefono" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad" maxLength={4} hint="Del numero che hai dato in negozio quando hai fatto la tessera." />
      : <TextField label="Data di nascita" value={birth} onChangeText={setBirth} placeholder="GG/MM/AAAA" keyboardType="numbers-and-punctuation" />}
    {!!error && <Notice tone="error" message={error} />}
    <View style={{ marginTop: 12 }}><PrimaryButton title="Collega la tessera" onPress={submit} loading={busy} /></View>
    <Text style={styles.note}>Usiamo questi dati solo per verificare che la tessera sia tua; non li conserviamo.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.green, borderRadius: 18, padding: 18, gap: 12 },
  cardBrand: { color: colors.yellow, fontFamily: fonts.sansBold, fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  barcode: { backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  cardNumber: { color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '600', fontSize: 18, letterSpacing: 2, textAlign: 'center' },
  note: { fontSize: 12, lineHeight: 17, color: colors.muted, fontFamily: fonts.sans, marginTop: 8 },
  switch: { flexDirection: 'row', backgroundColor: colors.well, borderRadius: 12, padding: 3, marginVertical: 10 },
  switchItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  switchOn: { backgroundColor: colors.surface },
  switchText: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.muted },
  switchTextOn: { color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
});
