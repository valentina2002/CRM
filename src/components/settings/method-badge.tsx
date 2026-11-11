import { cn } from "@/lib/utils";

/** Colored HTTP method label (GET blue, POST green, PATCH amber, DELETE red), like `.mt` in the prototype. */
export function MethodBadge({ method, className }: { method: string; className?: string }) {
  const tone =
    method === "GET" ? "bg-info-soft text-info" : method === "DELETE" ? "bg-danger-soft text-destructive" : method === "PATCH" ? "bg-warning-soft text-warning" : "bg-success-soft text-primary";
  return <span className={cn("inline-block min-w-[52px] rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold", tone, className)}>{method}</span>;
}
