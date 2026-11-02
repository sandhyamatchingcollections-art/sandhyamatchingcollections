import { revalidatePath as nextRevalidatePath, revalidateTag } from "next/cache";

/**
 * Use this instead of next/cache's revalidatePath in admin actions: it also clears the
 * short-lived storefront cache, so a change saved in the admin shows on the store at once.
 */
export function revalidatePath(...args: Parameters<typeof nextRevalidatePath>): void {
  revalidateTag("store");
  nextRevalidatePath(...args);
}
