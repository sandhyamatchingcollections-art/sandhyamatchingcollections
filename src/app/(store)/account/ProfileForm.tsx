"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";

const field = "mt-2 h-12 w-full rounded-xl border border-champagne bg-ivory px-4 text-[15px] focus:border-cocoa/50 focus:outline-none";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  return (
    <form action={action} className="mt-6 grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor="full_name" className="text-sm font-medium">Full name</label>
        <input id="full_name" name="full_name" defaultValue={state.values?.full_name ?? fullName} autoComplete="name" maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="phone" className="text-sm font-medium">Mobile number</label>
        <input id="phone" name="phone" defaultValue={state.values?.phone ?? phone} autoComplete="tel" inputMode="tel" placeholder="98xxxxxxxx" className={field} />
      </div>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button disabled={pending} className="min-h-11 rounded-full bg-cocoa px-6 text-sm font-medium text-cream hover:bg-cocoa-soft disabled:opacity-60">
          {pending ? "Saving…" : "Save details"}
        </button>
        <p role="status" className={`text-sm ${state.error ? "text-rose" : "text-sage-deep"}`}>
          {state.error ?? (state.ok ? "Saved." : "")}
        </p>
      </div>
    </form>
  );
}
