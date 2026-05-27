import { Skeleton } from "@/components/ui/skeleton";

// Shared loading placeholders so every segment can ship a consistent skeleton
// via its loading.tsx instead of a blank flash.

export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <div className="space-y-2 rounded-xl border border-[color:var(--border-light)] bg-card p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
