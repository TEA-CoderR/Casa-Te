import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from '@/config/theme';
import { PersistenceGate } from '@/components/PersistenceGate';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { useLayout } from '@/lib/hooks';
import { isConfigured } from '@/lib/supabase';
import { startSessionListener } from '@/store/session';
import { startClubListener } from '@/store/club';

// Web: every weight is its own font file, so the browser must never fake a bolder one on top of it.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '* { font-synthesis: none; -webkit-font-smoothing: antialiased; }';
  document.head.appendChild(style);
}

export const unstable_settings = { initialRouteName: '(tabs)' };

function NotConfigured() {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: colors.background, gap: 12 }}>
    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 22, fontWeight: '600', color: colors.greenDark }}>Configurazione mancante</Text>
    <Text style={{ color: colors.muted, lineHeight: 21 }}>
      Copia apps/mobile/.env.example in apps/mobile/.env e inserisci l'URL e la chiave anon del progetto Supabase, poi riavvia Expo.
    </Text>
  </View>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Latin subsets of EB Garamond and Bodoni Moda (assets/fonts, SIL Open Font License).
    EBGaramond_400Regular: require('../../assets/fonts/EBGaramond_400Regular.ttf'),
    EBGaramond_500Medium: require('../../assets/fonts/EBGaramond_500Medium.ttf'),
    BodoniModa_600SemiBold: require('../../assets/fonts/BodoniModa_600SemiBold.ttf'),
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold,
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold,
  });
  const { wide } = useLayout();
  useEffect(() => { if (isConfigured) { startSessionListener(); startClubListener(); } }, []);
  if (!isConfigured) return <><NotConfigured /><AnimatedSplash ready skip /></>;
  // Native needs the faces registered before first render; the web shop falls back to system fonts meanwhile.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;
  return (<View style={{ flex: 1 }}>
    <PersistenceGate>
      {/* Phones: every page starts with the green awning band (design F), so light status bar icons. */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.text,
          headerTitleStyle: wide ? { fontFamily: fonts.serif, fontSize: 21, color: colors.text }
            : { fontFamily: fonts.display, fontSize: 21, color: colors.bandText },
          headerShadowVisible: false,
          headerTitleAlign: wide ? 'center' : 'left',
          headerStyle: { backgroundColor: wide ? colors.background : colors.band },
          // Phones: stack pages (checkout, order, account…) share the white band of the tab pages.
          headerBackground: wide ? undefined : () => <View style={{ flex: 1, backgroundColor: colors.band, borderBottomWidth: 1, borderColor: colors.line }} />,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: wide ? colors.background : colors.page },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'CASA & TE' }} />
        <Stack.Screen name="product/[id]" options={{ title: '' }} />
        <Stack.Screen name="checkout/index" options={{ title: 'Consegna e pagamento' }} />
        <Stack.Screen name="checkout/return" options={{ title: 'Pagamento', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Ordine' }} />
        <Stack.Screen name="reso/[orderId]" options={{ title: 'Reso e assistenza' }} />
        <Stack.Screen name="auth/sign-in" options={{ title: 'Accedi', presentation: 'modal' }} />
        <Stack.Screen name="account/edit" options={{ title: 'Dati personali' }} />
        <Stack.Screen name="account/password" options={{ title: 'Password' }} />
        <Stack.Screen name="account/addresses" options={{ title: 'Indirizzi' }} />
        <Stack.Screen name="account/delete" options={{ title: 'Elimina account' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: 'Informazioni legali' }} />
        <Stack.Screen name="club" options={{ title: 'Casa & Te Club' }} />
        <Stack.Screen name="volantino" options={{ title: 'Volantino' }} />
      </Stack>
    </PersistenceGate>
    {/* The opening animation (desktop shop: none, the catalogue opens straight away). */}
    <AnimatedSplash ready skip={wide} />
  </View>);
}
