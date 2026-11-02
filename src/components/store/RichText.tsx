import Link from "next/link";
import type { ReactNode } from "react";

// A tiny, safe formatter for owner-written pages: "## Heading", "### Subheading", "- list item",
// blank lines between paragraphs, **bold** and [link text](/path or https://…). No HTML is ever rendered.
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:\/|https?:\/\/|mailto:|tel:)[^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-cocoa">{m[1]}</strong>);
    else if (m[3].startsWith("/")) out.push(<Link key={`${key}-${i++}`} href={m[3]} className="underline underline-offset-4">{m[2]}</Link>);
    else out.push(<a key={`${key}-${i++}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 leading-relaxed text-cocoa-soft">
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^[-*] /.test(l.trim()))) {
          return <ul key={bi} className="list-disc space-y-1 pl-5">{lines.map((l, li) => <li key={li}>{inline(l.trim().slice(2), `${bi}-${li}`)}</li>)}</ul>;
        }
        return (
          <div key={bi} className="space-y-2">
            {lines.map((l, li) => {
              const t = l.trim();
              if (t.startsWith("### ")) return <h3 key={li} className="pt-2 text-xl font-medium text-cocoa">{inline(t.slice(4), `${bi}-${li}`)}</h3>;
              if (t.startsWith("## ")) return <h2 key={li} className="pt-4 text-2xl font-medium text-cocoa">{inline(t.slice(3), `${bi}-${li}`)}</h2>;
              if (/^[-*] /.test(t)) return <p key={li} className="pl-5 before:-ml-4 before:mr-2 before:content-['•']">{inline(t.slice(2), `${bi}-${li}`)}</p>;
              return <p key={li}>{inline(t, `${bi}-${li}`)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
