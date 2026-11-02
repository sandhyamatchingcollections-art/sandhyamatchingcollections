"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { sendLoginLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLoginLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div role="status" className="mt-6 rounded-2xl bg-sage px-5 py-5 text-cocoa">
        <MailCheck className="size-6" strokeWidth={1.6} />
        <p className="mt-2 font-medium">Check your email</p>
        <p className="mt-1 text-sm text-cocoa-soft">
          We sent a sign-in link to <strong>{state.email}</strong>. Open it on this device. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6" noValidate>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-medium text-cocoa">Email address</label>
      <input
        id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email}
        aria-invalid={state.status === "error"} aria-describedby={state.status === "error" ? "email-error" : undefined}
        className="mt-2 h-12 w-full rounded-xl border border-champagne bg-ivory px-4 text-[15px] text-cocoa focus:border-cocoa/50 focus:outline-none"
      />
      {state.status === "error" && <p id="email-error" role="alert" className="mt-2 text-sm text-rose">{state.message}</p>}
      <button type="submit" disabled={pending}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-cocoa text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-60">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
