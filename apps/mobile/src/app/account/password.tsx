import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Notice, PrimaryButton, TextField } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { supabase } from '@/lib/supabase';
import { isValidPassword, PASSWORD_HELP } from '@casa-te/shared';
import { useUser } from '@/store/session';

/**
 * Change the account password. Two ways to prove it is you:
 * - the current password (checked by signing in with it again);
 * - a code sent by email (Supabase reauthentication nonce), for a forgotten password or an account that signed up
 *   with email codes only and never had one.
 */
export default function PasswordScreen() {
  const user = useUser();
  const [mode, setMode] = useState<'current' | 'code'>('current');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ current?: string; code?: string }>({});
  const [saved, setSaved] = useState(false);
  if (!user) return <Redirect href="/auth/sign-in" />;
  const email = user.email ?? '';

  const sendCode = async () => {
    setSending(true); setError(''); setErrors({});
    const { error: e } = await supabase.auth.reauthenticate();
    setSending(false);
    if (e) { setError(e.status === 429 ? 'Hai richiesto troppi codici. Attendi qualche minuto e riprova.' : 'Invio del codice non riuscito. Riprova.'); return; }
    setSent(true); setCode('');
  };
  const useCode = () => { setMode('code'); setError(''); setErrors({}); setSaved(false); void sendCode(); };
  const useCurrent = () => { setMode('current'); setError(''); setErrors({}); setSaved(false); };

  const save = async () => {
    setError(''); setErrors({});
    if (mode === 'current' && !current) { setErrors({ current: 'Inserisci la password attuale.' }); return; }
    if (mode === 'code' && code.trim().length < 6) { setErrors({ code: 'Inserisci il codice ricevuto via email.' }); return; }
    if (!isValidPassword(password)) { setError(`Scegli una password valida: ${PASSWORD_HELP.toLowerCase()}`); return; }
    if (password !== repeat) { setError('Le due password non coincidono.'); return; }
    setBusy(true);
    try {
      if (mode === 'current') {
        // Signing in again with the current password proves it (same account, fresh session).
        const { error: e } = await supabase.auth.signInWithPassword({ email, password: current });
        if (e) {
          setErrors({ current: e.code === 'invalid_credentials' ? 'La password attuale non è corretta.'
            : e.status === 429 ? 'Troppi tentativi. Attendi qualche minuto e riprova.' : 'Verifica non riuscita. Riprova.' });
          return;
        }
      }
      const { error: e } = await supabase.auth.updateUser(mode === 'code' ? { password, nonce: code.trim() } : { password });
      if (e) {
        if (mode === 'code' && /nonce|otp|expired|invalid/i.test(`${e.code} ${e.message}`) && e.code !== 'weak_password' && e.code !== 'same_password') {
          setErrors({ code: 'Codice non valido o scaduto. Richiedine uno nuovo.' }); return;
        }
        setError(e.code === 'same_password' ? 'È già la tua password attuale.'
          : e.code === 'weak_password' ? `Password troppo debole. ${PASSWORD_HELP}`
          : e.code === 'reauthentication_needed' ? 'Per sicurezza conferma con il codice via email.'
          : 'Salvataggio non riuscito. Riprova.');
        if (e.code === 'reauthentication_needed' && mode === 'current') useCode();
        return;
      }
      setSaved(true); setCurrent(''); setCode(''); setPassword(''); setRepeat(''); setSent(false); setMode('current');
    } finally { setBusy(false); }
  };

  return <Screen stack maxWidth={480}>
    <Text style={styles.lead}>
      {mode === 'current' ? 'Per sicurezza conferma la password attuale, poi scegli quella nuova.'
        : `Ti abbiamo inviato un codice a ${email}: inseriscilo qui sotto con la nuova password.`}
    </Text>
    {saved && <Notice tone="success" title="Password salvata" message={`Da ora puoi accedere con ${email} e la nuova password.`} />}

    {mode === 'current'
      ? <>
        <TextField label="Password attuale" value={current} onChangeText={(v) => { setCurrent(v); setSaved(false); }} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" error={errors.current} />
        <Pressable onPress={useCode} accessibilityRole="button" hitSlop={6} style={styles.linkWrap}>
          <Text style={styles.link}>Password dimenticata o mai impostata? Ricevi un codice via email</Text>
        </Pressable>
      </>
      : <>
        <TextField label="Codice ricevuto via email" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 10)); setSaved(false); }}
          keyboardType="number-pad" maxLength={10} autoComplete="one-time-code" textContentType="oneTimeCode" error={errors.code}
          hint={sending ? 'Invio del codice…' : sent ? 'Controlla anche la cartella spam.' : undefined} />
        <Pressable onPress={sendCode} disabled={sending} accessibilityRole="button" hitSlop={6} style={styles.linkWrap}>
          <Text style={[styles.link, sending && { opacity: 0.5 }]}>Invia un nuovo codice</Text>
        </Pressable>
        <Pressable onPress={useCurrent} accessibilityRole="button" hitSlop={6} style={[styles.linkWrap, { marginTop: -6 }]}>
          <Text style={styles.link}>Ricordi la password? Usa quella attuale</Text>
        </Pressable>
      </>}

    <TextField label="Nuova password" value={password} onChangeText={(v) => { setPassword(v); setSaved(false); }} secureTextEntry
      autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" hint={PASSWORD_HELP} />
    <TextField label="Ripeti la nuova password" value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" autoCorrect={false}
      autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={save} error={error} />
    <PrimaryButton title="Salva password" loading={busy} onPress={save} />
    {saved && <Text style={styles.back} onPress={() => router.back()}>Torna al profilo</Text>}
  </Screen>;
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: colors.muted, marginBottom: 18 },
  linkWrap: { alignSelf: 'flex-start', marginTop: -2, marginBottom: 16, paddingVertical: 2 },
  link: { fontSize: 15, lineHeight: 21, fontFamily: fonts.sansSemiBold, color: colors.green, textDecorationLine: 'underline' },
  back: { marginTop: 14, textAlign: 'center', color: colors.green, fontFamily: fonts.sansSemiBold },
});
