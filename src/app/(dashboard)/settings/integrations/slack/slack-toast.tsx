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
    } else if (error === "already_linked") {
      toast.error("That Slack account is already linked to a different user");
    } else if (error === "session_mismatch" || error === "not_authenticated") {
      toast.error("Session mismatch — sign in again and retry from this page");
    } else if (error === "invalid_state") {
      toast.error("Authorization link expired — please try again");
    } else if (error) {
      toast.error("Failed to connect Slack account");
    }
  }, [params]);

  return null;
}
