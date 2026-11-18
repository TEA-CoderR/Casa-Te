import { requireOptionalNativeModule } from 'expo';

// "Fotografa un prodotto": the text on a pack is read on the phone (ML Kit on Android, Apple Vision on iOS, via
// expo-text-extractor). Loaded optionally: the web shop and builds without the module keep the old search icon.
type TextExtractor = { isSupported: boolean; extractTextFromImage: (path: string) => Promise<string[]> };
const native = requireOptionalNativeModule<TextExtractor>('ExpoTextExtractor');

export const canReadLabels = !!native?.isSupported;

/** The lines of text read in the photo at `uri` (nothing leaves the phone). */
export async function readLabel(uri: string): Promise<string[]> {
  if (!native) throw new Error('Text reader not available');
  return native.extractTextFromImage(uri.replace('file://', ''));
}

/** A few words to search for by hand when no product matched: the first lines that have letters in them. */
export function searchHint(lines: string[]): string {
  const words = lines.join(' ').split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w));
  return words.slice(0, 4).join(' ').slice(0, 60);
}
