import { timingSafeEqual } from "node:crypto";
import { checkOverdueInvoices } from "@/lib/services/invoices";

/**
 * Daily job (Vercel Cron, see vercel.json): marks pending cuentas de cobro past their due date as
 * overdue. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return Response.json({ error: "No autorizado" }, { status: 401 });

  const overdue = await checkOverdueInvoices();
  return Response.json({ data: { overdue, count: overdue.length } });
}
