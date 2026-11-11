import type { Channel } from "@/generated/prisma/enums";
import { CHANNEL_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONE: Record<Channel, string> = {
  WHATSAPP: "bg-[#25d366]",
  FACEBOOK: "bg-[#0866ff]",
  INSTAGRAM: "bg-[#d62976]",
  TIKTOK: "bg-[#111111]",
};

const SHORT: Record<Channel, string> = { WHATSAPP: "W", FACEBOOK: "f", INSTAGRAM: "IG", TIKTOK: "T" };

/** Small colored mark of the channel a message came through (with its name for screen readers). */
export function ChannelMark({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span
      role="img"
      aria-label={CHANNEL_LABEL[channel]}
      title={CHANNEL_LABEL[channel]}
      className={cn("inline-grid h-[15px] min-w-[15px] shrink-0 place-items-center rounded-full px-[3px] text-[9px] leading-none font-bold text-white", TONE[channel], className)}
    >
      {SHORT[channel]}
    </span>
  );
}

/** Mark + channel name. */
export function ChannelBadge({ channel, children, className }: { channel: Channel; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-medium text-[#3d4a5e]", className)}>
      <ChannelMark channel={channel} />
      {children ?? CHANNEL_LABEL[channel]}
    </span>
  );
}
