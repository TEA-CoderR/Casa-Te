import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { isEmail } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Checkbox, PageTitle, PrimaryButton, SecondaryButton, TextField } from '@/components/UI';
import { colors } from '@/config/theme';
import { supabase } from '@/lib/supabase';

/**
 * Passwordless sign-in / sign-up with a 6-digit email code (Supabase OTP). The Supabase
 * "Magic Link" email template must include {{ .Token }} — see docs/DEPLOYMENT.md.
 * On the web the email's link also works (Supabase's default templates only contain the link,
 * and editing them requires custom SMTP): it returns to the shop, already signed in.
 */

/** Web only: where the email link lands, e.g. https://host/Casa-Te/cart (must be an allowed redirect URL). */
function webRedirect(next?: string): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const base = window.location.pathname.replace(/auth\/sign-in\/?$/, '');
  const target = typeof next === 'string' && next.startsWith('/') ? next.slice(1) : 'profile';
  return `${window.location.origin}${base}${target}`;
}
export default function SignInScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const sendCode = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: webRedirect(next) },
    });
    setBusy(false);
    if (e) { setError(e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Invio non riuscito. Riprova.'); return; }
    setStep('code');
    setInfo(Platform.OS === 'web'
      ? `Abbiamo inviato un'email a ${email.trim()}: apri il link di accesso contenuto nell'email, oppure inserisci qui il codice se c'è. Controlla anche lo spam.`
      : `Abbiamo inviato un codice a ${email.trim()}. Controlla anche lo spam.`);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError('Il codice è composto da 6 cifre.'); return; }
    setBusy(true); setError('');
    const { data, error: e } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (e || !data.session) { setBusy(false); setError('Codice non valido o scaduto.'); return; }
    if (marketing) await supabase.from('profiles').update({ marketing_opt_in: true }).eq('id', data.session.user.id);
    setBusy(false);
    const target = typeof next === 'string' && next.startsWith('/') ? next : '/profile';
    router.replace(target as never);
  };

  return <Screen stack maxWidth={480}>
    <PageTitle title={step === 'email' ? 'Accedi o registrati' : 'Inserisci il codice'}
      subtitle={step === 'email' ? 'Ti inviamo un codice via email: niente password da ricordare.' : info} />
    {step === 'email' ? <>
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
        autoComplete="email" textContentType="emailAddress" autoFocus returnKeyType="send" onSubmitEditing={sendCode} error={error} />
      <Checkbox checked={marketing} onChange={setMarketing}>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>Voglio ricevere offerte e novità CASA & TE via email (facoltativo, revocabile in ogni momento).</Text>
      </Checkbox>
      <View style={{ marginTop: 16 }}><PrimaryButton title="Invia codice" loading={busy} onPress={sendCode} /></View>
      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 16, lineHeight: 17 }}>
        Continuando accetti le{' '}
        <Text style={{ color: colors.green }} onPress={() => router.push('/legal/terms')}>Condizioni</Text> e confermi di aver letto l'{' '}
        <Text style={{ color: colors.green }} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text>.
      </Text>
    </> : <>
      <TextField label="Codice a 6 cifre" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad"
        maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={verify} error={error} />
      <View style={{ gap: 10, marginTop: 8 }}>
        <PrimaryButton title="Accedi" loading={busy} onPress={verify} />
        <SecondaryButton title="Invia di nuovo" onPress={sendCode} disabled={busy} />
        <SecondaryButton title="Cambia email" onPress={() => { setStep('email'); setCode(''); setError(''); }} disabled={busy} />
      </View>
    </>}
  </Screen>;
}
