import { STAGE_STYLE, cn } from "@/lib/utils";
import type { ComponentProps } from "react";

type Variant = "primary" | "pop" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  pop: "bg-pop text-ink font-semibold hover:brightness-95 shadow-[0_1px_0_rgba(0,0,0,0.08)]",
  secondary: "bg-surface text-ink border border-line hover:border-ink/40",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-surface text-warn border border-line hover:border-warn/50",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-5 text-sm",
    variants[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/5 placeholder:text-muted/70";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-24 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...props} />;
}

export function Badge({ className, tone = "neutral", ...props }: ComponentProps<"span"> & { tone?: "neutral" | "accent" | "warn" }) {
  const tones = {
    neutral: "bg-paper text-muted border-line",
    accent: "bg-accent-soft text-accent border-accent/15",
    warn: "bg-orange-50 text-warn border-orange-200",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} {...props} />;
}

export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone = score >= 80 ? "bg-pop text-ink" : score >= 65 ? "bg-accent text-white" : score >= 50 ? "bg-accent-soft text-accent" : "bg-paper text-muted";
  return <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold", tone)}>{score}</span>;
}

export function OrgTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return <Badge className="capitalize">{type}</Badge>;
}

/** Minimal, safe Markdown renderer (paragraphs, headings, bullets, bold/italic, links). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={cn("prose-cv", className)}>
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        const h = lines[0].match(/^(#{1,3})\s+(.*)/);
        if (h && lines.length === 1) {
          const Tag = (`h${h[1].length + 1}`) as "h2" | "h3" | "h4";
          return <Tag key={i}>{inline(h[2])}</Tag>;
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {inline(l.replace(/^#{1,6}\s+/, ""))}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && /^https?:\/\//.test(link[2]))
      return (
        <a key={i} href={link[2]} className="underline underline-offset-2" target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    return p;
  });
}

export function StageDot({ status, className }: { status: string; className?: string }) {
  const st = STAGE_STYLE[status] ?? STAGE_STYLE.new;
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: st.dot }} />;
}
