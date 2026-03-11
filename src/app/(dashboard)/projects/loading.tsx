import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ProjectsLoading() {
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

      {/* Project cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex items-center gap-2 pt-2">
                <div className="flex -space-x-2">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-7 w-7 rounded-full border-2 border-background" />
                  ))}
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
