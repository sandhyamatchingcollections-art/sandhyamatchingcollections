import { z } from "zod";
import { CartLines } from "../cart/schema";

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, msg);

export const Method = z.enum(["online", "cod"]);
export const Coupon = z.string().trim().max(30).regex(/^[A-Za-z0-9_-]*$/, "This coupon code isn't valid.").optional().default("");

export const PlaceOrder = z.object({
  lines: CartLines,
  method: Method,
  name: text(2, 80, "Enter your name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: z.string().trim().transform((s) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.")),
  address: z.object({
    full_name: text(2, 80, "Enter the receiver's name."),
    line1: text(3, 160, "Enter the house / street."),
    line2: z.string().trim().max(160).optional().default(""),
    landmark: z.string().trim().max(80).optional().default(""),
    city: text(2, 60, "Enter the city."),
    state: text(2, 60, "Choose the state."),
    pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  }),
  note: z.string().trim().max(500).optional().default(""),
  save_address: z.boolean().optional().default(false),
  coupon: Coupon,
  expected_total: z.number().int().nonnegative(),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrder>;
