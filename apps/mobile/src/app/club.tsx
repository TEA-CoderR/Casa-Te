import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { friendlyError, isPhone, type ClubOffer, type ProfileRow } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { Checkbox, Loading, Notice, PrimaryButton, SecondaryButton, TextField } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchClubOffers, fetchProfile, joinClub, setClubMembership } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useClubSettings, useLayout } from '@/lib/hooks';

/** Photo of the real Casa & Te card (straightened from the owner's photo). */
const CARD = require('../../assets/club-card.webp');
import { useUser } from '@/store/session';
import { useClubStore } from '@/store/club';
import { MemberCardLink, MemberCardView } from '@/components/MemberCard';

/** What the Club gives, one line each (the card section below covers linking an existing card). */
const PERKS = [
  'Prezzi Soci anche online, come in negozio',
  'Codici sconto riservati ai Soci',
  'Gratis, e puoi uscire quando vuoi',
];

const offerText = (o: ClubOffer) => o.kind === 'percent' ? `${o.value}% di sconto`
  : o.kind === 'fixed' ? `${formatEuro(o.value)} di sconto` : 'Spedizione gratuita';

export default function ClubScreen() {
  const user = useUser();
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const member = !!profile.data?.club_member_since;
  const offers = useQuery(user && member ? `club-offers:${user.id}` : null, fetchClubOffers);
  const club = useClubSettings();
  const { wide } = useLayout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const leave = async () => {
    setBusy(true); setError('');
    try { await setClubMembership(false); useClubStore.getState().set(false); await profile.refetch(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const card = profile.data?.member_card_number ?? null;
  const cardSection = !user || !profile.data ? null : <>
    <Text style={styles.section} accessibilityRole="header">{card ? 'La tua tessera' : 'Hai già la tessera Casa & Te?'}</Text>
    {card ? <MemberCardView card={card} onUnlinked={() => void profile.refetch()} />
      : <MemberCardLink onLinked={() => void profile.refetch()} />}
  </>;

  const since = member ? new Date(profile.data!.club_member_since!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  // Phone: the shop's real Club card hangs from the band, like the store card on the home page.
  const band = wide ? undefined : <BrandHeader inScroll title="Casa & Te Club" titleSize={30} pad={[14, 16, 96]} left={<HeaderBack onPress={back} />} />;

  return <Screen stack header={wide ? undefined : <StatusBand />} top={band} ground={colors.page}
    contentContainerStyle={wide ? undefined : { padding: 0, paddingBottom: 32 }} bodyStyle={wide ? undefined : { paddingHorizontal: 16 }}>
    <Stack.Screen options={{ title: 'Casa & Te Club', headerShown: wide }} />
    <View style={[styles.cardWrap, !wide && { marginTop: -88 }]}>
      <Image source={CARD} accessibilityLabel="La tessera Casa & Te" resizeMode="cover" style={styles.cardImage} />
    </View>
    <Text style={styles.title} accessibilityRole="header">Sei uno di famiglia</Text>
    <Text style={styles.lead}>{member ? `Sei nel Club dal ${since}.` : 'La tessera del negozio, ora anche online.'}</Text>

    <View style={styles.perks}>{PERKS.map((p) => <View key={p} style={styles.perk}>
      <Icon name="check" size={18} color={colors.green} strokeWidth={2.6} />
      <Text style={styles.perkText}>{p}</Text>
    </View>)}</View>

    {!!error && <Notice tone="error" message={error} />}
    {!user ? <View style={{ marginTop: 20 }}><PrimaryButton title="Accedi per iscriverti o collegare la tessera" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/club' } })} /></View>
      : profile.loading && !profile.data ? <Loading />
      : !member ? <>
          {club.enabled ? !profile.data ? <View style={{ marginTop: 20 }}><Notice tone="error" message="Impossibile caricare i tuoi dati. Riprova più tardi." /></View>
            : <JoinForm profile={profile.data} email={user.email ?? ''}
              onJoined={async () => { useClubStore.getState().set(true); await profile.refetch(); }} />
            : <View style={{ marginTop: 20 }}><Notice message="Al momento il Club non accetta nuove iscrizioni." /></View>}
          {cardSection}
        </>
      : <>
          {cardSection}
          <Text style={styles.section} accessibilityRole="header">Le tue offerte</Text>
          {offers.loading && !offers.data ? <Loading /> : !offers.data?.length
            ? <Text style={styles.empty}>Al momento non ci sono offerte attive. Torna a trovarci presto.</Text>
            : offers.data.map((o) => <View key={o.code} style={styles.offer}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerTitle}>{o.description || offerText(o)}</Text>
                  <Text style={styles.offerMeta}>{offerText(o)}{o.min_subtotal_cents ? ` · minimo ${formatEuro(o.min_subtotal_cents)}` : ''}
                    {o.ends_at ? ` · fino al ${new Date(o.ends_at).toLocaleDateString('it-IT')}` : ''}</Text>
                </View>
                <Text selectable style={styles.code} accessibilityLabel={`Codice ${o.code}`}>{o.code}</Text>
              </View>)}
          <Text style={styles.howto}>Inserisci il codice al checkout, nella sezione "Codice sconto".</Text>
          <View style={{ marginTop: 28 }}><SecondaryButton title="Esci dal Club" onPress={leave} disabled={busy} /></View>
        </>}
  </Screen>;
}

/** Joining needs name, phone, the account email and the privacy notice (checked again by join_club). */
function JoinForm({ profile, email, onJoined }: { profile: ProfileRow; email: string; onJoined: () => Promise<void> }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const [f = '', ...rest] = (profile.full_name ?? '').trim().split(/\s+/);
    setFirst(f); setLast(rest.join(' ')); setPhone(profile.phone ?? ''); setMarketing(profile.marketing_opt_in);
  }, [profile.id]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!first.trim()) e.first = 'Inserisci il nome.';
    if (!last.trim()) e.last = 'Inserisci il cognome.';
    if (!isPhone(phone) || phone.replace(/\D/g, '').length < 8) e.phone = 'Inserisci un numero di telefono valido.';
    if (!email) e.email = 'Al tuo account manca un indirizzo email.';
    if (!privacy) e.privacy = "Per iscriverti devi accettare l'informativa privacy.";
    setErrors(e); setError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await joinClub({ fullName: `${first.trim()} ${last.trim()}`, phone: phone.trim(), privacy, marketing }); await onJoined(); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  };

  return <View style={styles.form}>
    <Text style={styles.formTitle} accessibilityRole="header">Iscriviti gratis</Text>
    <Text style={styles.formLead}>Bastano pochi dati: li usiamo solo per il Club.</Text>
    <View style={styles.formRow}>
      <View style={{ flex: 1 }}><TextField label="Nome" value={first} onChangeText={setFirst} autoComplete="given-name" textContentType="givenName" error={errors.first} /></View>
      <View style={{ flex: 1 }}><TextField label="Cognome" value={last} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" error={errors.last} /></View>
    </View>
    <TextField label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
      placeholder="Il tuo numero di cellulare" error={errors.phone} />
    <TextField label="Email" value={email} editable={false} error={errors.email} hint="È l'email del tuo account." style={styles.readOnly} />
    <Checkbox checked={privacy} onChange={setPrivacy}>
      <Text style={styles.check}>Ho letto l'<Text style={styles.link} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text> del Club <Text style={{ color: colors.danger }}>*</Text></Text>
    </Checkbox>
    {!!errors.privacy && <Text style={styles.fieldError}>{errors.privacy}</Text>}
    <Checkbox checked={marketing} onChange={setMarketing}>
      <Text style={styles.check}>Voglio ricevere offerte e novità via email (facoltativo)</Text>
    </Checkbox>
    {!!error && <Notice tone="error" message={error} />}
    <View style={{ marginTop: 8 }}><PrimaryButton title="Iscriviti al Club" onPress={submit} loading={busy} icon="crown" /></View>
  </View>;
}

const styles = StyleSheet.create({
  form: { marginTop: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 4 },
  formTitle: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display, color: colors.text },
  formLead: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans, marginBottom: 10 },
  formRow: { flexDirection: 'row', gap: 10 },
  check: { fontSize: 13, color: colors.text, lineHeight: 19, fontFamily: fonts.sans },
  link: { color: colors.green, textDecorationLine: 'underline' },
  readOnly: { backgroundColor: colors.cream, color: colors.muted },
  fieldError: { fontSize: 12, color: colors.danger, fontFamily: fonts.sans, marginTop: -4, marginBottom: 6 },
  cardWrap: { alignSelf: 'center', width: '100%', maxWidth: 420, aspectRatio: 1000 / 631, borderRadius: 18, backgroundColor: colors.green,
    shadowColor: '#0A180C', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  cardImage: { width: '100%', height: '100%', borderRadius: 18 },
  title: { fontSize: 30, lineHeight: 35, fontFamily: fonts.display, color: colors.text, textAlign: 'center', marginTop: 24 },
  lead: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans, marginTop: 4 },
  perks: { marginTop: 20, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  perk: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12 },
  perkText: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.sansSemiBold, color: colors.text },
  section: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display, color: colors.text, marginTop: 28, marginBottom: 10 },
  empty: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans, lineHeight: 20 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  offerTitle: { fontSize: 16, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  offerMeta: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  code: { fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.green, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  howto: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans, marginTop: 6 },
});
