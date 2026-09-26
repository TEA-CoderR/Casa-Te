import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/config/theme';

type Props = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  footer?: ReactNode;
  stack?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Max content width on the web shop (desktop). */
  maxWidth?: number;
}>;

export function Screen({ children, contentContainerStyle, footer, stack = false, refreshing, onRefresh, maxWidth = 1120 }: Props) {
  return <SafeAreaView style={styles.safe} edges={stack ? ['bottom'] : ['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={stack ? 88 : 0}>
      <ScrollView contentContainerStyle={[styles.content, contentContainerStyle]}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}>
        <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>{children}</View>
      </ScrollView>
      {footer && <View style={styles.footer}><View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>{footer}</View></View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});
