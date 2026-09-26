import { router, Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { EmptyState, PrimaryButton } from '@/components/UI';

export default function NotFound() {
  return <Screen stack>
    <Stack.Screen options={{ title: 'Pagina non trovata' }} />
    <EmptyState icon="search" title="Pagina non trovata" message="Il link potrebbe essere scaduto o errato.">
      <PrimaryButton title="Vai alla home" onPress={() => router.replace('/')} />
    </EmptyState>
  </Screen>;
}
