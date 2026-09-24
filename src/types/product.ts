export type ProductCategory =
  | 'Pulizia'
  | 'Cucina'
  | 'Casa'
  | 'Bagno'
  | 'Organizzazione';

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  weightKg: number;
  emoji: string;
  available: boolean;
  featured?: boolean;
};
