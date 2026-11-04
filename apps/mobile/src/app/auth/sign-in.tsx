import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { BrandLogo } from '@/components/BrandLogo';

/** The logo in its own colours: lime lettering on the shop-sign green. */
const SIGN = { ground: colors.sign, ink: colors.signInk };
import { useLayout } from '@/lib/hooks';
import { isEmail, isValidPassword, MIN_PASSWORD, PASSWORD_HELP, passwordRules } from '@casa-te/shared';
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
type Step = 'welcome' | 'login' | 'code' | 'register' | 'privacy';
const codeSent = (to: string) => `Abbiamo inviato un codice a ${to}. Inseriscilo qui sotto. Controlla anche lo spam.`;

/** Password strength for the meter: 0 = too short … 4 = strong. Minimum to register: 2 (the shared `passwordRules`). */
export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length < MIN_PASSWORD) return { score: pw ? 1 : 0, label: pw ? 'Troppo corta' : '', color: '#C8231F' };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (!isValidPassword(pw)) return { score: 1, label: 'Debole: usa maiuscole, minuscole e numeri', color: '#C8231F' };
  if (pw.length >= 12 && kinds >= 3) return { score: 4, label: 'Forte', color: '#2E7D32' };
  if (kinds >= 3 || pw.length >= 12) return { score: 3, label: 'Buona', color: '#5C8A1F' };
  return { score: 2, label: 'Media', color: '#C98A00' };
}

export default function SignInScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { wide } = useLayout();
  const [mode, setMode] = useState<Mode>('password');
  // Phone only: which page of the flow is showing (the email code page shows whenever `awaiting` is set).
  const [step, setStep] = useState<Step>('welcome');
  const codeRef = useRef<TextInput>(null);
  // After sending a code (sign-in) or creating an account that must confirm its email.
  const [awaiting, setAwaiting] = useState<null | 'email' | 'signup'>(null);
  // The code page opens with the keyboard up (autoFocus alone can miss while the page fades in).
  useEffect(() => { if (!awaiting) return; const t = setTimeout(() => codeRef.current?.focus(), 250); return () => clearTimeout(t); }, [awaiting]);
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
    if (!isValidPassword(password)) { setError(`Scegli una password valida: ${PASSWORD_HELP.toLowerCase()}`); return; }
    // The phone asks the password once, with a show button; the wide form keeps the second field.
    if (wide && password !== password2) { setError('Le due password non coincidono.'); return; }
    if (!terms) { setError('Per creare l’account devi accettare le Condizioni di vendita e l’Informativa privacy.'); return; }
    setBusy(true); setError(''); setInfo('');
    const { data, error: e } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: webRedirect(next) } });
    setBusy(false);
    if (e) {
      setError(e.code === 'user_already_exists' ? 'Esiste già un account con questa email: accedi.'
        : e.code === 'weak_password' ? `Password troppo debole. ${PASSWORD_HELP}`
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
      hint={mode === 'register' ? PASSWORD_HELP : undefined} error={error} style={{ paddingRight: 80 }} />
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
    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 18 }}>Voglio ricevere offerte e novità CASA & TE via email (facoltativo, revocabile in ogni momento).</Text>
  </Checkbox>;

  // Phone: one task per page on a plain white sheet (welcome → sign in / code / account → privacy → email code),
  // a large sans title, outlined fields and one pill button at the bottom.
  if (!wide) {
    const verifying = !!awaiting;
    const back = () => {
      if (busy) return;
      if (verifying) { setAwaiting(null); setCode(''); setError(''); setInfo(''); return; }
      if (step === 'privacy') { setStep('register'); setError(''); return; }
      if (step !== 'welcome') { switchMode('password'); setStep('welcome'); return; }
      if (router.canGoBack()) router.back(); else router.replace('/');
    };
    const go = (to: Step) => { switchMode(to === 'code' ? 'code' : to === 'login' ? 'password' : 'register'); setStep(to); };
    const rules = passwordRules(password);
    const toPrivacy = () => {
      if (!isEmail(email)) { setError('Inserisci un indirizzo email valido.'); return; }
      if (!isValidPassword(password)) { setError(`Scegli una password valida: ${PASSWORD_HELP.toLowerCase()}`); return; }
      setError(''); setStep('privacy');
    };
    const full = code.length >= 6;
    const boxes = Math.max(6, code.length);
    const page = verifying ? 'verify' : step;

    const emailInput = <AuthField label="Email" value={email} onChangeText={(v) => { setEmail(v); setError(''); }} keyboardType="email-address" autoCapitalize="none"
      autoComplete="email" textContentType="emailAddress" autoFocus returnKeyType={step === 'code' ? 'go' : 'next'}
      onSubmitEditing={step === 'code' ? sendCode : undefined} />;
    const passwordInput = <AuthField label="Password" value={password} onChangeText={(v) => { setPassword(v); setError(''); }} secureTextEntry={!showPassword}
      autoCapitalize="none" autoCorrect={false} autoComplete={step === 'register' ? 'new-password' : 'current-password'}
      textContentType={step === 'register' ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={step === 'register' ? toPrivacy : signIn}
      right={<Pressable onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" accessibilityLabel={showPassword ? 'Nascondi la password' : 'Mostra la password'}
        hitSlop={10} style={styles.eye}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={24} color={colors.text} strokeWidth={1.8} /></Pressable>} />;
    const errorLine = !!error && <Text style={styles.aError} accessibilityLiveRegion="polite">{error}</Text>;

    const body = page === 'welcome' ? <View style={{ flex: 1 }}>
      <View style={styles.aHero}>
        <View style={styles.aHeroSign}><BrandLogo width={210} tagline color={SIGN.ink} /></View>
      </View>
      <Text style={styles.aTitle}>{'Benvenuto in CASA\u00A0&\u00A0TE'}</Text>
      <Text style={styles.aText}>Accedi o registrati: ordini dal tuo negozio, ritiri gratis e segui ogni ordine dall’app.</Text>
    </View>
    : page === 'login' ? <View>
      <SmallLogo />
      <Text style={styles.aTitle}>Accedi</Text>
      <Text style={styles.aText}>Inserisci email e password.</Text>
      <View style={styles.aFields}>{emailInput}{passwordInput}</View>
      {errorLine}
      <View style={styles.aLinks}>
        <TextLink label="Password dimenticata?" onPress={() => go('code')} />
        <TextLink label="Accedi con un codice email" onPress={() => go('code')} />
      </View>
    </View>
    : page === 'code' ? <View>
      <SmallLogo />
      <Text style={styles.aTitle}>Accedi con un codice</Text>
      <Text style={styles.aText}>Ti inviamo un codice via email: niente password. Funziona anche se l’hai dimenticata.</Text>
      <View style={styles.aFields}>{emailInput}</View>
      {errorLine}
      <Text style={styles.aNote}>Password dimenticata? Accedi con il codice, poi vai su Profilo → Password per sceglierne una nuova.</Text>
    </View>
    : page === 'register' ? <View>
      <SmallLogo />
      <Text style={styles.aTitle}>Crea il tuo account</Text>
      <Text style={styles.aText}>Bastano email e password.</Text>
      <View style={styles.aFields}>{emailInput}{passwordInput}</View>
      <View style={styles.aRules} accessibilityLabel={`Password: ${rules.map((r) => `${r.label} ${r.ok ? 'fatto' : 'da fare'}`).join(', ')}`}>
        {rules.map((r) => <View key={r.label} style={styles.aRule}>
          {r.ok ? <Icon name="check" size={16} color={colors.green} strokeWidth={2.6} /> : <View style={styles.aDot} />}
          <Text style={[styles.aRuleText, r.ok && { color: colors.green }]}>{r.label}</Text>
        </View>)}
      </View>
      {errorLine}
    </View>
    : page === 'privacy' ? <View>
      <Text style={[styles.aTitle, { marginTop: 8 }]}>Preferenze privacy</Text>
      <Text style={styles.aText}>Un’ultima cosa prima di creare l’account di <Text style={{ fontFamily: fonts.sansBold }}>{cleanEmail}</Text>.</Text>
      <View style={styles.aToggles}>
        <ToggleRow value={terms} onChange={(v) => { setTerms(v); setError(''); }} required
          label="Ho letto e accetto le Condizioni di vendita e l’Informativa privacy (obbligatorio)." />
        <ToggleRow value={marketing} onChange={setMarketing}
          label="Voglio ricevere offerte e novità CASA & TE via email. Puoi cambiare idea quando vuoi." />
      </View>
      {errorLine}
      <View style={styles.aRuleLine} />
      <TextLink label="Condizioni di vendita" onPress={() => router.push('/legal/terms')} external />
      <TextLink label="Informativa privacy" onPress={() => router.push('/legal/privacy')} external />
      <Text style={styles.aNote}>Dopo, ti inviamo un codice via email per confermare l’indirizzo.</Text>
    </View>
    : <View>
      <SmallLogo />
      <Text style={styles.aTitle}>{awaiting === 'signup' ? 'Conferma la tua email' : 'Controlla la tua email'}</Text>
      <Text style={styles.aText}>Abbiamo inviato un codice a <Text style={{ fontFamily: fonts.sansBold }}>{email.trim()}</Text>. Scrivilo qui sotto; controlla anche lo spam.</Text>
      <Pressable style={styles.boxes} onPress={() => codeRef.current?.focus()} accessible={false}>
        {Array.from({ length: boxes }, (_, i) => <View key={i} style={[styles.box, i === code.length && styles.boxOn]}>
          <Text style={styles.boxText}>{code[i] ?? ''}</Text></View>)}
        <TextInput ref={codeRef} value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 10)); setError(''); }} keyboardType="number-pad" maxLength={10}
          autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={verify} accessibilityLabel="Codice ricevuto via email"
          caretHidden style={styles.codeInput} />
      </Pressable>
      {errorLine}
      <View style={styles.aLinksRow}>
        <TextLink label="Invia di nuovo il codice" onPress={awaiting === 'signup' ? resendConfirmation : sendCode} />
        <TextLink label="Cambia email" onPress={() => { if (busy) return; setAwaiting(null); setCode(''); setError(''); setInfo(''); if (step === 'privacy') setStep('register'); }} />
      </View>
    </View>;

    const footer = page === 'welcome' ? <View style={styles.aPair}>
      <AuthButton title="Accedi" kind="outline" onPress={() => go('login')} style={{ flex: 1 }} />
      <AuthButton title="Registrati" onPress={() => go('register')} style={{ flex: 1 }} />
    </View>
    : page === 'login' ? <AuthButton title="Accedi" busy={busy} onPress={signIn} />
    : page === 'code' ? <AuthButton title="Invia il codice" busy={busy} onPress={sendCode} />
    : page === 'register' ? <AuthButton title="Continua" onPress={toPrivacy} />
    : page === 'privacy' ? <AuthButton title="Crea account" busy={busy} disabled={!terms} onPress={register} />
    : <AuthButton title={full ? (awaiting === 'signup' ? 'Conferma e accedi' : 'Accedi') : `Inserisci le ${boxes} cifre`} busy={busy} disabled={!full} onPress={verify} />;

    return <SafeAreaView style={styles.aSafe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <BackKey onBack={back} />
      <View style={styles.aBar}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={page === 'welcome' ? 'Chiudi' : 'Indietro'} hitSlop={10}
          style={({ pressed }) => [styles.aBarButton, pressed && { opacity: 0.6 }]}>
          <Icon name={page === 'welcome' ? 'close' : 'back'} size={page === 'welcome' ? 24 : 28} color={colors.text} strokeWidth={1.9} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.aBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View key={page} entering={FadeIn.duration(180)} style={{ flexGrow: 1 }}>{body}</Animated.View>
        </ScrollView>
        <View style={styles.aFooter}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>;
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
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.text, lineHeight: 19 }}>Ho letto e accetto le <Text style={{ color: colors.green }} onPress={() => router.push('/legal/terms')}>Condizioni di vendita</Text> e l'<Text style={{ color: colors.green }} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text> *</Text>
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

/** Android back: one page back in the flow instead of closing it. */
function BackKey({ onBack }: { onBack: () => void }) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { latest.current(); return true; });
    return () => sub.remove();
  }, []);
  return null;
}

function SmallLogo() {
  return <View style={styles.aSign}><BrandLogo width={96} color={SIGN.ink} /></View>;
}

/** Outlined field: the label sits inside as a placeholder and moves up to the edge once there is text or focus. */
function AuthField({ label, right, value, ...input }: TextInputProps & { label: string; value: string; right?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  const raised = focused || !!value;
  return <View style={[styles.field, focused && styles.fieldOn]}>
    {raised && <Text style={[styles.fieldLabel, focused && { color: colors.green }]}>{label}</Text>}
    <TextInput {...input} value={value} placeholder={raised ? '' : label} placeholderTextColor="#8C9189" accessibilityLabel={label}
      onFocus={(e) => { setFocused(true); input.onFocus?.(e); }} onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
      style={[styles.fieldInput, raised && { paddingTop: 14 }]} />
    {right}
  </View>;
}

/** The pill at the bottom of each page: brand green with white text, or outlined. */
function AuthButton({ title, onPress, kind = 'fill', busy, disabled, style }: {
  title: string; onPress: () => void; kind?: 'fill' | 'outline'; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  return <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }}
    style={({ pressed }) => [styles.pill, kind === 'outline' ? styles.pillOutline : styles.pillFill, disabled && styles.pillOff, pressed && { opacity: 0.85 }, style]}>
    {busy ? <ActivityIndicator color={kind === 'fill' ? '#FFFFFF' : colors.text} />
      : <Text style={[styles.pillText, kind === 'fill' && { color: '#FFFFFF' }, disabled && { color: colors.muted }]}>{title}</Text>}
  </Pressable>;
}

function TextLink({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="link" hitSlop={6} style={styles.tLink}>
    <Text style={styles.tLinkText}>{label}</Text>
    {external && <Icon name="arrow" size={16} color={colors.green} strokeWidth={2} />}
  </Pressable>;
}

/** A consent line with an on/off switch on the right. */
function ToggleRow({ label, value, onChange, required }: { label: string; value: boolean; onChange: (v: boolean) => void; required?: boolean }) {
  return <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={styles.tRow}>
    <Text style={styles.tText}>{required && <Text style={{ color: colors.danger }}>* </Text>}{label}</Text>
    <View style={[styles.switch, value && styles.switchOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  aSafe: { flex: 1, backgroundColor: '#FFFFFF' },
  aBar: { height: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  aBarButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  aBody: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 24 },
  aHero: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  aHeroSign: { paddingVertical: 26, paddingHorizontal: 30, borderRadius: 24, backgroundColor: SIGN.ground },
  aSign: { alignSelf: 'flex-start', marginBottom: 26, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: SIGN.ground },
  aTitle: { fontSize: 34, lineHeight: 40, letterSpacing: -0.6, fontFamily: fonts.sansBold, color: colors.text },
  aText: { marginTop: 14, fontSize: 17, lineHeight: 24, fontFamily: fonts.sans, color: '#2E352F' },
  aNote: { marginTop: 18, fontSize: 14.5, lineHeight: 21, fontFamily: fonts.sans, color: colors.muted },
  aFields: { marginTop: 28, gap: 18 },
  aError: { marginTop: 12, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.sansSemiBold, color: colors.danger },
  aLinks: { marginTop: 18, alignItems: 'flex-start' },
  aLinksRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  aRules: { marginTop: 16, gap: 8 },
  aRule: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A3A79F', marginHorizontal: 5 },
  aRuleText: { fontSize: 15, fontFamily: fonts.sans, color: colors.muted },
  aToggles: { marginTop: 26, gap: 22 },
  aRuleLine: { height: 1, backgroundColor: colors.line, marginTop: 26, marginBottom: 6 },
  aFooter: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 16, backgroundColor: '#FFFFFF' },
  aPair: { flexDirection: 'row', gap: 14 },
  field: { minHeight: 60, borderWidth: 1.5, borderColor: '#8C9189', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  fieldOn: { borderColor: colors.green, borderWidth: 2, paddingHorizontal: 15.5 },
  fieldLabel: { position: 'absolute', left: 16, top: 7, fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  fieldInput: { flex: 1, height: 58, fontSize: 17, fontFamily: fonts.sans, color: colors.text, outlineWidth: 0, outlineStyle: 'none' } as object,
  eye: { paddingLeft: 10, paddingVertical: 8 },
  pill: { height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  pillFill: { backgroundColor: colors.action },
  pillOutline: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#5F665C' },
  pillOff: { backgroundColor: colors.well, borderColor: colors.well },
  pillText: { fontSize: 18, fontFamily: fonts.sansSemiBold, color: colors.text },
  tLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  tLinkText: { fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.green, textDecorationLine: 'underline' },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  tText: { flex: 1, fontSize: 16, lineHeight: 23, fontFamily: fonts.sans, color: colors.text },
  switch: { width: 54, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#5F665C', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: '#FFFFFF' },
  switchOn: { backgroundColor: colors.green, borderColor: colors.green },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#5F665C' },
  knobOn: { backgroundColor: '#FFFFFF', transform: [{ translateX: 22 }] },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 28 },
  box: { flex: 1, height: 60, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#8C9189', alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderWidth: 2, borderColor: colors.green },
  boxText: { fontSize: 24, fontFamily: fonts.heavy, color: colors.text },
  codeInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, fontSize: 1, color: 'transparent' } as object,
  show: { position: 'absolute', right: 14, top: 38, paddingVertical: 4 },
  showText: { fontSize: 13, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  link: { fontSize: 14, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500', textDecorationLine: 'underline' },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 24, marginBottom: 18 },
  newHere: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans, marginBottom: 10, textAlign: 'center' },
  legal: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 20, lineHeight: 17 },
});
