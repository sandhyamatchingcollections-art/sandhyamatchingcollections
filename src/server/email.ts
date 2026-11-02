import "server-only";

// Order emails go through Resend (resend.com). Without RESEND_API_KEY nothing is sent and
// the store works exactly the same — emails are a bonus, never a blocker.
const KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.EMAIL_FROM ?? "";
const API = (process.env.EMAIL_API_BASE ?? "https://api.resend.com").replace(/\/$/, ""); // overridden only in tests
export const emailConfigured = Boolean(KEY && FROM);

export async function sendEmail(msg: { to: string; subject: string; html: string; replyTo?: string | null }): Promise<boolean> {
  if (!emailConfigured || !msg.to) return false;
  try {
    const res = await fetch(`${API}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [msg.to], subject: msg.subject, html: msg.html, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) console.error("email failed:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("email failed:", (e as Error).message);
    return false;
  }
}
