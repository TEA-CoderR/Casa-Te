// Data access for the customer app. All prices/stock/shipping come from the database; the app
// never computes an amount that is charged.
import {
  flyerFileUrl, productImageUrl, type AppSettingsRow, type FlyerRow, type AddressInput, type AddressRow, type CategoryRow, type CheckoutResponse,
  type CreateOrderInput, type OrderEventRow, type OrderItemRow, type OrderRow, type PickupPointRow,
  type ClubOffer, type ProductReviewRow, type ProductRow, type ProfileRow, type Quote, type QuoteInput,
  type ReviewEligibility, type StoreRow, type CompanyRow,
} from '@casa-te/shared';
import { Platform } from 'react-native';
import { SUPABASE_URL, supabase } from './supabase';
import { memberPrice } from './price';

export type CatalogProduct = Pick<ProductRow,
  'id' | 'sku' | 'name' | 'description' | 'brand' | 'category_id' | 'price_cents' | 'compare_at_price_cents' |
  'weight_g' | 'max_per_order' | 'featured' | 'unit_quantity' | 'unit' | 'color' | 'highlights' |
  'variant_group' | 'variant_title' | 'variant_label' | 'rating_avg' | 'rating_count' | 'featured_rank' | 'offer_rank' |
  'member_price_cents' | 'member_price_ends_on'> & {
  image: string | null;
  images: string[];
  /** Units available in the selected store (null when no store is selected). */
  stock: number | null;
  /**
   * Set when price_cents is the Club member price (shown like any offer: regular price struck through). quote_cart
   * charges it to Club members only; others see "con Club gratuito" next to it.
   */
  /** Member price shown as the offer; regularCents is what non-members pay (quote_cart decides). */
  clubPrice: { endsOn: string | null; regularCents: number } | null;
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
  'id,sku,name,description,brand,category_id,price_cents,compare_at_price_cents,weight_g,max_per_order,featured,featured_rank,offer_rank,' +
  'unit_quantity,unit,color,highlights,variant_group,variant_title,variant_label,rating_avg,rating_count,' +
  'member_price_cents,member_price_ends_on,' +
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
  // A valid member price is the product's offer, like a store promotion (display only).
  const club = memberPrice(rest);
  const offer = club ? { price_cents: club.cents, compare_at_price_cents: Math.max(rest.price_cents, rest.compare_at_price_cents ?? 0) } : {};
  return { ...rest, ...offer, images, image: images[0] ?? null, stock, clubPrice: club ? { endsOn: club.endsOn, regularCents: rest.price_cents } : null };
}

// ---- Catalogue ---------------------------------------------------------------

/** Operator and store companies (public legal data for the legal pages, checkout and orders). */
export async function fetchCompanies(): Promise<CompanyRow[]> {
  return unwrap(await supabase.from('companies').select('*'));
}

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

/**
 * Discounted products for the "In offerta" rows (display only): the order set in the admin first,
 * then the biggest discount. Positioned products come first from the database, so none is missed.
 */
export async function fetchOffers(storeId: string | null, limit: number): Promise<CatalogProduct[]> {
  const { items } = await fetchProducts({ storeId, onSale: true, pageSize: 60 });
  const pct = (p: CatalogProduct) => p.compare_at_price_cents ? (p.compare_at_price_cents - p.price_cents) / p.compare_at_price_cents : 0;
  const rank = (p: CatalogProduct) => p.offer_rank ?? Number.MAX_SAFE_INTEGER;
  return items.filter((p) => pct(p) > 0).sort((a, b) => rank(a) - rank(b) || pct(b) - pct(a)).slice(0, limit);
}

export async function fetchProducts(q: ProductQuery): Promise<{ items: CatalogProduct[]; hasMore: boolean; total: number | null }> {
  const pageSize = q.pageSize ?? 40;
  const from = (q.page ?? 0) * pageSize;
  const needle = q.search?.trim().toLowerCase().replace(/[%_,()]/g, ' ');
  // Products out of stock are listed only when searched for (or among the favourites): browsing shows what can be bought.
  const inStockOnly = !needle && !q.ids;
  let query = supabase.from('products')
    .select(inStockOnly ? PRODUCT_FIELDS.replace('inventory(', 'inventory!inner(') : PRODUCT_FIELDS, { count: 'exact' }).eq('active', true);
  if (q.storeId) query = query.eq('inventory.store_id', q.storeId);
  if (inStockOnly) query = query.gt('inventory.quantity', 0);
  if (q.categoryId) query = query.eq('category_id', q.categoryId);
  if (q.categoryIds?.length) query = query.in('category_id', q.categoryIds);
  if (q.brands?.length) query = query.in('brand', q.brands);
  if (q.colors?.length) query = query.in('color', q.colors);
  if (q.priceMin != null) query = query.gte('price_cents', q.priceMin);
  if (q.priceMax != null) query = query.lte('price_cents', q.priceMax);
  if (q.featured) query = query.eq('featured', true);
  // Offers include Club member prices (expired ones are cleared by refresh_display_prices).
  if (q.onSale) query = query.or('compare_at_price_cents.not.is.null,member_price_cents.not.is.null');
  if (q.ids) query = query.in('id', q.ids.length ? q.ids : ['00000000-0000-0000-0000-000000000000']);
  if (needle) query = query.ilike('search_text', `%${needle}%`);
  // Default order of the two showcase collections: the manual positions set in the admin come first.
  if ((q.sort ?? 'featured') === 'featured' && q.featured) query = query.order('featured_rank', { ascending: true, nullsFirst: false });
  if ((q.sort ?? 'featured') === 'featured' && q.onSale) query = query.order('offer_rank', { ascending: true, nullsFirst: false });
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

type CategoryOverviewRow = { category_id: string; products: number; cover_path: string | null; cover_sku: string };
/** Products in stock and a cover product per category, counted in the database (no row cap). */
async function categoryOverview(avoid: string[] = []): Promise<CategoryOverviewRow[]> {
  return unwrap(await supabase.rpc('category_overview', { p_avoid: avoid })) as CategoryOverviewRow[];
}

/** Active products in stock per category id (display only: department tiles and lists). */
export async function fetchCategoryCounts(): Promise<Record<string, number>> {
  return Object.fromEntries((await categoryOverview()).map((r) => [r.category_id, r.products]));
}

/**
 * One representative photo per category (photo first, then featured). Products in `avoid` are used only
 * when the category has nothing else, so a department tile does not repeat a product shown next to it.
 */
export async function fetchCategoryCovers(avoid: string[] = []): Promise<Record<string, { image: string | null; sku: string }>> {
  return Object.fromEntries((await categoryOverview(avoid)).map((r) => [r.category_id, { image: imageUrl(r.cover_path), sku: r.cover_sku }]));
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

/** Joins the Club with the customer's details (checked again on the server). */
export async function joinClub(details: { fullName: string; phone: string; privacy: boolean; marketing: boolean }): Promise<string | null> {
  return unwrap(await supabase.rpc('join_club', { p_full_name: details.fullName, p_phone: details.phone,
    p_privacy: details.privacy, p_marketing: details.marketing })) as string | null;
}

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

/** Current flyers ("Volantino"), newest first; RLS returns only published flyers inside their validity window. */
export async function fetchFlyers(): Promise<Array<FlyerRow & { pdf: string | null; pages: string[] }>> {
  const rows = unwrap(await supabase.from('flyers').select('*')
    .order('valid_from', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })) as FlyerRow[];
  return rows.map((f) => ({ ...f, pdf: flyerFileUrl(SUPABASE_URL, f.pdf_path),
    pages: f.page_paths.map((p) => flyerFileUrl(SUPABASE_URL, p)).filter((u): u is string => !!u) }));
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

/** Links an existing Casa & Te member card (card number + last 4 phone digits or birth date). */
export function linkMemberCard(input: { card: string; phone_last4?: string; birth_date?: string }): Promise<{ linked: boolean; card: string }> {
  return invoke('member-card', input);
}

export async function unlinkMemberCard(): Promise<void> {
  unwrap(await supabase.rpc('unlink_member_card'));
}

export function deleteAccount(): Promise<{ deleted: boolean }> {
  return invoke('delete-account', { confirm: 'ELIMINA' });
}
