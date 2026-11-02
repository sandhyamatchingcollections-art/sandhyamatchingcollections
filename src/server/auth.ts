import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseForUser } from "@/lib/supabase/server";

export type Permission =
  | "catalog.write" | "inventory.write" | "orders.write" | "promotions.write" | "content.write"
  | "customers.read" | "settings.store" | "settings.payments" | "staff.manage" | "reports.view" | "audit.view" | "orders.refund";

export type StaffContext = { user: User; permissions: Set<Permission>; preview?: false } | { user: null; permissions: Set<Permission>; preview: true };

/**
 * The signed-in user. The sign-in token's signature is verified (getClaims checks it locally with
 * Supabase's public signing keys, or asks the Auth server for older projects), so a forged cookie
 * is never trusted. Permissions are still checked in the database on every admin action.
 */
export const getUser = cache(async (): Promise<User | null> => {
  if (!supabaseConfigured) return null;
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (error || !c?.sub) return null;
  return { id: c.sub, email: c.email, aud: String(c.aud ?? "authenticated"), role: c.role, app_metadata: c.app_metadata ?? {},
    user_metadata: c.user_metadata ?? {}, created_at: "" } as User;
});

/** Permissions come from the database (role_permissions), never from the browser. */
export const getPermissions = cache(async (): Promise<Set<Permission>> => {
  const user = await getUser();
  if (!user) return new Set();
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) throw new Error(`Could not check permissions: ${error.message}`);
  return new Set((data as string[]) as Permission[]);
});

/**
 * Gate for every admin page. Signed-out → login; signed-in without a staff role → 403 page.
 * Without Supabase (local design work only) an unauthenticated preview is allowed in development.
 */
export async function requireStaff(nextPath = "/admin"): Promise<StaffContext> {
  if (!supabaseConfigured) {
    if (process.env.NODE_ENV !== "production") return { user: null, permissions: new Set(), preview: true };
    throw new Error("Supabase is not configured");
  }
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const permissions = await getPermissions();
  if (permissions.size === 0) redirect("/admin-denied");
  return { user, permissions };
}

/** For server actions: throws unless the current user holds the permission. */
export async function requirePermission(perm: Permission): Promise<User> {
  const user = await getUser();
  if (!user) throw new Error("Please sign in.");
  if (!(await getPermissions()).has(perm)) throw new Error("You don't have permission to do that.");
  return user;
}

/** For admin pages: true when the viewer may use this screen (design preview allows everything). */
export async function canUse(perm: Permission): Promise<boolean> {
  const ctx = await requireStaff();
  return ctx.preview || ctx.permissions.has(perm);
}
