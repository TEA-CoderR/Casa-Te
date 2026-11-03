import type { Href } from 'expo-router';

/**
 * The whole catalogue, with every collection filter cleared. The Categorie tab keeps its last params,
 * so a plain '/catalog' could reopen "In offerta" or "In evidenza".
 */
export const ALL_PRODUCTS = { pathname: '/catalog', params: { offerte: '', evidenza: '', category: '' } } as const satisfies Href;

/**
 * A product list (department, subcategory, "In offerta", "In evidenza"). Phones open it as its own screen, so back
 * returns to wherever it was opened from; the desktop shop shows lists on the catalogue page.
 */
export function productList(params: { category?: string; offerte?: string; evidenza?: string; sort?: string }, wide = false): Href {
  return { pathname: wide ? '/catalog' : '/prodotti', params: { offerte: '', evidenza: '', category: '', ...params } };
}
