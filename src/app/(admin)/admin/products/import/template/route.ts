import { NextResponse } from "next/server";
import { getPermissions } from "@/server/auth";
import { CSV_COLUMNS, toCsv } from "@/server/admin/csv";

export async function GET() {
  if (!(await getPermissions()).has("catalog.write")) return new NextResponse("Not allowed", { status: 403 });
  const csv = toCsv([
    { sku: "BLS-RAWSILK-ROSE", name: "Raw Silk Blouse Material — Rose", category: "Blouse Fabrics", price: "180", mrp: "220", unit: "metre", min_qty: "1", qty_step: "0.5", stock: "40", status: "draft", collections: "", description: "Soft raw silk, 44 inch width." },
    { sku: "BNG-GLASS-12", name: "Glass Bangles (Set of 12)", category: "Bangles", price: "95", mrp: "", unit: "set", min_qty: "1", qty_step: "1", stock: "60", status: "draft", collections: "Bestsellers", description: "" },
  ], CSV_COLUMNS);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="products-template.csv"', "cache-control": "no-store" },
  });
}
