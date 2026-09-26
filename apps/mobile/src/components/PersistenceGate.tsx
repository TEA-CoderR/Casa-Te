import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useCartStore } from '@/store/cart';
import { usePreferences } from '@/store/preferences';
import { colors } from '@/config/theme';

const stores = [useCartStore, usePreferences];

/** Waits for the locally persisted cart and store choice before rendering routes. */
export function PersistenceGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all(stores.map((store) => store.persist.rehydrate())).then(() => {
      if (!active) return;
      const hydrated = stores.every((store) => store.persist.hasHydrated());
      setReady(hydrated);
      setError(!hydrated);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  if (ready) return children;
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background }}>
    {error ? <><Text>Impossibile caricare i dati salvati sul dispositivo.</Text>
      <Pressable style={{ padding: 16 }} onPress={() => { setError(false); setAttempt(attempt + 1); }}>
        <Text style={{ color: colors.green, fontWeight: '600' }}>Riprova</Text>
      </Pressable></> : <ActivityIndicator color={colors.green} />}
  </View>;
}
