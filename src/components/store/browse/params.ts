import type { BrowseQuery } from "@/lib/types";

export type SP = Record<string, string | string[] | undefined>;
export const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "newest", label: "Newest first" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
] as const;
type SortKey = NonNullable<BrowseQuery["sort"]>;
const SORT_KEYS: SortKey[] = ["featured", "newest", "price_asc", "price_desc", "relevance", "collection"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const rupeesToPaise = (v: string | undefined) => {
  if (!v || !/^\d{1,7}$/.test(v.trim())) return undefined;
  return Number(v.trim()) * 100;
};

/** Read filters from the URL. Unknown or malformed values are ignored, never trusted. */
export function parseBrowse(sp: SP, defaultSort: SortKey) {
  const attrs: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (!k.startsWith("a.")) continue;
    const key = k.slice(2);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    const vals = many(v).map((x) => x.slice(0, 120)).filter(Boolean).slice(0, 20);
    if (vals.length) attrs[key] = vals;
  }
  const sortRaw = one(sp.sort) as SortKey | undefined;
  const sort = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : defaultSort;
  const page = Math.min(Math.max(Number(one(sp.page)) || 1, 1), 500);
  return {
    sort, page, attrs,
    min: rupeesToPaise(one(sp.min)), max: rupeesToPaise(one(sp.max)),
    inStock: one(sp.stock) === "1",
    q: (one(sp.q) ?? "").trim().slice(0, 80),
  };
}
export type Parsed = ReturnType<typeof parseBrowse>;

/** Build a link to the same listing with some parameters changed. */
export function hrefWith(basePath: string, p: Parsed, patch: Partial<Parsed> & { removeAttr?: [string, string] }, defaultSort: string) {
  const next = { ...p, ...patch };
  const u = new URLSearchParams();
  if (next.q && !basePath.startsWith("/search?")) u.set("q", next.q);
  if (next.sort && next.sort !== defaultSort) u.set("sort", next.sort);
  if (next.min != null) u.set("min", String(next.min / 100));
  if (next.max != null) u.set("max", String(next.max / 100));
  if (next.inStock) u.set("stock", "1");
  for (const [k, vals] of Object.entries(next.attrs ?? {})) {
    for (const v of vals) {
      if (patch.removeAttr && patch.removeAttr[0] === k && patch.removeAttr[1] === v) continue;
      u.append(`a.${k}`, v);
    }
  }
  if (next.page && next.page > 1) u.set("page", String(next.page));
  const s = u.toString();
  return `${basePath}${s ? `?${s}` : ""}`;
}
