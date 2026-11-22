import Link from "next/link";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center sm:py-24", className)}>
      <div className="mb-5 grid size-12 place-items-center rounded-xl border bg-card text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <h2 className="text-heading font-medium">{title}</h2>
      <div className="mt-2 max-w-md text-body text-muted-foreground">{description}</div>
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-foreground underline underline-offset-4 hover:text-highlight">
      {children}
    </Link>
  );
}
