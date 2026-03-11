import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function MyLeavesLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-1 h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-7 w-12" />
              <Skeleton className="mt-1 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leaves table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Table header */}
            <div className="flex gap-4 border-b pb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 flex-1" />
            </div>
            {/* Table rows */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
