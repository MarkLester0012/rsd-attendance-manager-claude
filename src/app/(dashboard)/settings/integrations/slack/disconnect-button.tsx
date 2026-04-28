"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { disconnectSlack } from "./actions";

export function DisconnectButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDisconnect() {
    setLoading(true);
    const result = await disconnectSlack();
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Slack account disconnected");
    router.refresh();
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
    >
      {loading ? "Disconnecting..." : "Disconnect Slack"}
    </button>
  );
}
