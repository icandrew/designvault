import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <rect x="3" y="3" width="11" height="14" rx="2.25" className="fill-foreground" />
      <rect x="10" y="7" width="11" height="14" rx="2.25" className="fill-background stroke-foreground" strokeWidth="1.5" />
      <path d="M13 17.5h5" className="stroke-foreground" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
