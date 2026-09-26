// Data access for the customer app. All prices/stock/shipping come from the database; the app
// never computes an amount that is charged.
import {
  productImageUrl, type AddressInput, type AddressRow, type CategoryRow, type CheckoutResponse,
  type CreateOrderInput, type OrderEventRow, type OrderItemRow, type OrderRow, type PickupPointRow,
  type ProductRow, type ProfileRow, type Quote, type QuoteInput, type StoreRow,
} from '@casa-te/shared';
import { Platform } from 'react-native';
import { SUPABASE_URL, supabase } from './supabase';

export type CatalogProduct = Pick<ProductRow,
  'id' | 'sku' | 'name' | 'description' | 'brand' | 'category_id' | 'price_cents' | 'compare_at_price_cents' |
  'weight_g' | 'max_per_order' | 'featured'> & {
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
  search?: string;
  featured?: boolean;
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'name';
  page?: number;
  pageSize?: number;
};

export async function fetchProducts(q: ProductQuery): Promise<{ items: CatalogProduct[]; hasMore: boolean }> {
  const pageSize = q.pageSize ?? 40;
  const from = (q.page ?? 0) * pageSize;
  let query = supabase.from('products').select(PRODUCT_FIELDS).eq('active', true);
  if (q.storeId) query = query.eq('inventory.store_id', q.storeId);
  if (q.categoryId) query = query.eq('category_id', q.categoryId);
  if (q.featured) query = query.eq('featured', true);
  const needle = q.search?.trim().toLowerCase().replace(/[%_,()]/g, ' ');
  if (needle) query = query.ilike('search_text', `%${needle}%`);
  switch (q.sort) {
    case 'price_asc': query = query.order('price_cents', { ascending: true }); break;
    case 'price_desc': query = query.order('price_cents', { ascending: false }); break;
    case 'name': query = query.order('name'); break;
    default: query = query.order('featured', { ascending: false }).order('name');
  }
  const rows = unwrap(await query.range(from, from + pageSize)) as unknown as RawProduct[];
  return { items: rows.slice(0, pageSize).map((r) => toCatalogProduct(r, q.storeId)), hasMore: rows.length > pageSize };
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
