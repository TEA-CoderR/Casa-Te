import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { HomeBannerRow } from '@casa-te/shared';
import { colors } from '@/config/theme';
import { RemoteImage } from './RemoteImage';

type Banner = HomeBannerRow & { image: string | null };

/**
 * Home banners (design "Pulito"): square campaign pictures made for the shop, one at a time, turning every 5 s until
 * touched. Nothing is drawn when no banner is published.
 */
export function HomeBanners({ banners, onOpen }: { banners: Banner[]; onOpen: (banner: Banner) => void }) {
  const { width } = useWindowDimensions();
  const size = width - 32;
  const step = size + 10;
  const shown = banners.filter((b) => b.image);
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollView>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (shown.length < 2) return;
    const t = setInterval(() => {
      if (touched.current) return;
      setIndex((i) => { const next = (i + 1) % shown.length; pager.current?.scrollTo({ x: next * step, animated: true }); return next; });
    }, 5000);
    return () => clearInterval(t);
  }, [shown.length, step]);
  if (!shown.length) return null;
  return <View>
    <ScrollView ref={pager} horizontal showsHorizontalScrollIndicator={false} snapToInterval={step} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} style={{ flexGrow: 0 }}
      onScrollBeginDrag={() => { touched.current = true; }}
      onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / step))}>
      {shown.map((b) => <Pressable key={b.id} onPress={() => onOpen(b)} accessibilityRole={b.link_kind === 'none' ? 'image' : 'link'}
        accessibilityLabel={b.title} disabled={b.link_kind === 'none'}
        style={({ pressed }) => [styles.banner, { width: size, height: size }, pressed && { opacity: 0.92 }]}>
        <RemoteImage uri={b.image!} style={{ width: '100%', height: '100%' }} label={b.title} />
      </Pressable>)}
    </ScrollView>
    {shown.length > 1 && <View style={styles.dots}>{shown.map((b, i) =>
      <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Mostra ${b.title}`} style={styles.dotHit}
        onPress={() => { touched.current = true; setIndex(i); pager.current?.scrollTo({ x: i * step, animated: true }); }}>
        <View style={[styles.dot, i === index && styles.dotOn]} /></Pressable>)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.well },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dotHit: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D3D6D1' },
  dotOn: { width: 18, backgroundColor: colors.text },
});
