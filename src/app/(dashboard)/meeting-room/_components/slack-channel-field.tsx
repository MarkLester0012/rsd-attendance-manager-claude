import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface SlackChannelFieldProps {
  inputId: string;
  notifyChannel: boolean;
  onNotifyChannelChange: (value: boolean) => void;
  slackChannel: string;
  onSlackChannelChange: (value: string) => void;
  defaultSlackChannel: string;
  channelError: string | null;
  /** Shown under the input when there's no error — differs between "leave blank to use the default" (book) and "leave blank to keep the current channel" (edit). */
  helperText: string;
}

/**
 * Shared "Notify Slack channel" toggle + channel input block, identical
 * between book-meeting-modal.tsx and edit-meeting-modal.tsx apart from the
 * input's id and its blank-input helper copy.
 */
export function SlackChannelField({
  inputId,
  notifyChannel,
  onNotifyChannelChange,
  slackChannel,
  onSlackChannelChange,
  defaultSlackChannel,
  channelError,
  helperText,
}: SlackChannelFieldProps) {
  return (
    <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Notify Slack channel</Label>
          <p className="text-xs text-muted-foreground">
            Posts a Block Kit card to the channel and sends direct messages to attendees when meeting starts
          </p>
        </div>
        <Switch checked={notifyChannel} onCheckedChange={onNotifyChannelChange} />
      </div>

      {notifyChannel && (
        <div className="space-y-1.5 border-t pt-3">
          <Label htmlFor={inputId}>Slack channel</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">#</span>
            <Input
              id={inputId}
              placeholder={defaultSlackChannel}
              value={slackChannel}
              onChange={(e) => onSlackChannelChange(e.target.value)}
              aria-invalid={!!channelError}
              className="pl-6"
            />
          </div>
          {channelError ? (
            <p className="text-xs text-destructive">{channelError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{helperText}</p>
          )}
        </div>
      )}
    </div>
  );
}
