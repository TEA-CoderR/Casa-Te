import { Image, View } from 'react-native';
import { ProductVisual } from './ProductVisual';
import { productImageCells } from '@/data/productImages';
import { Icon } from './Icon';
import { colors } from '@/config/theme';

/**
 * Product photo from storage/CDN. Falls back to the demo illustration sheet for the seeded
 * placeholder SKUs, and to a neutral icon otherwise.
 */
export function ProductImage({ uri, sku, label, inset = 0.12, aspect = 1 }: { uri: string | null; sku?: string | null; label?: string; inset?: number; aspect?: number }) {
  if (uri) {
    return <View style={{ width: '100%', aspectRatio: aspect, padding: `${inset * 100}%` as `${number}%` }}>
      <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} accessibilityLabel={label} />
    </View>;
  }
  if (sku && productImageCells[sku] !== undefined) return <ProductVisual id={sku} label={label} inset={inset} aspect={aspect} />;
  return <View style={{ width: '100%', aspectRatio: aspect, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
    <Icon name="box" size={36} color={colors.line} />
  </View>;
}
