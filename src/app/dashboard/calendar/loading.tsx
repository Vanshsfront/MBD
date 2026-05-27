import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-[560px] w-full rounded-xl" />
    </div>
  );
}
