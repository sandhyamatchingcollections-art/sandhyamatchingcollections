// Shared by the product pages (server) and the product form (browser).
export type Unit = "piece" | "metre" | "yard" | "set";
export type VariantDraft = {
  id?: string; sku: string; title: string; color: string; size: string; price: string; mrp: string; unit: Unit;
  min_qty: string; qty_step: string; max_qty: string; track_inventory: boolean; weight_grams: string; is_active: boolean;
  initial_stock: string; on_hand?: number;
};
export type ProductDraft = {
  id?: string; name: string; slug: string; status: "draft" | "active" | "archived"; brand: string; description: string;
  is_featured: boolean; quote_only: boolean; seo_title: string; seo_description: string;
  gst_rate: string; hsn: string; // gst_rate "" = store default
  categories: { id: string; primary: boolean }[]; collections: string[]; attributes: Record<string, string[]>;
  variants: VariantDraft[];
};
export const blankVariant = (unit: Unit = "piece"): VariantDraft => ({
  sku: "", title: "", color: "", size: "", price: "", mrp: "", unit, min_qty: "1", qty_step: unit === "metre" || unit === "yard" ? "0.5" : "1",
  max_qty: "", track_inventory: true, weight_grams: "", is_active: true, initial_stock: "",
});
