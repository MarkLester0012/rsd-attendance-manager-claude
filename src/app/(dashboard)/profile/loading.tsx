import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfileLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-1 h-4 w-48" />
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
