import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, control, spacing, typeScale } from '@/config/theme';
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
  content: { paddingHorizontal: control.horizontalInset, paddingTop: spacing.md, paddingBottom: spacing.lg },
  demo: { marginTop: spacing.lg, fontSize: typeScale.caption, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  footer: { paddingHorizontal: control.horizontalInset, paddingTop: spacing.sm, paddingBottom: spacing.sm,
    borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});

