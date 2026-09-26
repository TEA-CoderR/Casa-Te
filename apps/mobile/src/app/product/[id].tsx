import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductVisual } from '@/components/ProductVisual';
import { Icon } from '@/components/Icon';
import { EmptyState, PrimaryButton, QuantityControl } from '@/components/UI';
import { products } from '@/data/products';
import { colors } from '@/config/theme';
import { useCartStore } from '@/store/cart';
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quantity, setQuantity] = useState(1);
  const add = useCartStore((s) => s.add);
  const product = products.find((p) => p.id === id);
  if (!product) return <Screen stack><EmptyState title="Prodotto non trovato." message="Scopri gli altri prodotti del catalogo." icon="search">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace('/catalog')} />
  </EmptyState></Screen>;
  return <Screen stack footer={<View style={styles.footer}>
    <View><Text style={styles.totalLabel}>Totale · {quantity} pz</Text>
      <Text style={styles.total}>€{(product.price * quantity).toFixed(2).replace('.', ',')}</Text></View>
    <View style={{ flex: 1 }}><PrimaryButton title="Aggiungi al carrello" icon="bag" disabled={!product.available}
      onPress={() => { add(product.id, quantity); router.push('/cart'); }} /></View>
  </View>}>
    <View style={styles.media}><ProductVisual id={product.id} label={product.name} inset={0.1} />
      <View style={styles.demo}><Text style={styles.demoText}>IMMAGINE DIMOSTRATIVA</Text></View></View>
    <View style={styles.categoryRow}><Text style={styles.category}>{product.category}</Text>
      <View style={styles.availability}><View style={styles.dot} /><Text style={styles.availabilityText}>{product.available ? 'Disponibile · demo' : 'Esaurito'}</Text></View>
    </View>
    <Text style={styles.title}>{product.name}</Text>
    <Text style={styles.price}>€{product.price.toFixed(2).replace('.', ',')}</Text>
    <Text style={styles.description}>Un piccolo essenziale per la tua casa. Articolo dimostrativo: immagine, prezzo e disponibilità da confermare.</Text>
    <View style={styles.quantityRow}><View><Text style={styles.label}>Quantità</Text><Text style={styles.caption}>Scegli ciò che ti serve</Text></View>
      <QuantityControl value={quantity} onChange={setQuantity} min={1} /></View>
    <View style={styles.infoRow}><Icon name="weight" color={colors.green} size={21} />
      <Text style={styles.info}>Peso indicativo: {product.weightKg.toFixed(1)} kg</Text></View>
    <View style={styles.infoRow}><Icon name="store" color={colors.green} size={21} />
      <Text style={styles.info}>Ritiro in negozio sempre gratuito</Text></View>
    <View style={styles.infoRow}><Icon name="truck" color={colors.green} size={21} />
      <Text style={styles.info}>Spedizione gratuita da €66, fino a 10 kg</Text></View>
  </Screen>;
}
const styles = StyleSheet.create({
  media: { backgroundColor: '#EEEFE8', borderRadius: 24, overflow: 'hidden' },
  demo: { position: 'absolute', bottom: 14, alignSelf: 'center' },
  demoText: { fontSize: 8, letterSpacing: 1.3, color: colors.muted },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  category: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.muted },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availabilityText: { fontSize: 10, color: colors.green },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  title: { fontSize: 27, lineHeight: 34, letterSpacing: -0.8, fontWeight: '600', color: colors.text, marginTop: 10 },
  price: { fontSize: 28, fontWeight: '600', letterSpacing: -0.8, color: colors.green, marginTop: 13 },
  description: { fontSize: 13, lineHeight: 22, color: colors.muted, marginTop: 14 },
  quantityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 23, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '500', color: colors.text },
  caption: { fontSize: 11, color: colors.muted, marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  info: { fontSize: 12, color: colors.muted, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  totalLabel: { fontSize: 10, color: colors.muted },
  total: { fontSize: 22, fontWeight: '600', marginTop: 3, color: colors.text },
});

