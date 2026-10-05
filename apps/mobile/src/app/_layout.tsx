import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from '@/config/theme';
import { PersistenceGate } from '@/components/PersistenceGate';
import { isConfigured } from '@/lib/supabase';
import { startSessionListener } from '@/store/session';

export const unstable_settings = { initialRouteName: '(tabs)' };

function NotConfigured() {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: colors.background, gap: 12 }}>
    <Text style={{ fontSize: 22, fontWeight: '600', color: colors.greenDark }}>Configurazione mancante</Text>
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
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold,
  });
  useEffect(() => { if (isConfigured) startSessionListener(); }, []);
  if (!isConfigured) return <NotConfigured />;
  // Native needs the faces registered before first render; the web shop falls back to system fonts meanwhile.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;
  return (
    <PersistenceGate>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.serif, fontSize: 21, color: colors.text },
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'CASA & TE' }} />
        <Stack.Screen name="product/[id]" options={{ title: '' }} />
        <Stack.Screen name="checkout/index" options={{ title: 'Consegna e pagamento' }} />
        <Stack.Screen name="checkout/return" options={{ title: 'Pagamento', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Ordine' }} />
        <Stack.Screen name="auth/sign-in" options={{ title: 'Accedi', presentation: 'modal' }} />
        <Stack.Screen name="account/edit" options={{ title: 'Dati personali' }} />
        <Stack.Screen name="account/password" options={{ title: 'Password' }} />
        <Stack.Screen name="account/addresses" options={{ title: 'Indirizzi' }} />
        <Stack.Screen name="account/delete" options={{ title: 'Elimina account' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: 'Informazioni legali' }} />
        <Stack.Screen name="club" options={{ title: 'Casa & Te Club' }} />
      </Stack>
    </PersistenceGate>
  );
}
