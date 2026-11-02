import Link from "next/link";
import type { Tone } from "@/lib/types";

const toneBg: Record<Tone, string> = {
  blush: "bg-blush",
  peach: "bg-peach",
  lavender: "bg-lavender",
  sage: "bg-sage",
  champagne: "bg-champagne",
};
export const toneClass = (t: Tone) => toneBg[t];

type BtnProps = { href: string; children: React.ReactNode; variant?: "solid" | "outline" | "ghost"; className?: string };

export function ButtonLink({ href, children, variant = "solid", className = "" }: BtnProps) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium tracking-wide transition-colors duration-200";
  const styles = {
    solid: "bg-cocoa text-cream hover:bg-cocoa-soft",
    outline: "border border-cocoa/30 text-cocoa hover:border-cocoa hover:bg-cream",
    ghost: "text-cocoa underline-offset-4 hover:underline",
  }[variant];
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function SectionHeading({ title, body, align = "center" }: { title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <h2 className="text-3xl font-medium leading-tight text-cocoa sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-taupe">{body}</p>}
    </div>
  );
}

/**
 * Stand-in visual until the owner uploads a photo from the admin.
 * Deliberately abstract (no stock models) so nothing unlicensed ships.
 */
export function PhotoPlaceholder({
  tone,
  label,
  className = "",
  motif = "paisley",
}: {
  tone: Tone;
  label: string;
  className?: string;
  motif?: "paisley" | "drape" | "none";
}) {
  return (
    <div role="img" aria-label={label} className={`weave relative overflow-hidden ${toneClass(tone)} ${className}`}>
      {motif !== "none" && (
        <svg aria-hidden viewBox="0 0 200 260" className="absolute inset-0 h-full w-full text-cocoa/10" preserveAspectRatio="xMidYMid slice">
          {motif === "paisley" ? (
            <g fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M100 60c30 0 48 26 40 56-8 30-44 52-60 84 0-40-36-56-30-96 4-26 24-44 50-44z" />
              <path d="M100 82c18 0 28 16 22 34-5 18-26 30-36 50-1-24-20-34-16-58 3-16 14-26 30-26z" />
              <circle cx="104" cy="104" r="6" />
            </g>
          ) : (
            <g fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M40 0c20 80 10 160 30 260M80 0c14 90 4 170 24 260M120 0c10 90 0 170 18 260M160 0c6 90-6 170 10 260" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
