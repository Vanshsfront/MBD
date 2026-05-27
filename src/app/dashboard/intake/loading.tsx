import { Skeleton } from "@/components/ui/skeleton";

export default function IntakeLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-6 md:grid-cols-[380px_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
