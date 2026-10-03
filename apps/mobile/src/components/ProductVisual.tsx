import { useState } from 'react';
import { Image, View } from 'react-native';
import { demoProductSheet, productImageCells } from '@/data/productImages';
import { colors } from '@/config/theme';
export function ProductVisual({ id, label, inset = 0.12, aspect = 1, blend }: { id: string; label?: string; inset?: number; aspect?: number; blend?: boolean }) {
  const [width, setWidth] = useState(0);
  const cell = productImageCells[id];
  // The sprite cell is square: fit it in the (possibly wider) box.
  const size = Math.min(width, width / aspect) * (1 - inset * 2);
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={{ width: '100%', aspectRatio: aspect, alignItems: 'center', justifyContent: 'center' }}
    accessibilityLabel={label ? `${label} · immagine dimostrativa` : undefined}>
    {width > 0 && cell !== undefined && <View style={{ width: size, height: size, overflow: 'hidden', backgroundColor: blend ? colors.photo : undefined }}>
      <Image source={demoProductSheet} resizeMode="stretch" fadeDuration={0}
        style={[{ position: 'absolute', width: size * 4, height: size * 2,
          left: -(cell % 4) * size, top: -Math.floor(cell / 4) * size }, blend ? ({ mixBlendMode: 'multiply' } as object) : null]} />
    </View>}
  </View>;
}
