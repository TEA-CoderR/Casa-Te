import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/UI';
import { colors } from '@/config/theme';
import { LEGAL_DOCS } from '@/content/legal';

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL_DOCS[doc ?? ''];
  if (!content) return <Screen stack><EmptyState title="Pagina non trovata" message="" icon="help" /></Screen>;
  return <Screen stack maxWidth={760}>
    <Stack.Screen options={{ title: content.title }} />
    <Text style={{ fontSize: 26, fontWeight: '600', color: colors.text, letterSpacing: -0.6 }} accessibilityRole="header">{content.title}</Text>
    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>Ultimo aggiornamento: {content.updated}</Text>
    {content.sections.map((s) => <View key={s.heading} style={{ marginTop: 22 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{s.heading}</Text>
      <Text style={{ fontSize: 13, lineHeight: 21, color: colors.text, marginTop: 6 }}>{s.body}</Text>
    </View>)}
  </Screen>;
}
