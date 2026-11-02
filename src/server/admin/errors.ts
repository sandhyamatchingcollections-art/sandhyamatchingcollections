import "server-only";

/** Turn database errors into sentences a shop owner can act on. */
export function friendlyDbError(e: { message?: string; code?: string; details?: string } | null | undefined): string {
  const msg = e?.message ?? "Something went wrong";
  if (/duplicate key.*products_slug|products_slug_key/.test(msg)) return "Another product already uses this web address (slug). Change the slug.";
  if (/duplicate key.*categories_slug|categories_slug_key/.test(msg)) return "Another category already uses this web address (slug). Change the slug.";
  if (/duplicate key.*collections_slug/.test(msg)) return "Another collection already uses this web address (slug).";
  if (/duplicate key.*sku/.test(msg)) {
    const sku = (e?.details ?? "").match(/\(sku\)=\(([^)]+)\)/)?.[1];
    return sku ? `SKU "${sku}" is already used by another product. Each SKU must be unique.` : "That SKU is already used by another product.";
  }
  if (/variant_piece_whole/.test(msg)) return "Pieces and sets must be sold in whole numbers. Use metres or yards for 0.5 steps.";
  if (/product_variants_check|mrp/.test(msg) && /check/.test(msg)) return "The MRP must be the same as or higher than the selling price.";
  if (/inventory_on_hand_check|on_hand >= 0/.test(msg)) return "Stock can't go below zero.";
  if (/row-level security|permission/i.test(msg)) return "You don't have permission to do that.";
  if (/categories_slug_check|products_slug_check|slug_check/.test(msg)) return "Web addresses (slugs) can only use lowercase letters, numbers and hyphens.";
  if (/sku_check/.test(msg)) return "SKUs can use letters, numbers, dots, dashes and underscores (max 40).";
  // Our own database functions already raise readable messages.
  if (e?.code && /^(P0002|23503|23514|22023|42501)$/.test(e.code)) return msg;
  console.error("db error:", e);
  return "Couldn't save. Please check the fields and try again.";
}
