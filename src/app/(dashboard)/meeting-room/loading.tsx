import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function MeetingRoomLoading() {
  return (
    <div className="space-y-6">
      {/* Page header with button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Hero status banner */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-96" />
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Date nav + tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-72 rounded-md" />
      </div>

      {/* Booking cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-40" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
