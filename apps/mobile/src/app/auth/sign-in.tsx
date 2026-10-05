import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { isEmail } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Checkbox, Notice, PageTitle, PrimaryButton, SecondaryButton, TextField } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { supabase } from '@/lib/supabase';

/**
 * Sign in with email + password (default), create an account with a password, or sign in with a
 * 6-digit email code (Supabase OTP; the "Magic Link" template must include {{ .Token }} — see
 * docs/DEPLOYMENT.md). On the web the email's link also works: it returns to the shop, signed in.
 * A forgotten password is handled with the code: sign in with it, then set a new password in Profilo.
 */

/** Web only: where an email link lands, e.g. https://host/Casa-Te/cart (must be an allowed redirect URL). */
function webRedirect(next?: string): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const base = window.location.pathname.replace(/auth\/sign-in\/?$/, '');
  const target = typeof next === 'string' && next.startsWith('/') ? next.slice(1) : 'profile';
  return `${window.location.origin}${base}${target}`;
}

type Mode = 'password' | 'register' | 'code';
const MIN_PASSWORD = 8;

export default function SignInScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [mode, setMode] = useState<Mode>('password');
  // After sending a code (sign-in) or creating an account that must confirm its email.
  const [awaiting, setAwaiting] = useState<null | 'email' | 'signup'>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const cleanEmail = email.trim().toLowerCase();
  const done = async (userId: string) => {
    if (marketing) await supabase.from('profiles').update({ marketing_opt_in: true }).eq('id', userId);
    const target = typeof next === 'string' && next.startsWith('/') ? next : '/profile';
    router.replace(target as never);
  };
  const switchMode = (m: Mode) => { setMode(m); setAwaiting(null); setError(''); setInfo(''); setCode(''); };

  const signIn = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    if (!password) { setError('Inserisci la password.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { data, error: e } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (e || !data.session) {
      if (e?.code === 'email_not_confirmed') {
        setError('Conferma prima il tuo indirizzo email: apri il link che ti abbiamo inviato.');
      } else if (e?.status === 429) {
        setError('Troppi tentativi. Riprova tra qualche minuto.');
      } else {
        setError('Email o password non corretti. Se di solito accedi con il codice via email, usa «Accedi con un codice».');
      }
      return;
    }
    await done(data.session.user.id);
  };

  const register = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    if (password.length < MIN_PASSWORD) { setError(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`); return; }
    setBusy(true); setError(''); setInfo('');
    const { data, error: e } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    if (e) {
      setError(e.code === 'user_already_exists' ? 'Esiste già un account con questa email: accedi.'
        : e.code === 'weak_password' ? 'Password troppo debole: usa lettere e numeri, almeno 8 caratteri.'
        : e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Registrazione non riuscita. Riprova.');
      return;
    }
    if (data.session) { await done(data.session.user.id); return; }
    // Email confirmation required: a link (and, where the template has it, a 6-digit code) was sent.
    setAwaiting('signup');
    setInfo(`Abbiamo inviato un'email a ${email.trim()} per confermare l'indirizzo. Apri il link contenuto nell'email, poi torna qui e accedi con la tua password. Se l'email contiene un codice a 6 cifre, puoi inserirlo qui sotto. Se hai già un account con questa email, accedi direttamente.`);
  };

  const sendCode = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { error: e } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true, emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    if (e) { setError(e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Invio non riuscito. Riprova.'); return; }
    setAwaiting('email');
    setInfo(Platform.OS === 'web'
      ? `Abbiamo inviato un'email a ${email.trim()}: apri il link di accesso contenuto nell'email per entrare. Se l'email contiene un codice a 6 cifre, puoi inserirlo qui. Controlla anche lo spam.`
      : `Abbiamo inviato un codice a ${email.trim()}. Controlla anche lo spam.`);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError('Il codice è composto da 6 cifre.'); return; }
    setBusy(true); setError('');
    const { data, error: e } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: awaiting === 'signup' ? 'signup' : 'email' });
    setBusy(false);
    if (e || !data.session) { setError('Codice non valido o scaduto.'); return; }
    await done(data.session.user.id);
  };

  const resendConfirmation = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    setInfo(e ? '' : `Email di conferma inviata di nuovo a ${email.trim()}.`);
    if (e) setError(e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Invio non riuscito. Riprova.');
  };

  const title = awaiting === 'signup' ? 'Conferma la tua email' : awaiting === 'email' ? 'Inserisci il codice'
    : mode === 'register' ? 'Crea un account' : mode === 'code' ? 'Accedi con un codice' : 'Accedi';
  const subtitle = awaiting ? info
    : mode === 'register' ? 'Bastano email e password. Ti chiediamo solo di confermare l’indirizzo.'
    : mode === 'code' ? 'Ti inviamo un codice via email: niente password. Funziona anche se l’hai dimenticata.'
    : 'Accedi con email e password per seguire i tuoi ordini e salvare gli indirizzi.';

  const emailField = <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
    autoComplete="email" textContentType="emailAddress" autoFocus returnKeyType="next" error={mode === 'code' ? error : undefined} />;
  const passwordField = <View>
    <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
      autoComplete={mode === 'register' ? 'new-password' : 'current-password'} textContentType={mode === 'register' ? 'newPassword' : 'password'}
      returnKeyType="go" onSubmitEditing={mode === 'register' ? register : signIn}
      hint={mode === 'register' ? `Almeno ${MIN_PASSWORD} caratteri.` : undefined} error={error} style={{ paddingRight: 80 }} />
    <Pressable onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" style={styles.show} hitSlop={8}>
      <Text style={styles.showText}>{showPassword ? 'Nascondi' : 'Mostra'}</Text></Pressable>
  </View>;
  const link = (label: string, onPress: () => void) =>
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}><Text style={styles.link}>{label}</Text></Pressable>;
  const legal = <Text style={styles.legal}>
    Continuando accetti le{' '}
    <Text style={{ color: colors.green }} onPress={() => router.push('/legal/terms')}>Condizioni</Text> e confermi di aver letto l'{' '}
    <Text style={{ color: colors.green }} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text>.
  </Text>;
  const marketingBox = <Checkbox checked={marketing} onChange={setMarketing}>
    <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>Voglio ricevere offerte e novità CASA & TE via email (facoltativo, revocabile in ogni momento).</Text>
  </Checkbox>;

  return <Screen stack maxWidth={480}>
    <PageTitle title={title} subtitle={subtitle} />

    {awaiting ? <>
      <TextField label="Codice a 6 cifre" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad"
        maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={verify} error={error} />
      <View style={{ gap: 10, marginTop: 8 }}>
        <PrimaryButton title={awaiting === 'signup' ? 'Conferma' : 'Accedi'} loading={busy} onPress={verify} />
        {awaiting === 'signup'
          ? <>
              <SecondaryButton title="Ho confermato: accedi con la password" onPress={() => switchMode('password')} disabled={busy} />
              <SecondaryButton title="Invia di nuovo l'email" onPress={resendConfirmation} disabled={busy} />
            </>
          : <>
              <SecondaryButton title="Invia di nuovo" onPress={sendCode} disabled={busy} />
              <SecondaryButton title="Cambia email" onPress={() => { setAwaiting(null); setCode(''); setError(''); }} disabled={busy} />
            </>}
      </View>
    </> : mode === 'code' ? <>
      {emailField}
      {marketingBox}
      <View style={{ marginTop: 16 }}><PrimaryButton title="Invia codice" loading={busy} onPress={sendCode} /></View>
      <View style={styles.links}>{link('Accedi con la password', () => switchMode('password'))}</View>
      {legal}
    </> : <>
      {emailField}
      {passwordField}
      {mode === 'register' && marketingBox}
      <View style={{ marginTop: 16 }}>
        <PrimaryButton title={mode === 'register' ? 'Crea account' : 'Accedi'} loading={busy} onPress={mode === 'register' ? register : signIn} />
      </View>
      {mode === 'password' ? <>
        <View style={styles.links}>
          {link('Password dimenticata?', () => { switchMode('code'); setInfo(''); })}
          {link('Accedi con un codice', () => switchMode('code'))}
        </View>
        <View style={styles.divider} />
        <Text style={styles.newHere}>Non hai ancora un account?</Text>
        <SecondaryButton title="Crea un account" onPress={() => switchMode('register')} disabled={busy} />
      </> : <>
        <View style={styles.divider} />
        <Text style={styles.newHere}>Hai già un account?</Text>
        <SecondaryButton title="Accedi" onPress={() => switchMode('password')} disabled={busy} />
      </>}
      {legal}
    </>}
    {mode === 'code' && !awaiting && <Notice title="Password dimenticata?" message="Accedi con il codice, poi vai su Profilo → Password per sceglierne una nuova." />}
  </Screen>;
}

const styles = StyleSheet.create({
  show: { position: 'absolute', right: 14, top: 38, paddingVertical: 4 },
  showText: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  link: { fontSize: 14, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500', textDecorationLine: 'underline' },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 24, marginBottom: 18 },
  newHere: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans, marginBottom: 10, textAlign: 'center' },
  legal: { fontSize: 12, color: colors.muted, marginTop: 20, lineHeight: 17 },
});
