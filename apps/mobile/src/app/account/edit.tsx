import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { friendlyError, isPhone } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Checkbox, Loading, Notice, PrimaryButton, TextField } from '@/components/UI';
import { colors } from '@/config/theme';
import { fetchProfile, updateProfile } from '@/lib/api';
import { invalidate, useQuery } from '@/lib/useQuery';
import { useUser } from '@/store/session';

export default function EditProfileScreen() {
  const user = useUser();
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile.data) { setName(profile.data.full_name ?? ''); setPhone(profile.data.phone ?? ''); setMarketing(profile.data.marketing_opt_in); }
  }, [profile.data]);

  if (!user) return <Redirect href="/auth/sign-in" />;
  if (!profile.data) return <Screen stack><Loading /></Screen>;

  const save = async () => {
    if (phone && !isPhone(phone)) { setError('Numero di telefono non valido.'); return; }
    setBusy(true); setError('');
    try {
      await updateProfile(user.id, { full_name: name.trim() || null, phone: phone.trim() || null, marketing_opt_in: marketing });
      invalidate(`profile:${user.id}`);
      router.back();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  return <Screen stack maxWidth={560}>
    <TextField label="Email" value={user.email ?? ''} editable={false} hint="Per cambiare email contatta l'assistenza." />
    <TextField label="Nome e cognome" value={name} onChangeText={setName} autoComplete="name" />
    <TextField label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
    <Checkbox checked={marketing} onChange={setMarketing}>
      <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>Ricevi offerte e novità via email</Text>
    </Checkbox>
    {!!error && <Notice tone="error" message={error} />}
    <PrimaryButton title="Salva" loading={busy} onPress={save} icon="check" />
  </Screen>;
}
