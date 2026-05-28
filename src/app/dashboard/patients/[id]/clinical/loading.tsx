import { Skeleton } from "@/components/ui/skeleton";

export default function ClinicalLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-72" />
      <Skeleton className="h-4 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
