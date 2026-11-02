"use client";

import { useActionState } from "react";
import { addStaff, type StaffState } from "./actions";

const field = "mt-2 h-11 w-full rounded-xl border border-champagne bg-ivory px-4 text-sm focus:border-cocoa/50 focus:outline-none";

export function AddStaffForm() {
  const [state, action, pending] = useActionState<StaffState, FormData>(addStaff, {});
  return (
    <form action={action} className="mt-5 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
      <div>
        <label htmlFor="staff-email" className="text-sm font-medium">Email</label>
        <input id="staff-email" name="email" type="email" required defaultValue={state.values?.email} className={field} />
      </div>
      <div>
        <label htmlFor="staff-role" className="text-sm font-medium">Role</label>
        <select id="staff-role" name="role" defaultValue={state.values?.role ?? "product_manager"} className={field}>
          <option value="product_manager">Product Manager</option>
          <option value="order_manager">Order Manager</option>
          <option value="store_manager">Store Manager</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>
      <button disabled={pending} className="min-h-11 rounded-full bg-cocoa px-6 text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-60">
        {pending ? "Adding…" : "Add"}
      </button>
      <p role="status" className={`text-sm sm:col-span-3 ${state.error ? "text-rose" : "text-sage-deep"}`}>{state.error ?? state.ok ?? ""}</p>
    </form>
  );
}
