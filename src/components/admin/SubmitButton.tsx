"use client";

import { useFormStatus } from "react-dom";
import { btnPrimary } from "./ui";

export function SubmitButton({ children, pendingText = "Saving…", className = btnPrimary, name, value, confirm, busy = false }: {
  children: React.ReactNode; pendingText?: string; className?: string; name?: string; value?: string; confirm?: string; busy?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" name={name} value={value} disabled={pending || busy} className={className}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending || busy ? pendingText : children}
    </button>
  );
}
