import type { InvoiceStatus } from "@/generated/prisma/enums";
import { INVOICE_STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONE: Record<InvoiceStatus, string> = {
  DRAFT: "bg-secondary text-[#4b586c]",
  SENT: "bg-info-soft text-info",
  PAID: "bg-success-soft text-primary",
  OVERDUE: "bg-danger-soft text-destructive",
};

/** Status pill, like `.st.borrador/.enviada/.pagada/.vencida` in the prototype. */
export function InvoiceStatusChip({ status, className }: { status: InvoiceStatus; className?: string }) {
  return <span className={cn("inline-block rounded-full px-[9px] py-[3px] text-xs font-semibold", TONE[status], className)}>{INVOICE_STATUS_LABEL[status]}</span>;
}
