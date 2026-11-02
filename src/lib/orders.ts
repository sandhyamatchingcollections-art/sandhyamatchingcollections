// Shared order wording for the store and the admin.
import type { OrderStatus } from "./types";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  placed: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  on_hold: "On hold",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending_payment: "bg-peach text-cocoa",
  placed: "bg-lavender text-cocoa",
  confirmed: "bg-lavender text-cocoa",
  packed: "bg-champagne text-cocoa",
  shipped: "bg-sage text-cocoa",
  delivered: "bg-sage-deep text-cream",
  cancelled: "bg-blush text-rose",
  on_hold: "bg-peach text-rose",
};

export const PAYMENT_LABEL: Record<string, string> = {
  pending: "Not paid yet",
  paid: "Paid",
  failed: "Not paid",
  cod: "Cash on Delivery",
  refunded: "Refunded",
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];
