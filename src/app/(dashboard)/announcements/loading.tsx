import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AnnouncementsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Announcement cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
