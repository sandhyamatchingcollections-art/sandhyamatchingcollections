import "server-only";
import crypto from "node:crypto";
import { serverKeyConfigured } from "./supabase-admin";

// Razorpay keys live in .env.local / Vercel settings, never in the browser bundle
// (the key id is public and is sent to the payment window when needed).
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const API = (process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com").replace(/\/$/, ""); // overridden only in tests

export const razorpayKeyId = KEY_ID;
/** Online payment can be offered only when every key needed to confirm it is present. */
export const onlinePaymentsReady = Boolean(KEY_ID && KEY_SECRET && serverKeyConfigured);
export const razorpayMode = KEY_ID.startsWith("rzp_live_") ? "live" : KEY_ID ? "test" : "none";
export const webhookConfigured = Boolean(WEBHOOK_SECRET);
export const razorpaySecretSet = Boolean(KEY_SECRET);

/** Create a Razorpay order for the exact amount in paise. */
export async function createRazorpayOrder(amount: number, receipt: string, notes: Record<string, string>): Promise<string> {
  const res = await fetch(`${API}/v1/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"),
    },
    body: JSON.stringify({ amount, currency: "INR", receipt, notes }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay error ${res.status}`);
  return body.id;
}

/** Refund (part of) a captured payment. Returns Razorpay's refund id. */
export async function refundRazorpayPayment(paymentId: string, amount: number, notes: Record<string, string>): Promise<string> {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"),
    },
    body: JSON.stringify({ amount, notes }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay error ${res.status}`);
  return body.id;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** The payment window's success callback is genuine only if this signature matches. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!KEY_SECRET) return false;
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Webhooks are signed over the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
