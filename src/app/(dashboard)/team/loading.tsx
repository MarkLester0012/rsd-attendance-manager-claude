import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Search / filter */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Team cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                  <div className="mt-2 flex gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
