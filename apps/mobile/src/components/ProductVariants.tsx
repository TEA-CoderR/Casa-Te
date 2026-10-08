import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '@/config/theme';
import type { CatalogProduct } from '@/lib/api';
import { ProductImage } from './ProductImage';

/** "Varianti di …": the other products of the same variant group (each its own product and stock). */
export function ProductVariants({ title, current, variants }: { title: string | null; current: string; variants: CatalogProduct[] }) {
  if (variants.length < 2) return null;
  return <View style={styles.wrap}>
    <Text style={styles.title} accessibilityRole="header">{title ? `Varianti di ${title}` : 'Varianti'}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {variants.map((v) => {
        const on = v.id === current;
        const out = v.stock !== null && v.stock <= 0;
        return <Pressable key={v.id} onPress={() => { if (!on) router.replace(`/product/${v.id}`); }} accessibilityRole="radio"
          accessibilityState={{ checked: on }} accessibilityLabel={`${v.variant_label ?? v.name}${out ? ', esaurito' : ''}`}
          style={[styles.item, on && styles.itemOn]}>
          <View style={[styles.thumb, out && { opacity: 0.45 }]}><ProductImage uri={v.image} sku={v.sku} label={v.name} inset={0.06} /></View>
          <Text style={styles.label} numberOfLines={1}>{v.variant_label ?? v.name}</Text>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22, gap: 12 },
  title: { fontSize: 19, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  item: { width: 80, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 6, alignItems: 'center', gap: 4 },
  itemOn: { borderColor: colors.text, borderWidth: 1.5 },
  thumb: { width: '100%' },
  label: { fontSize: 11, color: colors.text, fontFamily: fonts.sans, textAlign: 'center' },
});
