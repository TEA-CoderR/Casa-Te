import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatEuro, untilLabel } from '@/lib/price';
import { colors, fonts } from '@/config/theme';
import { Icon } from './Icon';

/**
 * "Prezzo Soci" box on the product page. Members see that their price is the member price; everyone else sees
 * the member price and is invited to join the Club for free or link the card they already have.
 */
export function MemberPriceBox({ cents, regularCents, endsOn, member }: { cents: number; regularCents: number; endsOn: string | null; member: boolean }) {
  const saving = regularCents - cents;
  const until = endsOn ? ` · ${untilLabel(endsOn)}` : '';
  if (member) return <View style={styles.box} accessibilityLabel={`Prezzo Soci applicato: ${formatEuro(cents)}, risparmi ${formatEuro(saving)}${until}`}>
    <Icon name="crown" size={22} color={colors.club} strokeWidth={1.6} />
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>Prezzo Soci applicato</Text>
      <Text style={styles.text}>Risparmi {formatEuro(saving)} come membro del Club{until}</Text>
    </View>
  </View>;
  return <Pressable onPress={() => router.push('/club')} accessibilityRole="button"
    accessibilityLabel={`Prezzo Soci ${formatEuro(cents)}${until}. Iscriviti gratis al Club o collega la tua tessera`}
    style={({ pressed }) => [styles.box, pressed && { opacity: 0.85 }]}>
    <Icon name="crown" size={22} color={colors.club} strokeWidth={1.6} />
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>Prezzo Soci {formatEuro(cents)}<Text style={styles.until}>{until}</Text></Text>
      <Text style={styles.text}>Iscriviti gratis al Club o collega la tua tessera Casa & Te</Text>
    </View>
    <Icon name="chevron" size={18} color={colors.club} />
  </Pressable>;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.clubFill, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  title: { fontSize: 15, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.club },
  until: { fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: '500' },
  text: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.text, marginTop: 2 },
});
