"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Runs a server action inside a transition; shows errors (and optional success) as toasts. */
export function useAction() {
  const [pending, startTransition] = useTransition();

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    options: { success?: string; onSuccess?: (data: T) => void; onError?: (error: string) => void } = {},
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        // A form that shows the error inline (onError) doesn't need the toast too.
        if (options.onError) options.onError(result.error);
        else toast.error(result.error);
        return;
      }
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result.data);
    });
  }

  return { pending, run };
}
