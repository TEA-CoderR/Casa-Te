import { useState } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors } from '@/config/theme';
import { ProductImage } from './ProductImage';

/** Swipeable product photos with page dots (one photo: no dots). */
export function ProductGallery({ images, sku, label, inset = 0.1, blend }: { images: string[]; sku: string; label: string; inset?: number; blend?: boolean }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const pages = images.length ? images : [null];
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
    {pages.length > 1 && width > 0
      ? <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}
          accessibilityLabel={`${label}: ${pages.length} foto`}>
          {pages.map((uri, i) => <View key={uri ?? i} style={{ width }}>
            <ProductImage uri={uri} sku={sku} label={`${label}, foto ${i + 1} di ${pages.length}`} inset={inset} blend={blend} /></View>)}
        </ScrollView>
      : <ProductImage uri={pages[0]} sku={sku} label={label} inset={inset} blend={blend} />}
    {pages.length > 1 && <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pages.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotOn]} />)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D9D3C7' },
  dotOn: { backgroundColor: colors.text },
});
