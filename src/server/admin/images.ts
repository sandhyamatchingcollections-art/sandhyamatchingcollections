import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Validate an uploaded image by its actual bytes (not its name or claimed type),
 * then re-encode to WebP: max 2000px, EXIF/GPS stripped, orientation applied.
 */
export async function processImage(file: File): Promise<Buffer> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Images must be under 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("Only JPEG, PNG or WebP photos can be uploaded.");
  try {
    const img = sharp(bytes, { limitInputPixels: 50_000_000 }).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw new Error("small");
    return await img.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch (e) {
    if ((e as Error).message === "small") throw new Error("This image is too small. Use a photo at least 200 × 200 pixels.");
    throw new Error("This file couldn't be read as an image.");
  }
}

/** Upload a processed image as the signed-in staff member (Storage RLS checks their role). */
export async function uploadImage(s: SupabaseClient, bucket: "product-images" | "campaign-images", folder: string, data: Buffer): Promise<string> {
  const path = `${folder}/${randomUUID()}.webp`;
  const { error } = await s.storage.from(bucket).upload(path, data, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(/row-level|Unauthorized/i.test(error.message) ? "You don't have permission to upload images." : `Upload failed: ${error.message}`);
  return path;
}

export async function removeImageIfUnused(s: SupabaseClient, bucket: "product-images", path: string, table: "product_images" | "categories") {
  // Duplicated products share image files; only delete the file when nothing points at it.
  const col = table === "product_images" ? "storage_path" : "image_path";
  const { count } = await s.from(table).select("*", { count: "exact", head: true }).eq(col, path);
  if (!count) await s.storage.from(bucket).remove([path]);
}
