import type { Href } from 'expo-router';

/**
 * The whole catalogue, with every collection filter cleared. The Categorie tab keeps its last params,
 * so a plain '/catalog' could reopen "In offerta" or "In evidenza".
 */
export const ALL_PRODUCTS = { pathname: '/catalog', params: { offerte: '', evidenza: '', category: '' } } as const satisfies Href;
