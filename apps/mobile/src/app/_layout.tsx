import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from '@/config/theme';
import { PersistenceGate } from '@/components/PersistenceGate';
import { AppGate } from '@/components/AppGate';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { usePreferences } from '@/store/preferences';
import { listenForPushTaps, syncPushToken } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import * as SplashScreen from 'expo-splash-screen';
import { HeaderBack } from '@/components/BrandHeader';
import { Monogram } from '@/components/ClubPass';
import { useLayout } from '@/lib/hooks';
import { isConfigured } from '@/lib/supabase';
import { startSessionListener } from '@/store/session';
import { startClubListener } from '@/store/club';

export const unstable_settings = { initialRouteName: '(tabs)' };

function NotConfigured() {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: colors.background, gap: 12 }}>
    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 22, fontWeight: '600', color: colors.greenDark }}>Configurazione mancante</Text>
    <Text style={{ color: colors.muted, lineHeight: 21 }}>
      Copia apps/mobile/.env.example in apps/mobile/.env e inserisci l'URL e la chiave anon del progetto Supabase, poi riavvia Expo.
    </Text>
  </View>;
}


/**
 * Shown by expo-router instead of a white screen when a page throws while rendering: what happened in plain words,
 * a retry and the way home. Plain React Native only (fonts or providers may be what failed).
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  SplashScreen.hideAsync().catch(() => {});
  return <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
    <Text style={{ fontSize: 22, lineHeight: 27, fontWeight: '700', color: colors.text, textAlign: 'center' }} accessibilityRole="header">Qualcosa è andato storto</Text>{/* ui-check: allow (error screen: fonts may not be loaded) */}
    <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: 8 }}>Riprova: se il problema continua, chiudi e riapri l’app.</Text>{/* ui-check: allow (error screen: fonts may not be loaded) */}
    <Pressable onPress={retry} accessibilityRole="button" style={{ marginTop: 24, height: 54, paddingHorizontal: 32, borderRadius: 27, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Riprova</Text>{/* ui-check: allow (error screen: fonts may not be loaded) */}
    </Pressable>
    <Pressable onPress={() => { router.replace('/'); void retry(); }} accessibilityRole="link" hitSlop={8} style={{ marginTop: 18 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.green, textDecorationLine: 'underline' }}>Torna alla home</Text>{/* ui-check: allow (error screen: fonts may not be loaded) */}
    </Pressable>
  </View>;
}

/** The opening animation on phones; none on the first launch, where the welcome opens with the logo itself. */
function OpeningSplash({ wide }: { wide: boolean }) {
  const onboarded = usePreferences((p) => p.onboarded);
  return <AnimatedSplash ready skip={wide || !onboarded} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Latin subsets of EB Garamond and Bodoni Moda (assets/fonts, SIL Open Font License).
    EBGaramond_400Regular: require('../../assets/fonts/EBGaramond_400Regular.ttf'),
    EBGaramond_500Medium: require('../../assets/fonts/EBGaramond_500Medium.ttf'),
    BodoniModa_600SemiBold: require('../../assets/fonts/BodoniModa_600SemiBold.ttf'),
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold,
  });
  const { wide } = useLayout();
  useEffect(() => { if (isConfigured) { startSessionListener(); startClubListener(); } }, []);
  // Push: a tapped notification opens its order; signing in saves this phone for that customer (if turned on).
  useEffect(() => {
    if (!isConfigured) return;
    const stopTaps = listenForPushTaps();
    void syncPushToken().catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN') void syncPushToken().catch(() => {}); });
    return () => { stopTaps(); data.subscription.unsubscribe(); };
  }, []);
  if (!isConfigured) return <><NotConfigured /><AnimatedSplash ready skip /></>;
  // Native needs the faces registered before first render; the web shop falls back to system fonts meanwhile.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;
  return (
    <PersistenceGate>
      {/* Phones: every page starts with the green awning band (design F), so light status bar icons. */}
      <StatusBar style={wide ? 'dark' : 'light'} />
      <AppGate>
      <Stack
        screenOptions={{
          headerTintColor: wide ? colors.text : colors.bandText,
          headerTitleStyle: wide ? { fontFamily: fonts.serif, fontSize: 21, color: colors.text }
            : { fontFamily: fonts.display, fontSize: 22, color: colors.bandText },
          headerShadowVisible: false,
          headerTitleAlign: wide ? 'center' : 'left',
          headerStyle: { backgroundColor: wide ? colors.background : colors.band },
          // Phones: stack pages (checkout, order, account…) share the white band of the tab pages.
          // Phones: stack pages (checkout, addresses, account…) get the same band as the others: green with the monogram
          // texture and the round white-on-green back button.
          headerBackground: wide ? undefined : () => <View style={{ flex: 1, backgroundColor: colors.band, overflow: 'hidden' }}>
            <Monogram width={300} color={colors.bandLogo} opacity={0.07} style={{ position: 'absolute', right: -110, top: -50 }} /></View>,
          ...(wide ? {} : {
            headerLeft: () => <View style={{ marginLeft: Platform.OS === 'web' ? 16 : 0, marginRight: 4 }}>
              <HeaderBack onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /></View>,
          }),
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: wide ? colors.background : colors.page },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'CASA & TE' }} />
        <Stack.Screen name="product/[id]" options={{ title: '' }} />
        <Stack.Screen name="checkout/index" options={{ title: 'Consegna e pagamento' }} />
        <Stack.Screen name="checkout/return" options={{ title: 'Pagamento', headerBackVisible: false, headerLeft: () => null, gestureEnabled: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Ordine' }} />
        <Stack.Screen name="reso/[orderId]" options={{ title: 'Reso e assistenza' }} />
        <Stack.Screen name="auth/sign-in" options={{ title: 'Accedi', presentation: 'modal' }} />
        <Stack.Screen name="account/edit" options={{ title: 'Dati personali' }} />
        <Stack.Screen name="account/password" options={{ title: 'Password' }} />
        <Stack.Screen name="account/addresses" options={{ title: 'Indirizzi' }} />
        <Stack.Screen name="account/delete" options={{ title: 'Elimina account' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: 'Informazioni legali' }} />
        <Stack.Screen name="aiuto" options={{ title: 'Domande frequenti' }} />
        <Stack.Screen name="club" options={{ title: 'Casa & Te Club' }} />
        <Stack.Screen name="volantino" options={{ title: 'Volantino' }} />
        <Stack.Screen name="benvenuto" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
      </Stack>
      </AppGate>
      <OpeningSplash wide={wide} />
    </PersistenceGate>
  );
}
