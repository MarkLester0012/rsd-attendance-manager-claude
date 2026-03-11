import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function HolidaysLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-1 h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Holiday cards */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
