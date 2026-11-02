import { CheckCircle2, Circle } from "lucide-react";
import { canUse } from "@/server/auth";
import { SITE_URL, supabaseConfigured } from "@/lib/supabase/env";
import { getStoreSettings } from "@/server/catalog";
import { onlinePaymentsReady, razorpayKeyId, razorpayMode, razorpaySecretSet, webhookConfigured } from "@/server/razorpay";
import { serverKeyConfigured } from "@/server/supabase-admin";
import { Card, Notice, PageHeader, btnPrimary, btnSecondary } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NeedsDatabase, NoAccess } from "@/components/admin/NoAccess";
import { toggleOnlinePayments } from "./actions";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

function Row({ ok, title, help }: { ok: boolean; title: string; help: string }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`mt-0.5 size-5 shrink-0 ${ok ? "text-sage-deep" : "text-taupe"}`} />
      <span><span className="font-medium">{title}</span><span className="block text-sm text-taupe">{help}</span></span>
    </li>
  );
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!(await canUse("settings.payments"))) return <NoAccess what="payment settings" />;
  if (!supabaseConfigured) return <NeedsDatabase />;
  const [s, sp] = await Promise.all([getStoreSettings(), searchParams]);
  const masked = razorpayKeyId ? `${razorpayKeyId.slice(0, 9)}…${razorpayKeyId.slice(-4)}` : "";
  return (
    <div className="max-w-3xl">
      <PageHeader title="Payments">Online payments by Razorpay. Keys are kept in the server settings, never in the database or the browser.</PageHeader>
      <div className="mb-6 space-y-3">
        {sp.saved && <Notice tone="success">Saved.</Notice>}
        {sp.error && <Notice tone="error">{sp.error.slice(0, 200)}</Notice>}
        {razorpayMode === "test" && <Notice tone="info">Razorpay is in <strong>test mode</strong>: no real money moves. Switch to live keys before launch.</Notice>}
      </div>

      <Card title="Online payment status">
        <ul className="divide-y divide-champagne">
          <Row ok={Boolean(razorpayKeyId)} title={razorpayKeyId ? `Razorpay key: ${masked} (${razorpayMode})` : "Razorpay key id"} help="RAZORPAY_KEY_ID in the server settings." />
          <Row ok={razorpaySecretSet} title="Razorpay key secret" help="RAZORPAY_KEY_SECRET in the server settings." />
          <Row ok={serverKeyConfigured} title="Supabase secret key" help="SUPABASE_SECRET_KEY lets the server record verified payments." />
          <Row ok={webhookConfigured} title="Webhook (recommended)" help={`In Razorpay → Webhooks, add ${SITE_URL}/api/webhooks/razorpay with events payment.captured and order.paid, then put its secret in RAZORPAY_WEBHOOK_SECRET.`} />
        </ul>
        <p className="mt-4 text-sm">
          {onlinePaymentsReady
            ? s.onlinePaymentsEnabled ? "Customers can pay online at checkout." : "Online payment is ready but switched off."
            : "Online payment appears at checkout once the keys above are set. Until then customers can use Cash on Delivery."}
        </p>
        {onlinePaymentsReady && (
          <form action={toggleOnlinePayments} className="mt-4">
            <input type="hidden" name="on" value={s.onlinePaymentsEnabled ? "0" : "1"} />
            <SubmitButton className={s.onlinePaymentsEnabled ? btnSecondary : btnPrimary}>{s.onlinePaymentsEnabled ? "Turn off online payment" : "Turn on online payment"}</SubmitButton>
          </form>
        )}
      </Card>
      
    </div>
  );
}
