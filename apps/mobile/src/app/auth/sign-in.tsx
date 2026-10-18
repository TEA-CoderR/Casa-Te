import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BrandHeader, HeaderBack } from '@/components/BrandHeader';
import { Icon } from '@/components/Icon';
import { useLayout } from '@/lib/hooks';
import { isEmail } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Checkbox, Notice, PageTitle, PrimaryButton, SecondaryButton, TextField } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { supabase } from '@/lib/supabase';

/**
 * Sign in with email + password (default), create an account with a password, or sign in with an
 * email code (Supabase OTP). New accounts confirm their email with the code too, never with a link:
 * the "Confirm signup" and "Magic Link" templates must include {{ .Token }} (docs/DEPLOYMENT.md).
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
const codeSent = (to: string) => `Abbiamo inviato un codice a ${to}. Inseriscilo qui sotto. Controlla anche lo spam.`;
const MIN_PASSWORD = 8;

/** Password strength for the meter: 0 = too short … 4 = strong. Minimum to register: 2 (8+ chars, letters and numbers). */
export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length < MIN_PASSWORD) return { score: pw ? 1 : 0, label: pw ? 'Troppo corta' : '', color: '#C8231F' };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const letters = /[A-Za-z]/.test(pw), digits = /\d/.test(pw);
  if (!letters || !digits) return { score: 1, label: 'Debole: usa lettere e numeri', color: '#C8231F' };
  if (pw.length >= 12 && kinds >= 3) return { score: 4, label: 'Forte', color: '#2E7D32' };
  if (kinds >= 3 || pw.length >= 12) return { score: 3, label: 'Buona', color: '#5C8A1F' };
  return { score: 2, label: 'Media', color: '#C98A00' };
}

export default function SignInScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { wide } = useLayout();
  const [mode, setMode] = useState<Mode>('password');
  // After sending a code (sign-in) or creating an account that must confirm its email.
  const [awaiting, setAwaiting] = useState<null | 'email' | 'signup'>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [password2, setPassword2] = useState('');
  const [terms, setTerms] = useState(false);
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
  const switchMode = (m: Mode) => { setMode(m); setAwaiting(null); setError(''); setInfo(''); setCode(''); setPassword2(''); };

  const signIn = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    if (!password) { setError('Inserisci la password.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { data, error: e } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (e || !data.session) {
      if (e?.code === 'email_not_confirmed') {
        // Unconfirmed account: send a fresh code and ask for it right here.
        await resendConfirmation();
        setAwaiting('signup');
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
    if (passwordStrength(password).score < 2) { setError(`Scegli una password di almeno ${MIN_PASSWORD} caratteri con lettere e numeri.`); return; }
    if (password !== password2) { setError('Le due password non coincidono.'); return; }
    if (!terms) { setError('Per creare l’account devi accettare le Condizioni di vendita e l’Informativa privacy.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { data, error: e } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    if (e) {
      setError(e.code === 'user_already_exists' ? 'Esiste già un account con questa email: accedi.'
        : e.code === 'weak_password' ? 'Password troppo debole: usa lettere e numeri, almeno 8 caratteri.'
        : e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Registrazione non riuscita. Riprova.');
      return;
    }
    if (data.session) {
      // The project accepted the account without confirming the email (Auth "Confirm email" off):
      // never let it in like that. Sign out and confirm ownership of the address with a code first.
      await supabase.auth.signOut();
      setBusy(true);
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: false } });
      setBusy(false);
      if (otpError) { setError(otpError.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Invio del codice non riuscito. Riprova.'); return; }
      setAwaiting('email');
      setInfo(codeSent(email.trim()));
      return;
    }
    // Already registered and confirmed: Supabase answers "ok" with no identities and sends nothing
    // (to hide which emails exist). Send a sign-in code instead, so the customer can still get in.
    if (data.user && data.user.identities?.length === 0) {
      setBusy(true);
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: false } });
      setBusy(false);
      if (otpError) { setError(otpError.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Esiste già un account con questa email: accedi.'); return; }
      setAwaiting('email');
      setInfo(`Hai già un account con ${email.trim()}: ti abbiamo inviato un codice per accedere. Inseriscilo qui sotto. Controlla anche lo spam.`);
      return;
    }
    // Email confirmation required: the email carries a code, entered below.
    setAwaiting('signup');
    setInfo(codeSent(email.trim()));
  };

  const sendCode = async () => {
    if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
    setBusy(true); setError(''); setInfo('');
    // Codes sign in existing accounts only: a new customer registers (and accepts the terms) with «Crea account».
    const { error: e } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: false, emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    if (e) {
      setError(e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.'
        : /signup|not allowed|not found/i.test(e.message) ? 'Nessun account con questa email: crealo con «Crea account».' : 'Invio non riuscito. Riprova.');
      return;
    }
    setAwaiting('email');
    setInfo(codeSent(email.trim()));
  };

  const verify = async () => {
    // Length follows Supabase Auth → Email OTP length (6–10 digits).
    if (!/^\d{6,10}$/.test(code.trim())) { setError("Inserisci il codice numerico ricevuto via email."); return; }
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
    setInfo(e ? '' : codeSent(email.trim()));
    if (e) setError(e.status === 429 ? 'Troppi tentativi. Riprova tra qualche minuto.' : 'Invio non riuscito. Riprova.');
  };

  const title = awaiting === 'signup' ? 'Conferma la tua email' : awaiting === 'email' ? 'Inserisci il codice'
    : mode === 'register' ? 'Crea un account' : mode === 'code' ? 'Accedi con un codice' : 'Accedi';
  const subtitle = awaiting ? info
    : mode === 'register' ? 'Bastano email e password. Per confermare l’indirizzo ti inviamo un codice via email.'
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

  // Phone (design F, F-Accesso): the awning with the logo and a large title, an "Accedi / Crea account" switch,
  // fields grouped in a white card, and the email code as six boxes.
  if (!wide) {
    const pTitle = awaiting === 'signup' ? 'Conferma la tua email' : awaiting === 'email' ? 'Controlla la tua email'
      : mode === 'register' ? 'Crea il tuo account' : mode === 'code' ? 'Accedi con un codice' : 'Bentornato';
    const pSub = awaiting ? 'Il codice è valido per pochi minuti.'
      : mode === 'register' ? 'Bastano email e password: segui ordini e ritiri.'
      : mode === 'code' ? 'Niente password: ti inviamo un codice via email.' : 'Accedi per ordinare e ritirare nel tuo negozio.';
    const close = () => router.canGoBack() ? router.back() : router.replace('/');
    const header = <BrandHeader logo logoHeight={34} stacked titleGap={22} titleSize={32} title={pTitle} subtitle={pSub} pad={[14, 20, 34]}
      right={<HeaderBack icon="close" label="Chiudi" onPress={close} />} />;
    const boxes = Math.max(6, code.length);
    const full = code.length >= 6;
    const fieldRow = (label: string, input: React.ReactNode, last: boolean) => <View style={[styles.pRow, !last && styles.pRule]}>
      <Text style={styles.pLabel}>{label}</Text>{input}</View>;
    return <Screen stack header={header} ground={colors.page} contentContainerStyle={{ padding: 16, paddingTop: 16 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {awaiting ? <View>
        <Text style={styles.pIntro}>Abbiamo inviato un codice a <Text style={{ fontFamily: fonts.sansBold, color: colors.text }}>{email.trim()}</Text>. Scrivilo qui sotto; controlla anche lo spam.</Text>
        <View style={styles.boxes}>
          {Array.from({ length: boxes }, (_, i) => <View key={i} style={[styles.box, i === code.length && styles.boxOn]}>
            <Text style={styles.boxText}>{code[i] ?? ''}</Text></View>)}
          <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10}
            autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={verify} accessibilityLabel="Codice ricevuto via email"
            caretHidden style={styles.codeInput} />
        </View>
        {!!error && <Text style={styles.pError} accessibilityLiveRegion="polite">{error}</Text>}
        <Pressable onPress={verify} disabled={!full || busy} accessibilityRole="button" accessibilityState={{ disabled: !full, busy }}
          style={[styles.pPrimary, !full && { backgroundColor: colors.line }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.pPrimaryText, !full && { color: colors.muted }]}>
            {full ? (awaiting === 'signup' ? 'Conferma e accedi' : 'Accedi') : `Inserisci le ${boxes} cifre`}</Text>}
        </Pressable>
        <View style={styles.pLinks}>
          <Pressable onPress={awaiting === 'signup' ? resendConfirmation : sendCode} disabled={busy} accessibilityRole="button" hitSlop={6}><Text style={styles.pLink}>Invia di nuovo il codice</Text></Pressable>
          <Pressable onPress={() => awaiting === 'signup' ? switchMode('register') : (setAwaiting(null), setCode(''), setError(''))} disabled={busy} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.pLink}>Cambia email</Text></Pressable>
        </View>
      </View> : <View>
        {mode !== 'code' && <View style={styles.seg} accessibilityRole="tablist">
          {([['password', 'Accedi'], ['register', 'Crea account']] as const).map(([m, label]) => <Pressable key={m} onPress={() => switchMode(m)}
            accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={[styles.segItem, mode === m && styles.segOn]}>
            <Text style={styles.segText}>{label}</Text></Pressable>)}
        </View>}
        <View style={[styles.pCard, mode !== 'code' && { marginTop: 14 }]}>
          {fieldRow('Email', <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            textContentType="emailAddress" autoFocus returnKeyType="next" placeholder="nome@esempio.it" placeholderTextColor={colors.faint} style={styles.pInput} accessibilityLabel="Email" />, mode === 'code')}
          {mode !== 'code' && fieldRow('Password', <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} textContentType={mode === 'register' ? 'newPassword' : 'password'}
              returnKeyType="go" onSubmitEditing={mode === 'register' ? register : signIn} placeholder={mode === 'register' ? `Almeno ${MIN_PASSWORD} caratteri` : ''}
              placeholderTextColor={colors.faint} style={[styles.pInput, { flex: 1 }]} accessibilityLabel="Password" />
            <Pressable onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" hitSlop={8}><Text style={styles.pShow}>{showPassword ? 'Nascondi' : 'Mostra'}</Text></Pressable>
          </View>, mode !== 'register')}
          {mode === 'register' && fieldRow('Ripeti la password', <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput value={password2} onChangeText={setPassword2} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
              textContentType="newPassword" returnKeyType="go" onSubmitEditing={register} placeholder="Scrivila di nuovo" placeholderTextColor={colors.faint}
              style={[styles.pInput, { flex: 1 }]} accessibilityLabel="Ripeti la password" />
            {!!password2 && <Icon name={password2 === password ? 'check' : 'close'} size={18} color={password2 === password ? colors.green : colors.danger} strokeWidth={2.6} />}
          </View>, true)}
        </View>
        {mode === 'register' && !!password && (() => {
          const st = passwordStrength(password);
          return <View style={styles.meter} accessibilityLabel={`Sicurezza della password: ${st.label}`}>
            <View style={styles.meterBars}>{[1, 2, 3, 4].map((i) => <View key={i} style={[styles.meterBar, i <= st.score && { backgroundColor: st.color }]} />)}</View>
            <Text style={[styles.meterText, { color: st.color }]}>{st.label}</Text>
          </View>;
        })()}
        {mode === 'register' && <Text style={styles.pHint}>Almeno {MIN_PASSWORD} caratteri con lettere e numeri. Più è lunga, meglio è: aggiungi maiuscole o simboli.</Text>}
        {mode === 'register' && !!password2 && password2 !== password && <Text style={styles.pError}>Le due password non coincidono.</Text>}
        {!!error && <Text style={styles.pError} accessibilityLiveRegion="polite">{error}</Text>}
        {!!info && !awaiting && <Text style={styles.pIntro}>{info}</Text>}
        {mode === 'register' && <View style={{ marginTop: 10, marginHorizontal: 2 }}>
          <Checkbox checked={terms} onChange={setTerms}>
            <Text style={styles.pCheck}>Ho letto e accetto le <Text style={styles.pLinkInline} onPress={() => router.push('/legal/terms')}>Condizioni di vendita</Text> e l’<Text style={styles.pLinkInline} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text> <Text style={{ color: colors.danger }}>*</Text></Text>
          </Checkbox>
          {marketingBox}
          <Text style={styles.pHint}>Ti invieremo un codice via email per confermare l’indirizzo prima di attivare l’account.</Text>
        </View>}
        <Pressable onPress={mode === 'register' ? register : mode === 'code' ? sendCode : signIn} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} style={styles.pPrimary}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pPrimaryText}>{mode === 'register' ? 'Crea account' : mode === 'code' ? 'Invia il codice' : 'Accedi'}</Text>}
        </Pressable>
        <Pressable onPress={() => switchMode(mode === 'code' ? 'password' : 'code')} disabled={busy} accessibilityRole="button" style={styles.pSecondary}>
          <Icon name="mail" size={18} color={colors.green} strokeWidth={2} />
          <Text style={styles.pSecondaryText}>{mode === 'code' ? 'Accedi con la password' : 'Accedi con un codice email'}</Text>
        </Pressable>
        {mode === 'code' && <Text style={styles.pLegal}>Password dimenticata? Accedi con il codice, poi vai su Profilo → Password per sceglierne una nuova.</Text>}
      </View>}
    </Screen>;
  }

  return <Screen stack maxWidth={480}>
    <PageTitle title={title} subtitle={subtitle} />

    {awaiting ? <>
      <TextField label="Codice ricevuto via email" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad"
        maxLength={10} autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={verify} error={error} />
      <View style={{ gap: 10, marginTop: 8 }}>
        <PrimaryButton title={awaiting === 'signup' ? 'Conferma' : 'Accedi'} loading={busy} onPress={verify} />
        {awaiting === 'signup'
          ? <>
              <SecondaryButton title="Invia di nuovo il codice" onPress={resendConfirmation} disabled={busy} />
              <SecondaryButton title="Cambia email" onPress={() => switchMode('register')} disabled={busy} />
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
      {mode === 'register' && <>
        <TextField label="Ripeti la password" value={password2} onChangeText={setPassword2} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
          autoComplete="new-password" textContentType="newPassword" error={password2 && password2 !== password ? 'Le due password non coincidono.' : undefined}
          hint={password ? `Sicurezza: ${passwordStrength(password).label}` : undefined} />
        <Checkbox checked={terms} onChange={setTerms}>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19 }}>Ho letto e accetto le <Text style={{ color: colors.green }} onPress={() => router.push('/legal/terms')}>Condizioni di vendita</Text> e l'<Text style={{ color: colors.green }} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text> *</Text>
        </Checkbox>
        {marketingBox}
      </>}
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
  seg: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.well },
  segItem: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#FFFFFF', shadowColor: '#18201A', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  pCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line },
  pRow: { paddingVertical: 10 },
  pRule: { borderBottomWidth: 1, borderColor: '#EFECE3' },
  pLabel: { fontSize: 12.5, fontFamily: fonts.sansBold, color: colors.muted },
  pInput: { paddingTop: 4, paddingBottom: 0, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0 } as object,
  pShow: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green },
  pError: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, color: colors.danger, marginTop: 10, marginHorizontal: 4 },
  pIntro: { fontSize: 15, lineHeight: 21, fontFamily: fonts.sans, color: '#4E554B', marginHorizontal: 4, marginTop: 6 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginHorizontal: 4 },
  meterBars: { flex: 1, flexDirection: 'row', gap: 4 },
  meterBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line },
  meterText: { fontSize: 13, fontFamily: fonts.sansBold, minWidth: 90, textAlign: 'right' },
  pHint: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 6, marginHorizontal: 4 },
  pCheck: { fontSize: 14, lineHeight: 20, fontFamily: fonts.sans, color: '#4E554B' },
  pLegal: { fontSize: 13, lineHeight: 19, fontFamily: fonts.sans, color: colors.muted, marginTop: 12, marginHorizontal: 4 },
  pLinkInline: { color: colors.green, fontFamily: fonts.sansBold, textDecorationLine: 'underline' },
  pPrimary: { marginTop: 16, height: 58, borderRadius: 29, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  pPrimaryText: { fontSize: 17, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  pSecondary: { marginTop: 8, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: '#D5D0C3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pSecondaryText: { fontSize: 15.5, fontFamily: fonts.sansBold, color: colors.text },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 16 },
  box: { flex: 1, height: 58, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderWidth: 2, borderColor: colors.green },
  boxText: { fontSize: 24, fontFamily: fonts.heavy, color: colors.text },
  codeInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, fontSize: 1, color: 'transparent' } as object,
  pLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pLink: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.green, paddingVertical: 12 },
  show: { position: 'absolute', right: 14, top: 38, paddingVertical: 4 },
  showText: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  link: { fontSize: 14, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500', textDecorationLine: 'underline' },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 24, marginBottom: 18 },
  newHere: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans, marginBottom: 10, textAlign: 'center' },
  legal: { fontSize: 12, color: colors.muted, marginTop: 20, lineHeight: 17 },
});
