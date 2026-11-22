import { cn } from "@/lib/utils";

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[2000px] px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  count,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-meta text-muted-foreground">{eyebrow}</div>}
        <h1 className="flex items-baseline gap-3 text-display font-semibold">
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="text-heading font-normal text-subtle-foreground tabular-nums">{count}</span>}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
