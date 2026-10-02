import { useState } from 'react';
import { Image, View } from 'react-native';
import { demoProductSheet, productImageCells } from '@/data/productImages';
export function ProductVisual({ id, label, inset = 0.12, aspect = 1 }: { id: string; label?: string; inset?: number; aspect?: number }) {
  const [width, setWidth] = useState(0);
  const cell = productImageCells[id];
  // The sprite cell is square: fit it in the (possibly wider) box.
  const size = Math.min(width, width / aspect) * (1 - inset * 2);
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={{ width: '100%', aspectRatio: aspect, alignItems: 'center', justifyContent: 'center' }}
    accessibilityLabel={label ? `${label} · immagine dimostrativa` : undefined}>
    {width > 0 && cell !== undefined && <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image source={demoProductSheet} resizeMode="stretch" fadeDuration={0}
        style={{ position: 'absolute', width: size * 4, height: size * 2,
          left: -(cell % 4) * size, top: -Math.floor(cell / 4) * size }} />
    </View>}
  </View>;
}
