"use client";

import { startTransition, useActionState, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { btnSecondary } from "./ui";

type State = { error?: string; ok?: string };

/**
 * Shrinks a photo in the browser (max 2400px, WebP) before sending, so phone photos upload
 * quickly and stay under hosting limits. The server still checks and re-encodes every file.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }) : file;
  } catch {
    return file;
  }
}

export function ImageUpload({ action, fields, label = "Upload photo", multiple = false }: {
  action: (prev: State, form: FormData) => Promise<State>;
  fields: Record<string, string>;
  label?: string;
  multiple?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const input = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      fd.set("file", await shrinkImage(f));
      startTransition(() => dispatch(fd));
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <label className={`${btnSecondary} cursor-pointer ${pending ? "pointer-events-none opacity-60" : ""}`}>
        <ImagePlus className="size-4" /> {pending ? "Uploading…" : label}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="sr-only"
          onChange={(e) => onPick(e.target.files)} />
      </label>
      <p role="status" className={`mt-2 text-xs ${state.error ? "text-rose" : "text-sage-deep"}`}>{state.error ?? state.ok ?? ""}</p>
      <p className="text-xs text-taupe">JPEG, PNG or WebP, up to 5 MB. Square or portrait photos look best.</p>
    </div>
  );
}
