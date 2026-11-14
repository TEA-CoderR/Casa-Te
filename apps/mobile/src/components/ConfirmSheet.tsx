import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, type } from '@/config/theme';
import { PrimaryButton } from './UI';

/**
 * Ask once before a step the customer may regret (leaving the Club, signing out). The safe choice is the big button;
 * the step itself is a red text link under it.
 */
export function ConfirmSheet({ visible, title, message, keepLabel, confirmLabel, onConfirm, onClose, busy }: {
  visible: boolean; title: string; message?: string; keepLabel: string; confirmLabel: string;
  onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
    <View style={styles.sheet} accessibilityViewIsModal>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      <View style={{ marginTop: 20 }}><PrimaryButton title={keepLabel} onPress={onClose} /></View>
      <Pressable onPress={onConfirm} disabled={busy} accessibilityRole="button" hitSlop={8} style={styles.confirm}>
        <Text style={[styles.confirmText, busy && { opacity: 0.5 }]}>{confirmLabel}</Text>
      </Pressable>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16, 24, 18, 0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, width: '100%', alignSelf: 'center',
    backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 24, paddingBottom: 32 },
  title: { ...type.section, color: colors.text },
  message: { ...type.body, color: colors.muted, marginTop: 8 },
  confirm: { alignSelf: 'center', marginTop: 16, paddingVertical: 6 },
  confirmText: { ...type.body, fontFamily: fonts.sansBold, color: colors.danger },
});
