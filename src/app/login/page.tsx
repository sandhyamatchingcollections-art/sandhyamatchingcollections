import { redirect } from "next/navigation";
import { Logo } from "@/components/store/Header";
import { getStoreSettings } from "@/server/catalog";
import { getUser } from "@/server/auth";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Sign in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; error?: string; staff?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next = "/account", error, staff } = await searchParams;
  const safeNext = /^\/(?!\/)/.test(next) ? next : "/account";
  const isStaff = staff === "1" || safeNext.startsWith("/admin");
  if (await getUser()) redirect(safeNext);
  const s = await getStoreSettings();

  return (
    <div className="grid min-h-screen place-items-center bg-ivory px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center"><Logo name={s.name} /></div>
        <div className="mt-8 rounded-3xl border border-champagne bg-cream p-7 sm:p-9">
          <h1 className="text-3xl font-medium text-cocoa">{isStaff ? "Staff sign in" : "Sign in"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-taupe">
            {isStaff
              ? "Sign in with your staff email and password."
              : <>Enter your email and we&apos;ll send you a secure sign-in link. No password needed — new customers get an account automatically.</>}
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-blush px-4 py-3 text-sm text-cocoa">
              That sign-in link has expired or was already used. Please request a new one.
            </p>
          )}
          {isStaff ? <PasswordForm next={safeNext} /> : <LoginForm next={safeNext} />}
        </div>
      </div>
    </div>
  );
}