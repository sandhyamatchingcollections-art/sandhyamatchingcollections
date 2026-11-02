import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Package, FolderTree, Boxes, ShoppingCart, Users, TicketPercent, Megaphone, Image as ImageIcon,
  Sparkles, Star, Truck, Receipt, CreditCard, Home, BarChart3, Settings, ShieldCheck, Search, Bell, FileText,
} from "lucide-react";

// The 20 admin modules from the brief, grouped for navigation. `phase` = when it becomes functional.
export const adminGroups = [
  { title: "Overview", items: [{ slug: "", ready: true, label: "Dashboard", icon: LayoutDashboard, perm: null, phase: 8 }] },
  { title: "Catalogue", items: [
    { slug: "products", ready: true, label: "Products", icon: Package, perm: "catalog.write", phase: 4 },
    { slug: "categories", ready: true, label: "Categories", icon: FolderTree, perm: "catalog.write", phase: 4 },
    { slug: "inventory", ready: true, label: "Inventory", icon: Boxes, perm: "inventory.write", phase: 4 },
    { slug: "collections", ready: true, label: "Featured Collections", icon: Sparkles, perm: "catalog.write", phase: 4 },
    { slug: "reviews", ready: true, label: "Reviews & Ratings", icon: Star, perm: "catalog.write", phase: 8 },
  ]},
  { title: "Sales", items: [
    { slug: "orders", ready: true, label: "Orders", icon: ShoppingCart, perm: "orders.write", phase: 6 },
    { slug: "customers", ready: true, label: "Customers", icon: Users, perm: "customers.read", phase: 8 },
    { slug: "coupons", ready: true, label: "Coupons & Discounts", icon: TicketPercent, perm: "promotions.write", phase: 7 },
    { slug: "offers", ready: true, label: "Offers & Campaigns", icon: Megaphone, perm: "promotions.write", phase: 7 },
  ]},
  { title: "Storefront", items: [
    { slug: "homepage", ready: true, label: "Homepage", icon: Home, perm: "content.write", phase: 8 },
    { slug: "banners", ready: true, label: "Promotional Banners", icon: ImageIcon, perm: "content.write", phase: 8 },
    { slug: "pages", ready: true, label: "Pages & Policies", icon: FileText, perm: "content.write", phase: 8 },
    { slug: "seo", ready: true, label: "SEO Settings", icon: Search, perm: "content.write", phase: 8 },
  ]},
  { title: "Settings", items: [
    { slug: "shipping", ready: true, label: "Shipping", icon: Truck, perm: "settings.store", phase: 6 },
    { slug: "tax", ready: true, label: "Tax", icon: Receipt, perm: "settings.store", phase: 7 },
    { slug: "payments", ready: true, label: "Payments", icon: CreditCard, perm: "settings.payments", phase: 6 },
    { slug: "store", ready: true, label: "Store Settings", icon: Settings, perm: "settings.store", phase: 8 },
    { slug: "staff", ready: true, label: "Admin Users & Roles", icon: ShieldCheck, perm: "staff.manage", phase: 3 },
    { slug: "reports", ready: true, label: "Reports & Analytics", icon: BarChart3, perm: "reports.view", phase: 7 },
    { slug: "audit", ready: true, label: "Audit Log", icon: Bell, perm: "audit.view", phase: 8 },
  ]},
] as const;

export type AdminModule = { slug: string; label: string; icon: LucideIcon; perm: string | null; phase: number; ready?: boolean };
export const allModules: AdminModule[] = adminGroups.flatMap((g) => [...g.items]);
