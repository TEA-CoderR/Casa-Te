import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/config/theme';
import { PersistenceGate } from '@/components/PersistenceGate';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  return (
    <PersistenceGate>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.green,
          headerTitleStyle: { fontWeight: '500', fontSize: 15 },
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="product/[id]"
          options={{ title: 'Prodotto', presentation: 'card' }}
        />
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen
          name="order-success"
          options={{ title: 'Ordine confermato', headerBackVisible: false }}
        />
      </Stack>
    </PersistenceGate>
  );
}
