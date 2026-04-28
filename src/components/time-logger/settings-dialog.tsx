"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveRedmineConfig, testRedmineConnection } from "@/app/(dashboard)/time-logger/actions";

const configSchema = z.object({
  redmine_url: z
    .string()
    .url("Must be a valid URL")
    .refine((url) => !url.endsWith("/"), "URL should not end with /"),
  api_key: z.string().min(1, "API key is required"),
});

type ConfigFormData = z.infer<typeof configSchema>;

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigSaved: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  onConfigSaved,
}: SettingsDialogProps) {
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      redmine_url: "https://redmine.ring-group.xyz",
    },
  });

  async function onSubmit(data: ConfigFormData) {
    setSaving(true);
    const result = await saveRedmineConfig(data);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Redmine configuration saved");
    onConfigSaved();
    onOpenChange(false);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    const result = await testRedmineConnection();
    setTesting(false);

    if (result.success) {
      setTestResult({
        success: true,
        message: `Connected as ${result.login}`,
      });
    } else {
      setTestResult({
        success: false,
        message: result.error || "Connection failed",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redmine Configuration</DialogTitle>
          <DialogDescription>
            Enter your Redmine URL and API key. Your API key is encrypted before
            storage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="redmine_url">Redmine URL</Label>
            <Input
              id="redmine_url"
              placeholder="https://redmine.example.com"
              {...register("redmine_url")}
            />
            {errors.redmine_url && (
              <p className="text-sm text-destructive">
                {errors.redmine_url.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api_key">API Key</Label>
            <Input
              id="api_key"
              type="password"
              placeholder="Your Redmine API key"
              {...register("api_key")}
            />
            {errors.api_key && (
              <p className="text-sm text-destructive">
                {errors.api_key.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Find this in Redmine → My Account → API access key
            </p>
          </div>

          {testResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                testResult.success
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>

        <div className="border-t border-white/10 pt-4">
          <a
            href="/settings/integrations/slack"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Slack Integration →
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
