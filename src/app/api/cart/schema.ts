import { z } from "zod";

// What the browser may send: variant ids and quantities only. Prices never come from the browser.
export const CartLines = z.array(z.object({
  variant_id: z.string().uuid(),
  qty: z.number().positive().max(100000),
})).max(100);
