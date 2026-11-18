// Forced update and maintenance (plan v3 L5): read from app_settings at start and whenever the app comes back to
// the foreground. While the check is running, or if it fails (offline), the app opens normally: the database
// refuses new orders during maintenance anyway.
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, PrimaryButton, SecondaryButton } from './UI';
import { colors } from '@/config/theme';
import { fetchAppGate } from '@/lib/api';

const ANDROID_ID = 'it.casate.app';

/** -1, 0, 1 for x.y.z versions (missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0); const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1; }
  return 0;
}

const openStore = () => Linking.openURL(`market://details?id=${ANDROID_ID}`)
  .catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_ID}`));

export function AppGate({ children }: PropsWithChildren) {
  const [gate, setGate] = useState<{ min_app_version: string | null; maintenance_message: string | null } | null>(null);
  const check = () => { fetchAppGate().then(setGate).catch(() => {}); };
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);

  const version = Constants.expoConfig?.version ?? '0.0.0';
  // The web shop is always the latest version: only the phone apps are held back.
  const outdated = Platform.OS !== 'web' && !!gate?.min_app_version && compareVersions(version, gate.min_app_version) < 0;
  if (outdated) return <SafeAreaView style={styles.page}><StatusBar style="dark" /><View style={styles.body}>
    <EmptyState icon="phone" title="Aggiorna l’app" message={`Questa versione (${version}) non è più supportata. Scarica l’ultima versione per continuare a ordinare.`}>
      {Platform.OS === 'android' && <PrimaryButton title="Aggiorna ora" onPress={openStore} />}
    </EmptyState>
  </View></SafeAreaView>;
  if (gate?.maintenance_message) return <SafeAreaView style={styles.page}><StatusBar style="dark" /><View style={styles.body}>
    <EmptyState icon="clock" title="Torniamo subito" message={gate.maintenance_message}>
      <SecondaryButton title="Riprova" onPress={check} />
    </EmptyState>
  </View></SafeAreaView>;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
});
