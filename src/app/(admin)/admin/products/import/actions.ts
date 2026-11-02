"use server";

import { revalidatePath } from "@/server/revalidate";
import { requirePermission } from "@/server/auth";
import { supabaseForUser } from "@/lib/supabase/server";
import { friendlyDbError } from "@/server/admin/errors";
import { MAX_IMPORT_BYTES, previewCsv, type PreviewRow } from "@/server/admin/csv";

export type ImportState = {
  stage: "upload" | "preview" | "done";
  error?: string;
  rows?: PreviewRow[];
  csv?: string; // kept so "Import" re-checks the exact same file on the server
  updateExisting?: boolean;
  result?: { created: number; updated: number; skipped: number };
};

async function readFile(form: FormData): Promise<string> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) throw new Error("Choose a CSV file.");
  if (f.size > MAX_IMPORT_BYTES) throw new Error("The file is larger than 2 MB. Split it into smaller files.");
  const text = await f.text();
  if (text.includes("\u0000")) throw new Error("That doesn't look like a CSV file. In Excel use File → Save As → CSV UTF-8.");
  return text;
}

export async function importStep(prev: ImportState, form: FormData): Promise<ImportState> {
  try {
    await requirePermission("catalog.write");
    const s = await supabaseForUser();
    const step = form.get("step");
    if (step === "reset") return { stage: "upload" };

    if (step === "preview") {
      const csv = await readFile(form);
      const updateExisting = form.get("update_existing") === "on";
      const { fatal, rows } = await previewCsv(s, csv, updateExisting);
      if (fatal) return { stage: "upload", error: fatal };
      return { stage: "preview", rows, csv, updateExisting };
    }

    if (step === "import") {
      // Re-check on the server: the browser's copy of the preview is never trusted.
      const csv = String(form.get("csv") ?? "");
      if (!csv || csv.length > MAX_IMPORT_BYTES * 2) return { stage: "upload", error: "Please upload the file again." };
      const updateExisting = form.get("update_existing") === "true";
      const { fatal, rows } = await previewCsv(s, csv, updateExisting);
      if (fatal) return { stage: "upload", error: fatal };
      if (rows.some((r) => r.action === "error")) return { stage: "preview", rows, csv, updateExisting, error: "Fix the rows marked in red, then upload again." };
      const todo = rows.filter((r) => r.action !== "skip").map((r) => r.payload);
      const { data, error } = await s.rpc("import_products", { p_rows: todo, p_update_existing: updateExisting });
      if (error) return { stage: "preview", rows, csv, updateExisting, error: `Nothing was imported: ${friendlyDbError(error)}` };
      const result = data as { created: number; updated: number; skipped: number };
      result.skipped += rows.filter((r) => r.action === "skip").length;
      revalidatePath("/admin/products");
      return { stage: "done", result };
    }
    return prev;
  } catch (e) {
    return { stage: "upload", error: (e as Error).message };
  }
}
