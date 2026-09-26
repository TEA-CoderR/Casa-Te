import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { friendlyError, validateAddress, type Address, type AddressRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Checkbox, EmptyState, Loading, Notice, PrimaryButton, SecondaryButton, SectionTitle, TextField } from '@/components/UI';
import { colors } from '@/config/theme';
import { deleteAddress, fetchAddresses, saveAddress } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useUser } from '@/store/session';

const blank: Address = { fullName: '', line1: '', line2: '', city: '', province: '', postalCode: '', phone: '' };

export default function AddressesScreen() {
  const user = useUser();
  const list = useQuery<AddressRow[]>(user ? `addresses:${user.id}` : null, fetchAddresses);
  const [editing, setEditing] = useState<{ id?: string; label: string; isDefault: boolean; a: Address } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Address, string>>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Redirect href="/auth/sign-in" />;

  const save = async () => {
    if (!editing) return;
    const e = validateAddress(editing.a);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true); setError('');
    try {
      await saveAddress(user.id, { label: editing.label.trim() || undefined, is_default: editing.isDefault, full_name: editing.a.fullName,
        line1: editing.a.line1, line2: editing.a.line2, city: editing.a.city, province: editing.a.province, postal_code: editing.a.postalCode,
        phone: editing.a.phone }, editing.id);
      setEditing(null); await list.refetch();
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await deleteAddress(id); await list.refetch(); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  };

  if (editing) {
    const set = (patch: Partial<Address>) => setEditing({ ...editing, a: { ...editing.a, ...patch } });
    return <Screen stack maxWidth={560}>
      <SectionTitle>{editing.id ? 'Modifica indirizzo' : 'Nuovo indirizzo'}</SectionTitle>
      <TextField label="Etichetta (es. Casa, Ufficio)" value={editing.label} onChangeText={(v) => setEditing({ ...editing, label: v })} />
      <TextField label="Nome e cognome" value={editing.a.fullName} onChangeText={(v) => set({ fullName: v })} error={errors.fullName} />
      <TextField label="Via e numero civico" value={editing.a.line1} onChangeText={(v) => set({ line1: v })} error={errors.line1} />
      <TextField label="Scala, interno, presso" value={editing.a.line2} onChangeText={(v) => set({ line2: v })} />
      <View style={styles.row}>
        <View style={{ flex: 2 }}><TextField label="Città" value={editing.a.city} onChangeText={(v) => set({ city: v })} error={errors.city} /></View>
        <View style={{ flex: 1 }}><TextField label="Prov." value={editing.a.province} maxLength={2} autoCapitalize="characters"
          onChangeText={(v) => set({ province: v.toUpperCase() })} error={errors.province} /></View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><TextField label="CAP" value={editing.a.postalCode} maxLength={5} keyboardType="number-pad"
          onChangeText={(v) => set({ postalCode: v.replace(/\D/g, '') })} error={errors.postalCode} /></View>
        <View style={{ flex: 1.4 }}><TextField label="Telefono" value={editing.a.phone} keyboardType="phone-pad"
          onChangeText={(v) => set({ phone: v })} error={errors.phone} /></View>
      </View>
      <Checkbox checked={editing.isDefault} onChange={(v) => setEditing({ ...editing, isDefault: v })}>
        <Text style={{ fontSize: 13, color: colors.text }}>Usa come indirizzo predefinito</Text></Checkbox>
      {!!error && <Notice tone="error" message={error} />}
      <View style={{ gap: 10, marginTop: 12 }}>
        <PrimaryButton title="Salva indirizzo" loading={busy} onPress={save} icon="check" />
        <SecondaryButton title="Annulla" onPress={() => setEditing(null)} />
      </View>
    </Screen>;
  }

  return <Screen stack maxWidth={560}>
    {!list.data ? <Loading /> : !list.data.length
      ? <EmptyState icon="pin" title="Nessun indirizzo salvato" message="Salva un indirizzo per completare gli ordini più velocemente." />
      : list.data.map((a) => <View key={a.id} style={styles.card}>
        <Text style={styles.title}>{a.label || a.full_name}{a.is_default ? ' · Predefinito' : ''}</Text>
        <Text style={styles.text}>{a.full_name}{'\n'}{a.line1}{a.line2 ? `, ${a.line2}` : ''}{'\n'}{a.postal_code} {a.city} ({a.province}) · {a.phone}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setEditing({ id: a.id, label: a.label ?? '', isDefault: a.is_default,
            a: { fullName: a.full_name, line1: a.line1, line2: a.line2 ?? '', city: a.city, province: a.province, postalCode: a.postal_code, phone: a.phone } })}>
            <Text style={styles.action}>Modifica</Text></Pressable>
          <Pressable onPress={() => remove(a.id)} disabled={busy}><Text style={[styles.action, { color: colors.danger }]}>Elimina</Text></Pressable>
        </View>
      </View>)}
    {!!error && <Notice tone="error" message={error} />}
    <View style={{ marginTop: 16 }}>
      <PrimaryButton title="Aggiungi indirizzo" icon="plus" onPress={() => setEditing({ label: '', isDefault: !list.data?.length, a: blank })} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  text: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 10 },
  action: { color: colors.green, fontWeight: '600', paddingVertical: 8 },
});
