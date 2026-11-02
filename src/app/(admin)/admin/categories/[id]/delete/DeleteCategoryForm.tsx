"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, Field, Notice, btnDanger, btnSecondary, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { deleteCategory, type FormState } from "../../actions";

export function DeleteCategoryForm({ id, name, products, childCount, targets }: {
  id: string; name: string; products: number; childCount: number; targets: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(deleteCategory, {});
  const inUse = products > 0 || childCount > 0;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Card>
        {state.error && <div className="mb-4"><Notice tone="error">{state.error}</Notice></div>}
        {inUse ? (
          <>
            <p className="text-cocoa">
              “{name}” has <strong>{products} product{products === 1 ? "" : "s"}</strong> and{" "}
              <strong>{childCount} subcategor{childCount === 1 ? "y" : "ies"}</strong>. Nothing will be lost: choose where to move them.
            </p>
            <Field label="Move everything to" htmlFor="move_to" className="mt-5">
              <select id="move_to" name="move_to" required className={inputCls} defaultValue="">
                <option value="" disabled>Choose a category…</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <p className="mt-3 text-sm text-taupe">Prefer to keep it? <Link href="/admin/categories" className="underline">Hide it instead</Link> — products stay, the category disappears from the store.</p>
          </>
        ) : (
          <p className="text-cocoa">“{name}” is empty. Deleting it can&apos;t be undone.</p>
        )}
        <div className="mt-6 flex gap-3">
          <SubmitButton className={btnDanger} pendingText="Deleting…" confirm={`Delete "${name}" permanently?`}>
            {inUse ? "Move and delete" : "Delete category"}
          </SubmitButton>
          <Link href={`/admin/categories/${id}`} className={btnSecondary}>Cancel</Link>
        </div>
      </Card>
    </form>
  );
}
