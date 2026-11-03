/**
 * Folds typed search text the way `public.search_fold` folds `products.search_text`:
 * lower case, no accents, no apostrophes, and none of the characters PostgREST filters treat specially.
 */
export function searchKey(text: string): string {
  return text.toLowerCase()
    .replace(/ø/g, 'o')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´]/g, '')
    .replace(/[%_,()*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
