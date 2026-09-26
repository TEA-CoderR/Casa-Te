export const stores = [
  'Arezzo',
  'Lucca 1',
  'Lucca 2',
  'Lucca 3',
  'Lucca 4',
] as const;

export type StoreName = (typeof stores)[number];
