import { PageContainer } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const HEIGHTS = [280, 360, 220, 420, 300, 240, 380, 260, 340, 300, 220, 400];

export default function Loading() {
  return (
    <PageContainer>
      <div role="status" aria-label="Loading references">
        <Skeleton className="mb-3 h-8 w-72" />
        <Skeleton className="mb-8 h-4 w-96 max-w-full" />
        <div className="mb-6 flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="ml-auto h-9 w-40" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="columns-1 gap-5 min-[540px]:columns-2 min-[900px]:columns-3 min-[1240px]:columns-4">
          {HEIGHTS.map((h, i) => (
            <div key={i} className="mb-5 break-inside-avoid">
              <Skeleton className="w-full rounded-lg" style={{ height: h }} />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </PageContainer>
  );
}
