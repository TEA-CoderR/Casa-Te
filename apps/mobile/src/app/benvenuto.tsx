import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { BrandLogo } from '@/components/BrandLogo';
import { ClubPass, Monogram } from '@/components/ClubPass';
import { Icon } from '@/components/Icon';
import { RadioMark } from '@/components/UI';
import { storeShortName } from '@/components/StoreSheet';
import { colors, fonts } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';

/**
 * First launch of the app (November 2026): three short steps, shown once and skippable.
 * 1. Welcome on the green with the monogram; 2. the store (prices and stock depend on it); 3. sign in, register or go on
 * without an account. Customers already signed in never see it (see (tabs)/_layout).
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const { stores, selected, canChoose } = useStores();
  const setStoreId = usePreferences((s) => s.setStoreId);
  const setOnboarded = usePreferences((s) => s.setOnboarded);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick ?? selected?.id ?? null;
  const done = (signIn = false) => {
    if (chosen) setStoreId(chosen);
    setOnboarded();
    router.replace('/');
    if (signIn) setTimeout(() => router.push({ pathname: '/auth/sign-in', params: { next: '/' } }), 50);
  };
  const skip = <Pressable onPress={() => done()} accessibilityRole="button" hitSlop={10} style={styles.skip}>
    <Text style={styles.skipText}>Salta</Text></Pressable>;
  // With one open store there is nothing to choose: welcome → account, and the store is set on the way.
  const kicker = (n: number) => canChoose ? <Text style={styles.kicker}>PASSO {n} DI 2</Text> : null;
  const start = () => { if (canChoose) { setStep(1); return; } if (chosen) setStoreId(chosen); setStep(2); };

  return <View style={styles.page}>
    <Stack.Screen options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
    <Monogram width={560} color={colors.bandLogo} opacity={0.07} style={{ position: 'absolute', right: -220, top: insets.top + 10 }} />

    {step === 0 && <Animated.View key="s0" entering={FadeIn.duration(400)} style={[styles.fill, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}><BrandLogo width={150} color={colors.bandLogo} /></Animated.View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.Text entering={FadeInDown.delay(250).duration(500)} style={styles.hero} accessibilityRole="header">Per la tua casa{'\n'}e per te.</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(380).duration(500)} style={styles.lead}>
          Ordina online e ritira gratis nel tuo negozio Casa & Te.</Animated.Text>
      </View>
      <Animated.View entering={FadeInDown.delay(520).duration(500)} style={{ gap: 16, marginTop: 36 }}>
        <Pressable onPress={start} accessibilityRole="button" style={({ pressed }) => [styles.white, pressed && { opacity: 0.9 }]}>
          <Text style={styles.whiteText}>Inizia</Text></Pressable>
        <Pressable onPress={() => done(true)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={styles.link}>Hai già un account? <Text style={{ fontFamily: fonts.sansBold, textDecorationLine: 'underline' }}>Accedi</Text></Text></Pressable>
      </Animated.View>
    </Animated.View>}

    {step === 1 && <Animated.View key="s1" entering={FadeInRight.duration(350)} style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}><Pressable onPress={() => setStep(0)} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8} style={styles.back}>
          <Icon name="back" size={20} color="#FFFFFF" strokeWidth={2.4} /></Pressable>{skip}</View>
        {kicker(1)}
        <Text style={styles.title} accessibilityRole="header">Scegli il tuo negozio</Text>
        <Text style={styles.lead}>Vedi prezzi e disponibilità di quel negozio e ritiri lì gratis. Puoi cambiarlo quando vuoi.</Text>
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 16, paddingTop: 20, gap: 10, paddingBottom: 24 }} accessibilityRole="radiogroup">
        {stores.map((s) => {
          const on = chosen === s.id;
          const place = [s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          return <Pressable key={s.id} onPress={() => setPick(s.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[styles.option, on && styles.optionOn]}>
            <RadioMark on={on} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.optionName}>{storeShortName(s).replace(/^(\S+)\s+(?!·)/, '$1 · ')}</Text>
              {!!s.address && <Text style={styles.optionMeta}>{place}</Text>}
              <Text style={styles.optionMeta}>{[s.pickup_enabled ? 'Ritiro gratuito' : 'Solo spedizione', s.opening_hours].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>;
        })}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => { if (chosen) setStoreId(chosen); setStep(2); }} disabled={!chosen} accessibilityRole="button"
          style={({ pressed }) => [styles.green, !chosen && { opacity: 0.4 }, pressed && { opacity: 0.9 }]}>
          <Text style={styles.greenText} numberOfLines={1}>Continua</Text></Pressable>
      </View>
    </Animated.View>}

    {step === 2 && <Animated.View key="s2" entering={FadeInRight.duration(350)} style={[styles.fill, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topRow}><Pressable onPress={() => setStep(canChoose ? 1 : 0)} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={8} style={styles.back}>
        <Icon name="back" size={20} color="#FFFFFF" strokeWidth={2.4} /></Pressable>{skip}</View>
      {kicker(2)}
      <Text style={styles.title} accessibilityRole="header">Il tuo account</Text>
      <ClubPass title={'La tua tessera,\nsempre in tasca.'} style={{ marginTop: 22 }} onPress={() => done(true)} />
      <View style={{ gap: 16, marginTop: 24 }}>
        {([
          ['percent', 'Prezzi Soci e codici sconto', 'Riservati agli iscritti al Club Casa & Te, gratuito.'],
          ['store', 'Ritiro gratuito in negozio', 'Nessuna spesa di spedizione: ordini online, ritiri quando passi.'],
          ['scan', 'Ordine e ritiro sotto controllo', 'Stato dell’ordine aggiornato e codice di ritiro da mostrare in cassa.'],
        ] as const).map(([icon, t, d]) =>
          <View key={t} style={styles.perk}><Icon name={icon} size={22} color={colors.bandLogo} strokeWidth={1.9} />
            <View style={{ flex: 1 }}><Text style={styles.perkText}>{t}</Text><Text style={styles.perkSub}>{d}</Text></View></View>)}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: 16 }}>
        <Pressable onPress={() => done(true)} accessibilityRole="button" style={({ pressed }) => [styles.lime, pressed && { opacity: 0.9 }]}>
          <Text style={styles.limeText}>Accedi o registrati</Text></Pressable>
        <Pressable onPress={() => done()} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={styles.link}>Continua senza account</Text></Pressable>
      </View>
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.band, overflow: 'hidden' },
  fill: { flex: 1, paddingHorizontal: 24 },
  hero: { fontSize: 48, lineHeight: 52, letterSpacing: -1.6, fontFamily: fonts.display, color: '#FFFFFF' },
  lead: { fontSize: 16, lineHeight: 23, fontFamily: fonts.sans, color: colors.bandMuted, marginTop: 12 },
  white: { height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  whiteText: { fontSize: 17, fontFamily: fonts.sansBold, color: colors.text },
  link: { fontSize: 15, fontFamily: fonts.sansMedium, color: colors.bandMuted },
  top: { paddingHorizontal: 24, paddingBottom: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bandButton, alignItems: 'center', justifyContent: 'center' },
  skip: { paddingHorizontal: 6, paddingVertical: 8 },
  skipText: { fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.bandMuted },
  kicker: { fontSize: 12.5, letterSpacing: 1.8, fontFamily: fonts.sansSemiBold, color: colors.bandMuted },
  title: { fontSize: 36, lineHeight: 41, letterSpacing: -1.1, fontFamily: fonts.display, color: '#FFFFFF', marginTop: 6 },
  sheet: { flex: 1, backgroundColor: colors.page, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  option: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF' },
  optionOn: { borderColor: colors.green, borderWidth: 2, padding: 15 },
  optionName: { fontSize: 17, fontFamily: fonts.sansBold, color: colors.text },
  optionMeta: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  bottom: { backgroundColor: colors.page, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderColor: colors.line },
  green: { height: 56, borderRadius: 28, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  greenText: { fontSize: 17, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  lime: { height: 56, borderRadius: 28, backgroundColor: colors.bandLogo, alignItems: 'center', justifyContent: 'center' },
  limeText: { fontSize: 17, fontFamily: fonts.sansBold, color: colors.band },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  perkText: { fontSize: 16, lineHeight: 21, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  perkSub: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.sans, color: colors.bandMuted, marginTop: 1 },
});
