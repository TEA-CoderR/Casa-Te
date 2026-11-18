import { useEffect, useRef, useState } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image } from 'expo-image';

/**
 * A photo from the image server or storage, cached in memory and on disk (expo-image), with two quiet retries
 * when it fails to load (a busy connection while scrolling a long list used to leave a blank tile until the page
 * was reopened). After the retries `onFailed` lets the caller show its placeholder.
 */
export function RemoteImage({ uri, style, contentFit = 'contain', label, onFailed, onLoad }: {
  uri: string; style?: StyleProp<ImageStyle>; contentFit?: 'contain' | 'cover'; label?: string; onFailed?: () => void; onLoad?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setAttempt(0); return () => { if (timer.current) clearTimeout(timer.current); }; }, [uri]);
  // A retry asks again past any cached failure: same file, an extra query parameter.
  const src = attempt ? `${uri}${uri.includes('?') ? '&' : '?'}retry=${attempt}` : uri;
  return <Image source={{ uri: src }} style={style} contentFit={contentFit} cachePolicy="memory-disk" recyclingKey={uri} transition={150}
    accessibilityLabel={label} accessible={!!label} onLoad={onLoad}
    onError={() => {
      if (attempt >= 2) { onFailed?.(); return; }
      timer.current = setTimeout(() => setAttempt((a) => a + 1), 700 * (attempt + 1));
    }} />;
}
