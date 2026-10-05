import { useState } from 'react';
import { Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Notice, PrimaryButton, TextField } from '@/components/UI';
import { colors } from '@/config/theme';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/store/session';

const MIN_PASSWORD = 8;

/** Set or change the account password (also the way back in after signing in with an email code). */
export default function PasswordScreen() {
  const user = useUser();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!user) return <Redirect href="/auth/sign-in" />;

  const save = async () => {
    if (password.length < MIN_PASSWORD) { setError(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`); return; }
    if (password !== repeat) { setError('Le due password non coincidono.'); return; }
    setBusy(true); setError('');
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) {
      setError(e.code === 'same_password' ? 'È già la tua password attuale.'
        : e.code === 'weak_password' ? 'Password troppo debole: usa lettere e numeri, almeno 8 caratteri.'
        : e.code === 'reauthentication_needed' ? 'Per sicurezza esci e accedi di nuovo con il codice via email, poi riprova.'
        : 'Salvataggio non riuscito. Riprova.');
      return;
    }
    setSaved(true); setPassword(''); setRepeat('');
  };

  return <Screen stack maxWidth={480}>
    <Text style={{ fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: 18 }}>
      Scegli una password per accedere con email e password. Puoi sempre entrare anche con un codice via email.
    </Text>
    {saved && <Notice tone="success" title="Password salvata" message={`Da ora puoi accedere con ${user.email} e la nuova password.`} />}
    <TextField label="Nuova password" value={password} onChangeText={(v) => { setPassword(v); setSaved(false); }} secureTextEntry
      autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" hint={`Almeno ${MIN_PASSWORD} caratteri.`} />
    <TextField label="Ripeti la password" value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" autoCorrect={false}
      autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={save} error={error} />
    <PrimaryButton title="Salva password" loading={busy} onPress={save} />
    {saved && <Text style={{ marginTop: 14, textAlign: 'center', color: colors.green }} onPress={() => router.back()}>Torna al profilo</Text>}
  </Screen>;
}
