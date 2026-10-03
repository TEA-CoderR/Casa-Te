import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '@/config/theme';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { useStores } from '@/lib/hooks';
import { transition, Wrap, type WebState } from './shared';

const SHOP: Array<[string, Href]> = [['Tutti i prodotti', '/catalog'], ['Preferiti', '/favorites'], ['Carrello', '/cart'], ['I miei ordini', '/orders']];
const INFO: Array<[string, 'shipping' | 'terms' | 'privacy']> = [['Spedizioni e ritiro', 'shipping'], ['Condizioni di vendita', 'terms'], ['Privacy', 'privacy']];

/** Desktop colophon: the back cover of the catalogue, on the warm stone ground. */
export function SiteFooter() {
  const { stores } = useStores();
  const [storeSheet, setStoreSheet] = useState(false);
  const link = (key: string, label: string, onPress: () => void) =>
    <Pressable key={key} onPress={onPress} accessibilityRole="link">
      {({ hovered }: WebState) => <Text style={[styles.link, hovered && styles.linkOn, transition('color')]}>{label}</Text>}
    </Pressable>;
  return <View style={styles.footer}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <Wrap style={styles.row}>
      <View style={{ flex: 1.6, gap: 14, paddingRight: 40 }}>
        <Text style={styles.wordmark}>Casa & Te</Text>
        <Text style={styles.lead}>Articoli per la casa, pulizia e organizzazione.{'\n'}Ordina online e ritira gratis nel tuo negozio.</Text>
      </View>
      <View style={styles.col}>
        <Text style={styles.head}>Negozio online</Text>
        {SHOP.map(([label, href]) => link(label, label, () => router.push(href)))}
      </View>
      <View style={styles.col}>
        <Text style={styles.head}>I nostri negozi</Text>
        {stores.map((s) => link(s.id, storeShortName(s), () => setStoreSheet(true)))}
      </View>
      <View style={styles.col}>
        <Text style={styles.head}>Informazioni</Text>
        {INFO.map(([label, doc]) => link(doc, label, () => router.push({ pathname: '/legal/[doc]', params: { doc } })))}
      </View>
    </Wrap>
    <Wrap style={styles.base}>
      <Text style={styles.small}>© {new Date().getFullYear()} CASA & TE</Text>
      <Text style={styles.small}>Prezzi IVA inclusa · Pagamenti gestiti da Stripe</Text>
    </Wrap>
  </View>;
}

const styles = StyleSheet.create({
  footer: { backgroundColor: colors.stone, marginTop: 120, paddingTop: 72 },
  row: { flexDirection: 'row', gap: 32, paddingBottom: 56 },
  wordmark: { fontSize: 46, lineHeight: 52, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  lead: { fontSize: 19, lineHeight: 27, fontFamily: fonts.serif, color: colors.text },
  col: { flex: 1, gap: 2 },
  head: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600', marginBottom: 12 },
  link: { fontSize: 15, lineHeight: 30, color: colors.text, fontFamily: fonts.sans },
  linkOn: { color: colors.green, textDecorationLine: 'underline' },
  base: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.rule, paddingTop: 20, paddingBottom: 28 },
  small: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans },
});
