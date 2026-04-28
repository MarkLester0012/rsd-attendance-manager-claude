"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function SlackToast() {
  const params = useSearchParams();

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "1") {
      toast.success("Slack account connected successfully");
    } else if (error === "access_denied") {
      toast.error("Slack authorization was cancelled");
    } else if (error) {
      toast.error("Failed to connect Slack account");
    }
  }, [params]);

  return null;
}
