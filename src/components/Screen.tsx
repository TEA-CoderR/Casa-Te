import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/config/theme';
type Props = PropsWithChildren<{ contentContainerStyle?: ViewStyle; footer?: ReactNode; stack?: boolean }>;
export function Screen({ children, contentContainerStyle, footer, stack = false }: Props) {
  return <SafeAreaView style={styles.safe} edges={stack ? ['bottom'] : ['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={stack ? 88 : 0}>
      <ScrollView contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {children}
        <Text style={styles.demo}>Versione demo · Immagini, prezzi e disponibilità dimostrativi.</Text>
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 24 },
  demo: { marginTop: 28, fontSize: 10, lineHeight: 16, color: colors.muted, textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});

