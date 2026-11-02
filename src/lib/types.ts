// Shared domain types for the storefront. They mirror the database read models.

export type Paise = number; // money is always integer paise

export type Tone = "blush" | "peach" | "lavender" | "sage" | "champagne";

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  children?: Category[];
}

export type SellingUnit = "piece" | "metre" | "yard" | "set";

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  price: Paise; // current selling price after eligible product discount
  mrp: Paise | null; // original price when discounted
  unit: SellingUnit;
  imageUrl: string | null;
  imageAlt: string;
  tone: Tone; // background tone for the placeholder when no image exists
  inStock: boolean;
  quoteOnly?: boolean; // "price on request": enquire instead of Add to Cart
  minQty?: number; // smallest amount that can be ordered (e.g. 1 m)
  qtyStep?: number; // amount added per step (e.g. 0.5 m)
  variantId?: string; // default variant (what "Add to Cart" on a card adds)
  variantCount?: number; // >1 means the shopper must choose colour/size on the product page
  defaultInStock?: boolean;
}

export type Facets = {
  count: number;
  price: { min: Paise | null; max: Paise | null };
  attributes: { key: string; label: string; type: "select" | "color" | "text"; values: { value: string; count: number }[] }[];
  categories: { slug: string; name: string; count: number }[];
};

export type BrowseQuery = {
  category?: string; collection?: string; q?: string;
  min?: Paise; max?: Paise; inStock?: boolean; attrs?: Record<string, string[]>;
  sort?: "featured" | "newest" | "price_asc" | "price_desc" | "relevance" | "collection";
  page?: number; perPage?: number;
};

export type VariantDetail = {
  id: string; sku: string; title: string; options: Record<string, string>; price: Paise; mrp: Paise | null;
  unit: SellingUnit; min_qty: number; qty_step: number; max_qty: number | null; is_default: boolean;
  available: number | null; // null = stock not tracked (always available)
};
export type ProductDetail = {
  id: string; slug: string; name: string; description: string | null; brand: string | null; quote_only: boolean;
  seo_title: string | null; seo_description: string | null;
  breadcrumbs: { name: string; slug: string }[];
  variants: VariantDetail[];
  images: { url: string; alt: string }[];
  specs: { label: string; values: string[] }[];
};

export type CartLineIn = { variant_id: string; qty: number };
export type QuotedLine = {
  variant_id: string; status: "ok" | "adjusted" | "unavailable" | "removed"; qty: number; message: string | null;
  product_id?: string; slug?: string; name?: string; title?: string; options?: Record<string, string>; sku?: string;
  price?: Paise; mrp?: Paise | null; unit?: SellingUnit; min_qty?: number; qty_step?: number; max_qty?: number | null;
  available?: number | null; image_url?: string | null; line_total?: Paise;
};
export type CartQuote = { lines: QuotedLine[]; subtotal: Paise };

export type PaymentMethod = "online" | "cod";
export type CouponResult = { ok: boolean; code?: string; message: string; kind?: "percent" | "flat" | "free_shipping"; discount?: Paise };
export type CheckoutQuote = CartQuote & {
  shipping_fee: Paise; cod_fee: Paise; total: Paise; free_shipping_min: Paise | null; discount: Paise; coupon: CouponResult | null;
  cod_allowed: boolean; cod_max_total: Paise | null; online_allowed: boolean;
};
export type ShippingAddress = {
  full_name: string; phone: string; line1: string; line2?: string | null; landmark?: string | null;
  city: string; state: string; pincode: string;
};
export type SavedAddress = ShippingAddress & { id: string; is_default: boolean };
export type OrderStatus = "pending_payment" | "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "on_hold";
export type OrderItem = {
  id: string; variant_id: string | null; product_id: string | null; sku: string; name: string; title: string;
  unit: SellingUnit; qty: number; price: Paise; mrp: Paise | null; line_total: Paise; image_url: string | null;
};
export type OrderView = {
  id: string; order_number: string; access_token: string; status: OrderStatus; payment_method: PaymentMethod;
  payment_status: "pending" | "paid" | "failed" | "cod" | "refunded" | "partially_refunded"; customer_name: string; email: string; phone: string;
  coupon_code: string | null; invoice_number: string | null; refunded_amount: Paise;
  shipping_address: ShippingAddress; subtotal: Paise; shipping_fee: Paise; cod_fee: Paise; discount: Paise; total: Paise;
  customer_note: string | null; cancel_reason: string | null; created_at: string; placed_at: string | null; paid_at: string | null;
  shipped_at: string | null; delivered_at: string | null; pay_open: boolean;
  items: OrderItem[]; events: { status: string; note: string | null; at: string }[];
};

export interface StoreSettings {
  name: string;
  tagline: string;
  description: string;
  shippingNote: string;
  whatsapp: string | null; // E.164 without "+", e.g. 919885949698
  instagramUrl: string | null;
  instagramHandle: string | null;
  facebookUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentMethods: string[]; // only methods actually enabled
  deliveryMinDays: number;
  shippingFee: number;
  freeShippingMin: number | null;
  codEnabled: boolean;
  codFee: number;
  codMaxTotal: number | null;
  onlinePaymentsEnabled: boolean;
  announcement: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  deliveryMaxDays: number;
  returnsNote: string;
}

export type BudgetRange = {
  key: string; // url slug: under-100, premium-picks
  label: string;
  maxPrice: Paise | null; // null = collection-based (Premium Picks)
  collectionSlug?: string;
  tone: Tone;
  enabled: boolean;
};

export type CTA = { label: string; href: string };

export type HomeSection =
  | { type: "hero"; id: string; eyebrow: string; heading: string; body: string; primary: CTA; secondary: CTA; imageUrl: string | null; imageAlt: string }
  | { type: "budget"; id: string; heading: string; body: string; ranges: BudgetRange[] }
  | { type: "feature"; id: string; variant: "bridal" | "kurta"; heading: string; body: string; cta: CTA; imageUrl: string | null; imageAlt: string; collectionSlug: string; imageSide: "left" | "right"; tone: Tone }
  | { type: "productRail"; id: string; source: "new-arrivals" | "bestsellers" | "collection"; collectionSlug?: string; heading: string; body: string; cta: CTA; limit: number }
  | { type: "promo"; id: string; heading: string; body: string; cta: CTA }
  | { type: "banners"; id: string; intervalSeconds: number }
  | { type: "bridalShowcase"; id: string; eyebrow: string; heading: string; body: string; imageUrl: string | null; imageAlt: string; cta: CTA;
      items: { label: string; note: string; href: string }[] }
  | { type: "owner"; id: string; eyebrow: string; heading: string; name: string; role: string; quote: string; body: string; imageUrl: string | null; imageAlt: string };

export type Banner = {
  id: string; title: string | null; subtitle: string | null; cta_label: string | null; link: string | null;
  image_url: string; mobile_image_url: string | null; alt: string; text_color: "dark" | "light";
};
export type ReviewSummary = { average: number; count: number; stars: Record<"1" | "2" | "3" | "4" | "5", number> };
export type Review = { id: string; author_name: string; rating: number; title: string | null; body: string | null; verified: boolean; created_at: string };

export interface Promotion {
  id: string;
  title: string; // shown to customers, e.g. "10% off silk sarees"
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}
