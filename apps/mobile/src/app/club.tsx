import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { friendlyError, type ClubOffer } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, Notice, PrimaryButton, SecondaryButton } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchClubOffers, fetchProfile, setClubMembership } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useClubSettings } from '@/lib/hooks';
import { useUser } from '@/store/session';

const PERKS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'sparkle', title: 'Offerte riservate', text: 'Codici sconto solo per i membri, sempre visibili qui.' },
  { icon: 'heart', title: 'Gratis, sempre', text: "L'iscrizione non costa nulla e puoi uscire quando vuoi." },
  { icon: 'cart', title: 'Al checkout', text: 'Usa i codici sia con il ritiro in negozio sia con la spedizione.' },
];

const offerText = (o: ClubOffer) => o.kind === 'percent' ? `${o.value}% di sconto`
  : o.kind === 'fixed' ? `${formatEuro(o.value)} di sconto` : 'Spedizione gratuita';

export default function ClubScreen() {
  const user = useUser();
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const member = !!profile.data?.club_member_since;
  const offers = useQuery(user && member ? `club-offers:${user.id}` : null, fetchClubOffers);
  const club = useClubSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (join: boolean) => {
    setBusy(true); setError('');
    try { await setClubMembership(join); await profile.refetch(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  return <Screen stack>
    <Stack.Screen options={{ title: 'Casa & Te Club' }} />
    <View style={styles.hero}>
      <Icon name="crown" size={40} color="#B07A1E" strokeWidth={1.3} />
      <Text style={styles.title} accessibilityRole="header">Casa & Te Club</Text>
      <Text style={styles.lead}>{club.tagline}</Text>
      {member && <Text style={styles.since}>Membro dal {new Date(profile.data!.club_member_since!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>}
    </View>

    {PERKS.map((p) => <View key={p.title} style={styles.perk}>
      <View style={styles.perkIcon}><Icon name={p.icon} size={22} strokeWidth={1.4} /></View>
      <View style={{ flex: 1 }}><Text style={styles.perkTitle}>{p.title}</Text><Text style={styles.perkText}>{p.text}</Text></View>
    </View>)}

    {!!error && <Notice tone="error" message={error} />}
    {!user ? <View style={{ marginTop: 20 }}><PrimaryButton title="Accedi per iscriverti" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/club' } })} /></View>
      : profile.loading && !profile.data ? <Loading />
      : !member ? (club.enabled ? <View style={{ marginTop: 20 }}><PrimaryButton title="Iscriviti gratis" onPress={() => toggle(true)} loading={busy} /></View>
        : <View style={{ marginTop: 20 }}><Notice message="Al momento il Club non accetta nuove iscrizioni." /></View>)
      : <>
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
          <View style={{ marginTop: 28 }}><SecondaryButton title="Esci dal Club" onPress={() => toggle(false)} disabled={busy} /></View>
        </>}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.sand, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, marginBottom: 18 },
  title: { fontSize: 30, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  lead: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans },
  since: { fontSize: 13, color: colors.green, fontFamily: fonts.sansMedium, marginTop: 4 },
  perk: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line },
  perkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  perkTitle: { fontSize: 16, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  perkText: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.sans, lineHeight: 18 },
  section: { fontSize: 22, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 10 },
  empty: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans, lineHeight: 20 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  offerTitle: { fontSize: 16, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  offerMeta: { fontSize: 12, color: colors.muted, marginTop: 3, fontFamily: fonts.sans },
  code: { fontSize: 15, fontFamily: fonts.sansSemiBold, fontWeight: '600', color: colors.green, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  howto: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans, marginTop: 6 },
});
