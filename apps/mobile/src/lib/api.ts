// Data access for the customer app. All prices/stock/shipping come from the database; the app
// never computes an amount that is charged.
import {
  productImageUrl, type AppSettingsRow, type AddressInput, type AddressRow, type CategoryRow, type CheckoutResponse,
  type CreateOrderInput, type OrderEventRow, type OrderItemRow, type OrderRow, type PickupPointRow,
  type ClubOffer, type ProductReviewRow, type ProductRow, type ProfileRow, type Quote, type QuoteInput,
  type ReviewEligibility, type StoreRow,
} from '@casa-te/shared';
import { Platform } from 'react-native';
import { SUPABASE_URL, supabase } from './supabase';

export type CatalogProduct = Pick<ProductRow,
  'id' | 'sku' | 'name' | 'description' | 'brand' | 'category_id' | 'price_cents' | 'compare_at_price_cents' |
  'weight_g' | 'max_per_order' | 'featured' | 'unit_quantity' | 'unit' | 'color' | 'highlights' |
  'variant_group' | 'variant_title' | 'variant_label' | 'rating_avg' | 'rating_count'> & {
  image: string | null;
  images: string[];
  /** Units available in the selected store (null when no store is selected). */
  stock: number | null;
};

export type OrderWithItems = OrderRow & { order_items: OrderItemRow[] };
export type OrderDetail = OrderWithItems & { order_events: OrderEventRow[] };

class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new ApiError(result.error.message, result.error.message);
  return result.data as T;
}

export const imageUrl = (path: string | null | undefined) => productImageUrl(SUPABASE_URL, path);

const PRODUCT_FIELDS =
  'id,sku,name,description,brand,category_id,price_cents,compare_at_price_cents,weight_g,max_per_order,featured,' +
  'unit_quantity,unit,color,highlights,variant_group,variant_title,variant_label,rating_avg,rating_count,' +
  'product_images(path,sort),inventory(quantity,store_id)';

type RawProduct = Omit<CatalogProduct, 'image' | 'images' | 'stock'> & {
  product_images: Array<{ path: string; sort: number }>;
  inventory: Array<{ quantity: number; store_id: string }>;
};

function toCatalogProduct(p: RawProduct, storeId: string | null): CatalogProduct {
  const images = [...(p.product_images ?? [])].sort((a, b) => a.sort - b.sort)
    .map((i) => imageUrl(i.path)).filter((u): u is string => Boolean(u));
  const stock = storeId ? (p.inventory ?? []).find((i) => i.store_id === storeId)?.quantity ?? 0 : null;
  const { product_images: _i, inventory: _s, ...rest } = p;
  return { ...rest, images, image: images[0] ?? null, stock };
}

// ---- Catalogue ---------------------------------------------------------------

export async function fetchStores(): Promise<StoreRow[]> {
  return unwrap(await supabase.from('stores').select('*').order('sort'));
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  return unwrap(await supabase.from('categories').select('*').order('sort').order('name'));
}

export type ProductQuery = {
  storeId: string | null;
  categoryId?: string | null;
  /** Any of these categories (a parent plus its subcategories). */
  categoryIds?: string[];
  brands?: string[];
  colors?: string[];
  /** Price range in cents (inclusive). */
  priceMin?: number | null;
  priceMax?: number | null;
  search?: string;
  featured?: boolean;
  /** Only products with a crossed-out "before" price (discounted). */
  onSale?: boolean;
  /** Only these products (favourites). */
  ids?: string[];
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'name';
  page?: number;
  pageSize?: number;
};

/** Discounted products for the "In offerta" rows, biggest discount first (display only). */
export async function fetchOffers(storeId: string | null, limit: number): Promise<CatalogProduct[]> {
  const { items } = await fetchProducts({ storeId, onSale: true, pageSize: 60 });
  const pct = (p: CatalogProduct) => p.compare_at_price_cents ? (p.compare_at_price_cents - p.price_cents) / p.compare_at_price_cents : 0;
  return items.filter((p) => pct(p) > 0).sort((a, b) => pct(b) - pct(a)).slice(0, limit);
}

export async function fetchProducts(q: ProductQuery): Promise<{ items: CatalogProduct[]; hasMore: boolean; total: number | null }> {
  const pageSize = q.pageSize ?? 40;
  const from = (q.page ?? 0) * pageSize;
  let query = supabase.from('products').select(PRODUCT_FIELDS, { count: 'exact' }).eq('active', true);
  if (q.storeId) query = query.eq('inventory.store_id', q.storeId);
  if (q.categoryId) query = query.eq('category_id', q.categoryId);
  if (q.categoryIds?.length) query = query.in('category_id', q.categoryIds);
  if (q.brands?.length) query = query.in('brand', q.brands);
  if (q.colors?.length) query = query.in('color', q.colors);
  if (q.priceMin != null) query = query.gte('price_cents', q.priceMin);
  if (q.priceMax != null) query = query.lte('price_cents', q.priceMax);
  if (q.featured) query = query.eq('featured', true);
  if (q.onSale) query = query.not('compare_at_price_cents', 'is', null);
  if (q.ids) query = query.in('id', q.ids.length ? q.ids : ['00000000-0000-0000-0000-000000000000']);
  const needle = q.search?.trim().toLowerCase().replace(/[%_,()]/g, ' ');
  if (needle) query = query.ilike('search_text', `%${needle}%`);
  switch (q.sort) {
    case 'price_asc': query = query.order('price_cents', { ascending: true }); break;
    case 'price_desc': query = query.order('price_cents', { ascending: false }); break;
    case 'name': query = query.order('name'); break;
    default: query = query.order('featured', { ascending: false }).order('name');
  }
  const result = await query.range(from, from + pageSize);
  const rows = unwrap(result) as unknown as RawProduct[];
  return { items: rows.slice(0, pageSize).map((r) => toCatalogProduct(r, q.storeId)), hasMore: rows.length > pageSize, total: result.count ?? null };
}

/** Filter options (brands, colours, price range) for the products of some categories. */
export async function fetchFacets(categoryIds: string[] | null): Promise<{ brands: string[]; colors: string[]; minCents: number; maxCents: number }> {
  let query = supabase.from('products').select('brand,color,price_cents').eq('active', true).limit(2000);
  if (categoryIds?.length) query = query.in('category_id', categoryIds);
  const rows = unwrap(await query) as Array<{ brand: string | null; color: string | null; price_cents: number }>;
  const uniq = (v: Array<string | null>) => [...new Set(v.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'it'));
  const prices = rows.map((r) => r.price_cents);
  return { brands: uniq(rows.map((r) => r.brand)), colors: uniq(rows.map((r) => r.color)),
    minCents: prices.length ? Math.min(...prices) : 0, maxCents: prices.length ? Math.max(...prices) : 0 };
}

/** Active products per category id (display only: the department index on the desktop home). */
export async function fetchCategoryCounts(): Promise<Record<string, number>> {
  const rows = unwrap(await supabase.from('products').select('category_id').eq('active', true)
    .not('category_id', 'is', null).limit(5000)) as unknown as Array<{ category_id: string }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.category_id] = (counts[r.category_id] ?? 0) + 1;
  return counts;
}

/**
 * One representative photo per category (featured products first). Products in `avoid` are used only
 * when the category has nothing else, so a department tile does not repeat a product shown next to it.
 */
export async function fetchCategoryCovers(avoid: string[] = []): Promise<Record<string, { image: string | null; sku: string }>> {
  const rows = unwrap(await supabase.from('products').select('sku,category_id,featured,product_images(path,sort)')
    .eq('active', true).not('category_id', 'is', null).order('featured', { ascending: false }).order('created_at').limit(500)) as unknown as
    Array<{ sku: string; category_id: string; product_images: Array<{ path: string; sort: number }> }>;
  const covers: Record<string, { image: string | null; sku: string }> = {};
  const skip = new Set(avoid);
  const ordered = [...rows.filter((r) => !skip.has(r.sku)), ...rows.filter((r) => skip.has(r.sku))];
  for (const r of ordered) {
    const path = [...(r.product_images ?? [])].sort((a, b) => a.sort - b.sort)[0]?.path;
    const cover = { image: imageUrl(path), sku: r.sku };
    // Keep the first one; upgrade a cover without a photo when a product with a photo comes along.
    if (!covers[r.category_id] || (!covers[r.category_id].image && cover.image)) covers[r.category_id] = cover;
  }
  return covers;
}

/** Other products of the same variant group (e.g. the other fragrances), with stock for the store. */
export async function fetchVariants(group: string, storeId: string | null): Promise<CatalogProduct[]> {
  let query = supabase.from('products').select(PRODUCT_FIELDS).eq('active', true).eq('variant_group', group).order('variant_label').limit(12);
  if (storeId) query = query.eq('inventory.store_id', storeId);
  const rows = unwrap(await query) as unknown as RawProduct[];
  return rows.map((r) => toCatalogProduct(r, storeId));
}

// ---- Reviews -----------------------------------------------------------------

export async function fetchReviews(productId: string): Promise<ProductReviewRow[]> {
  return unwrap(await supabase.from('product_reviews').select('id,product_id,author_name,rating,comment,created_at')
    .eq('product_id', productId).order('created_at', { ascending: false }).limit(50)) as ProductReviewRow[];
}

export async function fetchReviewEligibility(productId: string): Promise<ReviewEligibility> {
  return unwrap(await supabase.rpc('can_review_product', { p_product_id: productId })) as ReviewEligibility;
}

export async function submitReview(productId: string, rating: number, comment: string): Promise<ReviewEligibility> {
  return unwrap(await supabase.rpc('submit_review', { p_product_id: productId, p_rating: rating, p_comment: comment || null })) as ReviewEligibility;
}

// ---- CASA & TE Club ----------------------------------------------------------

export async function setClubMembership(join: boolean): Promise<string | null> {
  return unwrap(await supabase.rpc('set_club_membership', { p_join: join })) as string | null;
}

const CLUB_TAGLINE = 'Vantaggi esclusivi e offerte dedicate ai nostri clienti.';

/** Public shop settings (club on/off and tagline). */
export async function fetchAppSettings(): Promise<Pick<AppSettingsRow, 'club_enabled' | 'club_tagline'>> {
  const row = unwrap(await supabase.from('app_settings').select('club_enabled,club_tagline').maybeSingle()) as Pick<AppSettingsRow, 'club_enabled' | 'club_tagline'> | null;
  return row ?? { club_enabled: true, club_tagline: CLUB_TAGLINE };
}

export async function fetchClubOffers(): Promise<ClubOffer[]> {
  return unwrap(await supabase.rpc('club_offers')) as ClubOffer[];
}

export async function fetchProduct(id: string, storeId: string | null): Promise<CatalogProduct | null> {
  let query = supabase.from('products').select(PRODUCT_FIELDS).eq('id', id);
  if (storeId) query = query.eq('inventory.store_id', storeId);
  const rows = unwrap(await query.limit(1)) as unknown as RawProduct[];
  return rows[0] ? toCatalogProduct(rows[0], storeId) : null;
}

export async function fetchPickupPoints(): Promise<PickupPointRow[]> {
  return unwrap(await supabase.from('pickup_points').select('*').eq('active', true).order('city').order('name'));
}

// ---- Cart & checkout ---------------------------------------------------------

export async function fetchQuote(input: QuoteInput): Promise<Quote> {
  return unwrap(await supabase.rpc('quote_cart', { p: input })) as Quote;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = 'internal_error';
    const context = (error as { context?: Response }).context;
    try {
      const payload = context ? await context.json() : null;
      code = payload?.error ?? code;
    } catch { /* not JSON */ }
    if (error.name === 'FunctionsFetchError') code = 'network';
    throw new ApiError(code);
  }
  return data as T;
}

export function startCheckout(order: CreateOrderInput): Promise<CheckoutResponse> {
  return invoke<CheckoutResponse>('checkout', { platform: Platform.OS === 'web' ? 'web' : 'native', order });
}

export function resumeCheckout(orderId: string): Promise<CheckoutResponse> {
  return invoke<CheckoutResponse>('checkout', { action: 'resume', platform: Platform.OS === 'web' ? 'web' : 'native', order_id: orderId });
}

// ---- Orders ------------------------------------------------------------------

export async function fetchOrders(): Promise<OrderWithItems[]> {
  return unwrap(await supabase.from('orders').select('*, order_items(*)')
    .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(50)) as OrderWithItems[];
}

export async function fetchOrder(id: string): Promise<OrderDetail | null> {
  const rows = unwrap(await supabase.from('orders').select('*, order_items(*), order_events(*)')
    .eq('id', id).order('created_at', { referencedTable: 'order_events', ascending: true }).limit(1)) as OrderDetail[];
  return rows[0] ?? null;
}

export async function cancelPendingOrder(id: string): Promise<void> {
  unwrap(await supabase.rpc('customer_cancel_pending_order', { p_order_id: id }));
}

// ---- Account -----------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const rows = unwrap(await supabase.from('profiles').select('*').eq('id', userId).limit(1)) as ProfileRow[];
  return rows[0] ?? null;
}

export async function updateProfile(userId: string, patch: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'preferred_store_id' | 'marketing_opt_in'>>) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', userId));
}

export async function fetchAddresses(): Promise<AddressRow[]> {
  return unwrap(await supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at'));
}

export async function saveAddress(userId: string, address: AddressInput & { label?: string; is_default?: boolean }, id?: string) {
  const row = { ...address, province: address.province.toUpperCase(), user_id: userId };
  if (row.is_default) unwrap(await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId).eq('is_default', true));
  if (id) unwrap(await supabase.from('addresses').update(row).eq('id', id));
  else unwrap(await supabase.from('addresses').insert(row));
}

export async function deleteAddress(id: string) {
  unwrap(await supabase.from('addresses').delete().eq('id', id));
}

export function deleteAccount(): Promise<{ deleted: boolean }> {
  return invoke('delete-account', { confirm: 'ELIMINA' });
}
