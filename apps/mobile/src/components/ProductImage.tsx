import { Image, View } from 'react-native';
import { ProductVisual } from './ProductVisual';
import { productImageCells } from '@/data/productImages';
import { Icon } from './Icon';
import { colors } from '@/config/theme';

/**
 * Product photo from storage/CDN. Falls back to the demo illustration sheet for the seeded
 * placeholder SKUs, and to a neutral icon otherwise.
 */
export function ProductImage({ uri, sku, label, inset = 0.12, aspect = 1, blend }: { uri: string | null; sku?: string | null; label?: string; inset?: number; aspect?: number; blend?: boolean }) {
  // blend: on a tinted backdrop, white studio backgrounds of product photos take the backdrop colour.
  // On the web every view is its own stacking context, so `multiply` only sees colour painted inside
  // the same view: the backdrop is painted here, right behind the photo, not only on the parent.
  const blendStyle = blend ? ({ mixBlendMode: 'multiply' } as object) : null;
  const backdrop = blend ? { backgroundColor: colors.photo } : null;
  if (uri) {
    return <View style={[{ width: '100%', aspectRatio: aspect, padding: `${inset * 100}%` as `${number}%` }, backdrop]}>
      <Image source={{ uri }} resizeMode="contain" style={[{ width: '100%', height: '100%' }, blendStyle]} accessibilityLabel={label} />
    </View>;
  }
  if (sku && productImageCells[sku] !== undefined) return <ProductVisual id={sku} label={label} inset={inset} aspect={aspect} blend={blend} />;
  return <View style={{ width: '100%', aspectRatio: aspect, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
    <Icon name="box" size={36} color={colors.line} />
  </View>;
}
