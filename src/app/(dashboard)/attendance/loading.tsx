import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AttendanceLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with date nav */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-1 h-4 w-52" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* User list */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
