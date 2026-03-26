"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePendingCount(initialCount: number, userRole: string) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (userRole !== "leader" && userRole !== "hr") return;

    const supabase = createClient();

    async function fetchCount() {
      const { count: newCount } = await supabase
        .from("leaves")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      setCount(newCount || 0);
    }

    const channel = supabase
      .channel("sidebar-pending-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaves" },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  return count;
}
