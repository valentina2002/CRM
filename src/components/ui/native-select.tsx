import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select> styled like the inputs (best UX on phones, same as the prototype). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
