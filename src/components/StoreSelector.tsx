import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { stores } from '@/config/stores';
import { colors, control, radius, spacing, typeScale } from '@/config/theme';
import { usePreferences } from '@/store/preferences';
import { Icon } from './Icon';

export function StoreSelector({ variant = 'inline' }: { variant?: 'compact' | 'inline' }) {
  const selected = usePreferences((s) => s.store);
  const setStore = usePreferences((s) => s.setStore);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return <>
    {variant === 'compact' ? <Pressable accessibilityRole="button"
      accessibilityLabel={`Negozio preferito: ${selected}. Cambia negozio`}
      onPress={() => setOpen(true)} style={styles.compact}>
      <Icon name="pin" size={20} color={colors.green} />
      <Text style={styles.compactText} numberOfLines={1}>{selected}</Text>
      <Icon name="down" size={16} color={colors.green} />
    </Pressable> : <View style={styles.inline}>
      <Text style={styles.inlineTitle}>Negozio preferito</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Cambia negozio. Attualmente ${selected}`}
        onPress={() => setOpen(true)} style={styles.inlineButton}>
        <Icon name="pin" size={20} color={colors.green} />
        <Text style={styles.inlineText}>{selected}</Text>
        <Text style={styles.change}>Cambia</Text>
      </Pressable>
    </View>}

    <Modal visible={open} transparent animationType="fade" statusBarTranslucent
      onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Chiudi selezione negozio"
          onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.headingRow}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={styles.title}>Scegli il negozio</Text>
              <Text style={styles.subtitle}>Per il ritiro gratuito e le tue preferenze.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Chiudi"
              onPress={close} style={styles.close}>
              <Icon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.options}>
            {stores.map((store) => {
              const active = selected === store;
              return <Pressable key={store} accessibilityRole="radio"
                accessibilityState={{ checked: active }} aria-checked={active}
                onPress={() => { setStore(store); close(); }}
                style={[styles.option, active && styles.optionSelected]}>
                <Icon name="pin" size={20} color={active ? colors.green : colors.muted} />
                <Text style={[styles.optionText, active && styles.optionTextSelected]}>{store}</Text>
                {active && <Icon name="check" size={20} color={colors.green} />}
              </Pressable>;
            })}
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  compact: { minHeight: control.minHeight, maxWidth: 150, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: spacing.xs, paddingHorizontal: spacing.xs },
  compactText: { color: colors.greenDark, fontSize: typeScale.label, fontWeight: '600', flexShrink: 1 },
  inline: { marginVertical: spacing.sm, gap: spacing.xs },
  inlineTitle: { fontSize: typeScale.label, fontWeight: '600', color: colors.text },
  inlineButton: { minHeight: control.minHeight, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, flexDirection: 'row',
    alignItems: 'center', gap: spacing.sm },
  inlineText: { flex: 1, fontSize: typeScale.body, color: colors.text, fontWeight: '500' },
  change: { fontSize: typeScale.caption, color: colors.green, fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.lg, elevation: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { color: colors.text, fontSize: typeScale.section, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 18, marginTop: spacing.xxs },
  close: { width: control.minHeight, height: control.minHeight, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  options: { gap: spacing.xs, marginTop: spacing.md },
  option: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionSelected: { borderColor: colors.green, backgroundColor: '#F0F4E9' },
  optionText: { flex: 1, fontSize: typeScale.body, color: colors.text },
  optionTextSelected: { color: colors.greenDark, fontWeight: '600' },
});
