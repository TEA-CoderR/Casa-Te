import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Screen } from '@/components/Screen';
import { EmptyState, Loading, Notice, PrimaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/config/theme';
import { fetchFlyers } from '@/lib/api';
import { useLayout } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

/** "Valido dal 1 al 31 ottobre", from whatever dates the flyer has. */
function validity(from: string | null, to: string | null): string {
  if (from && to) return `Valido dal ${day(from)} al ${day(to)}`;
  if (to) return `Valido fino al ${day(to)}`;
  if (from) return `Valido dal ${day(from)}`;
  return '';
}

/** One page image at its own proportions (flyers are usually portrait). */
function Page({ uri, label }: { uri: string; label: string }) {
  const [ratio, setRatio] = useState(0.707);
  useEffect(() => { Image.getSize(uri, (w, h) => { if (w && h) setRatio(w / h); }, () => {}); }, [uri]);
  return <Image source={{ uri }} accessibilityLabel={label} resizeMode="contain" style={[styles.page, { aspectRatio: ratio }]} />;
}

/** Volantino: the current flyer(s) published from the admin, pages to scroll and the PDF to download. */
export default function FlyerScreen() {
  const { data, loading, error, refetch } = useQuery('flyers', fetchFlyers);
  const { wide } = useLayout();
  const open = (url: string) => Platform.OS === 'web' && typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener') : Linking.openURL(url);

  return <Screen stack ground={wide ? undefined : colors.page} refreshing={loading && !!data} onRefresh={refetch} maxWidth={760}
    contentContainerStyle={{ padding: wide ? 24 : 12, gap: 12 }}>
    {wide && <Stack.Screen options={{ title: 'Volantino', header: () => <SiteHeader /> }} />}
    {error && !data ? <Notice tone="error" message="Impossibile caricare il volantino. Controlla la connessione e riprova." />
      : !data ? <Loading />
      : !data.length ? <EmptyState icon="flyer" title="Nessun volantino al momento" message="Il nuovo volantino arriva presto. Intanto guarda le offerte del negozio online.">
          <PrimaryButton title="Vedi le offerte" onPress={() => router.push({ pathname: '/catalog', params: { offerte: '1', evidenza: '', category: '' } })} />
        </EmptyState>
      : data.map((flyer) => <View key={flyer.id} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.badge}><Icon name="flyer" size={22} color={colors.green} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} accessibilityRole="header">{flyer.title}</Text>
              {!!validity(flyer.valid_from, flyer.valid_to) && <Text style={styles.validity}>{validity(flyer.valid_from, flyer.valid_to)}</Text>}
            </View>
          </View>
          {!!flyer.pdf && <Pressable onPress={() => open(flyer.pdf!)} accessibilityRole="link" style={({ pressed }) => [styles.pdf, pressed && { opacity: 0.8 }]}>
            <Icon name="arrow" size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.pdfText}>{flyer.pages.length ? 'Scarica il PDF' : 'Apri il volantino (PDF)'}</Text>
          </Pressable>}
          {flyer.pages.map((uri, i) => <Page key={uri} uri={uri} label={`${flyer.title}, pagina ${i + 1} di ${flyer.pages.length}`} />)}
        </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  validity: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.muted, marginTop: 1 },
  pdf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 24, backgroundColor: colors.green },
  pdfText: { fontSize: 16, fontFamily: fonts.sansBold, fontWeight: '700', color: '#FFFFFF' },
  page: { width: '100%', borderRadius: 6, backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.line },
});
