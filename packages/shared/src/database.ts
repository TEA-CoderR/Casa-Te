/**
 * Row types for the Supabase schema (supabase/migrations). Hand-maintained; regenerate with
 * `supabase gen types typescript` once the project is linked and compare.
 */
import type { OrderStatus, PaymentStatus, StaffRole } from './orders';
import type { FulfilmentMethod, ShippedMethod } from './shipping';

export type Uuid = string;
export type Timestamp = string;

export type StoreRow = {
  id: Uuid; code: string; name: string; city: string; address: string | null; postal_code: string | null;
  province: string | null; phone: string | null; email: string | null; opening_hours: string | null;
  pickup_enabled: boolean; ships_orders: boolean; active: boolean; sort: number;
  created_at: Timestamp; updated_at: Timestamp;
};

export type CategoryRow = {
  id: Uuid; slug: string; name: string; parent_id: Uuid | null; sort: number; active: boolean;
  /** Shown among the (max 8) departments on the shop's home page. */
  show_on_home: boolean;
  created_at: Timestamp; updated_at: Timestamp;
};

export type ProductRow = {
  id: Uuid; sku: string; slug: string; name: string; description: string | null; brand: string | null;
  category_id: Uuid | null; price_cents: number; compare_at_price_cents: number | null; vat_rate: number;
  weight_g: number; barcode: string | null; max_per_order: number; active: boolean; featured: boolean;
  search_text: string; created_at: Timestamp; updated_at: Timestamp;
  /** Pack size for the unit price (e.g. 500 ml). Both set or both null. */
  unit_quantity: number | null; unit: ProductUnit | null;
  color: string | null; highlights: ProductHighlight[];
  /** Products sharing a variant_group are shown as variants of each other (each has its own SKU and stock). */
  variant_group: string | null; variant_title: string | null; variant_label: string | null;
  /** Maintained from visible product_reviews (read-only for clients). */
  rating_avg: number | null; rating_count: number;
};

export type ProductUnit = 'ml' | 'l' | 'g' | 'kg' | 'pz' | 'm';
export const HIGHLIGHT_ICONS = ['leaf', 'home', 'diamond', 'drop', 'sun', 'shield', 'star', 'recycle', 'hand', 'box', 'heart', 'sparkle'] as const;
export type HighlightIcon = typeof HIGHLIGHT_ICONS[number];
export type ProductHighlight = { icon: HighlightIcon; label: string };

export type ProductReviewRow = {
  id: Uuid; product_id: Uuid; author_name: string; rating: number; comment: string | null; created_at: Timestamp;
  /** Visible to staff only. */
  hidden?: boolean;
};
export type ReviewEligibility = { eligible: boolean; review: { rating: number; comment: string | null; hidden: boolean } | null };
export type ClubOffer = { code: string; description: string | null; kind: CouponKind; value: number; min_subtotal_cents: number; ends_at: Timestamp | null };

export type ProductImageRow = { id: Uuid; product_id: Uuid; path: string; alt: string | null; sort: number; created_at: Timestamp };
export type InventoryRow = { store_id: Uuid; product_id: Uuid; quantity: number; updated_at: Timestamp };

export type PickupPointRow = {
  id: Uuid; name: string; carrier: string | null; address: string; city: string; postal_code: string;
  province: string; opening_hours: string | null; notes: string | null; active: boolean;
  created_at: Timestamp; updated_at: Timestamp;
};

export type ShippingRateRow = {
  id: Uuid; method: ShippedMethod; priority: number; min_subtotal_cents: number; max_subtotal_cents: number | null;
  min_weight_g: number; max_weight_g: number | null; price_cents: number; provisional: boolean; active: boolean;
  label: string | null; created_at: Timestamp; updated_at: Timestamp;
};

export type CouponKind = 'percent' | 'fixed' | 'free_shipping';
export type CouponRow = {
  id: Uuid; code: string; description: string | null; kind: CouponKind; value: number; min_subtotal_cents: number;
  starts_at: Timestamp | null; ends_at: Timestamp | null; max_redemptions: number | null;
  per_customer_limit: number | null; redemptions: number; active: boolean; created_at: Timestamp; updated_at: Timestamp;
  /** Only for CASA & TE Club members (checked in quote_cart). */
  club_only: boolean;
};

export type ProfileRow = {
  id: Uuid; email: string | null; full_name: string | null; phone: string | null; preferred_store_id: Uuid | null;
  marketing_opt_in: boolean; created_at: Timestamp; updated_at: Timestamp;
  /** Set when the customer joined the CASA & TE Club (set_club_membership RPC only). */
  club_member_since: Timestamp | null;
};

export type AddressRow = {
  id: Uuid; user_id: Uuid; label: string | null; full_name: string; line1: string; line2: string | null;
  city: string; province: string; postal_code: string; phone: string; is_default: boolean;
  created_at: Timestamp; updated_at: Timestamp;
};

export type StaffMemberRow = {
  user_id: Uuid; role: StaffRole; store_id: Uuid | null; display_name: string | null; email: string | null;
  active: boolean; created_at: Timestamp; updated_at: Timestamp;
  /** Back-office language. */
  locale: StaffLocale;
};

export type StaffLocale = 'it' | 'en' | 'zh';

/** Single-row shop settings (everyone reads, managers write). */
export type AppSettingsRow = {
  id: true; low_stock_threshold: number; club_enabled: boolean; club_tagline: string;
  updated_at: Timestamp; updated_by: Uuid | null;
};

/** Back-office audit trail, written by triggers. */
export type ActivityLogRow = {
  id: number; created_at: Timestamp; actor_id: Uuid | null; actor_name: string | null;
  entity: string; entity_id: string | null; label: string | null; action: 'insert' | 'update' | 'delete';
  changes: string[]; details: Record<string, [unknown, unknown]>;
};

export type ShippingAddressSnapshot = {
  full_name: string; line1: string; line2: string | null; city: string; province: string;
  postal_code: string; phone: string; country: 'IT';
};

export type PickupPointSnapshot = {
  name: string; carrier: string | null; address: string; city: string; postal_code: string; province: string;
};

export type InvoiceDetailsSnapshot = {
  company_name?: string; tax_code?: string; vat_number?: string; sdi_code?: string; pec?: string;
};

export type OrderRow = {
  id: Uuid; order_number: string; user_id: Uuid | null; store_id: Uuid; fulfilment: FulfilmentMethod;
  status: OrderStatus; payment_status: PaymentStatus; subtotal_cents: number; discount_cents: number;
  shipping_cents: number; total_cents: number; refunded_cents: number; total_weight_g: number;
  shipping_provisional: boolean; coupon_id: Uuid | null; coupon_code: string | null;
  customer_email: string | null; customer_name: string | null; customer_phone: string | null;
  shipping_address: ShippingAddressSnapshot | null; pickup_point_id: Uuid | null;
  pickup_point_snapshot: PickupPointSnapshot | null; invoice_requested: boolean;
  invoice_details: InvoiceDetailsSnapshot | null; notes: string | null; carrier: string | null;
  tracking_number: string | null; tracking_url: string | null; stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null; expires_at: Timestamp; paid_at: Timestamp | null;
  cancelled_at: Timestamp | null; completed_at: Timestamp | null; created_at: Timestamp; updated_at: Timestamp;
};

export type OrderItemRow = {
  id: Uuid; order_id: Uuid; product_id: Uuid | null; sku: string; name: string; image_path: string | null;
  unit_price_cents: number; vat_rate: number; weight_g: number; quantity: number; line_total_cents: number;
  picked_quantity: number;
};

export type OrderEventRow = {
  id: number; order_id: Uuid; status: OrderStatus | null; kind: 'status' | 'note' | 'payment' | 'refund' | 'system';
  note: string | null; visible_to_customer: boolean; actor_id: Uuid | null; created_at: Timestamp;
};

export type RefundRow = {
  id: Uuid; order_id: Uuid; amount_cents: number; reason: string | null; stripe_refund_id: string | null;
  created_by: Uuid | null; created_at: Timestamp;
};

export type InventoryMovementRow = {
  id: number; store_id: Uuid; product_id: Uuid; delta: number;
  reason: 'order_reserve' | 'order_release' | 'manual' | 'import' | 'stocktake';
  order_id: Uuid | null; actor_id: Uuid | null; created_at: Timestamp;
};

// ---- RPC payloads -----------------------------------------------------------

export type CartItemInput = { product_id: Uuid; quantity: number };

export type QuoteInput = {
  store_id: Uuid; items: CartItemInput[]; fulfilment?: FulfilmentMethod; coupon_code?: string;
};

export type QuoteLineIssue = 'unavailable' | 'invalid_quantity' | 'insufficient_stock';
export type QuoteLine = {
  product_id: Uuid; sku: string | null; name: string; image_path: string | null; unit_price_cents: number | null;
  vat_rate: number | null; weight_g: number | null; quantity: number; line_total_cents: number;
  available_quantity: number; issue: QuoteLineIssue | null;
};
export type MethodQuote = { price_cents: number; provisional: boolean } | null;

export type Quote = {
  store_id: Uuid; lines: QuoteLine[]; item_count: number; issue_count: number; subtotal_cents: number;
  discount_cents: number; total_weight_g: number;
  coupon: { code: string; kind: CouponKind; value: number; description: string | null } | null;
  coupon_error: string | null; shipping: Record<FulfilmentMethod, MethodQuote>;
  fulfilment: FulfilmentMethod | null; shipping_cents: number | null; total_cents: number | null;
};

export type AddressInput = {
  full_name: string; line1: string; line2?: string; city: string; province: string; postal_code: string; phone: string;
};

export type CreateOrderInput = QuoteInput & {
  fulfilment: FulfilmentMethod;
  address?: AddressInput;
  pickup_point_id?: Uuid;
  full_name?: string;
  phone?: string;
  notes?: string;
  invoice_requested?: boolean;
  invoice?: InvoiceDetailsSnapshot & { address?: string };
};

export type CheckoutResponse = { order_id: Uuid; order_number: string; checkout_url: string };

export type DashboardStats = {
  revenue_cents: number; orders: number; average_order_cents: number; refunded_cents: number;
  by_fulfilment: Partial<Record<FulfilmentMethod, number>>;
  by_day: Array<{ day: string; revenue_cents: number; orders: number }>;
  top_products: Array<{ sku: string; name: string; quantity: number; revenue_cents: number }>;
  open_orders: Partial<Record<OrderStatus, number>>;
  low_stock: Array<{ store_code: string; sku: string; name: string; quantity: number }>;
};

/** admin_overview(): the back-office "Panoramica" page. Days are Europe/Rome dates (YYYY-MM-DD). */
export type AdminOverviewDay = {
  day: string; revenue_cents: number; orders: number; customers: number; new_customers: number | null;
  /** Orders still to fulfil at the end of the day (only the last 8 days; null before). */
  open?: number | null;
};
export type AdminOverview = {
  today: string; from: string; to: string; prev_from: string; low_stock_threshold: number;
  series: AdminOverviewDay[];
  status: Partial<Record<OrderStatus, number>>;
  open: Partial<Record<OrderStatus, number>>;
  top_products: Array<{ product_id: string | null; sku: string; name: string; category: string; price_cents: number | null;
    image: string | null; quantity: number; revenue_cents: number }>;
  low_stock: Array<{ product_id: string; store_code: string; sku: string; name: string; quantity: number; image: string | null }>;
};

export type ImportRow = {
  sku: string; name: string; category?: string; price_cents: number; compare_at_price_cents?: number | null;
  vat_rate?: number; weight_g: number; barcode?: string; brand?: string; description?: string;
  active?: boolean; featured?: boolean; max_per_order?: number; image_url?: string; stock?: Record<string, number>;
  /** Import v2 (all optional; empty cells keep existing values). */
  subcategory?: string; color?: string; unit?: ProductUnit; unit_quantity?: number;
  highlights?: ProductHighlight[]; variant_group?: string; variant_title?: string; variant_label?: string; image_urls?: string[];
};

export type ImportReport = {
  dry_run: boolean; created: number; updated: number; failed: number;
  rows: Array<{ row: number; sku: string; result: 'created' | 'updated' | 'error'; error?: string }>;
};

/** Public URL for a product image path (storage path or absolute URL). */
export function productImageUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/product-images/${path.replace(/^\//, '')}`;
}
