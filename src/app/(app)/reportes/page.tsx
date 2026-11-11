import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/crm/chip";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { formatCOP } from "@/lib/format";
import { formatDuration, periodKey, PERIODS, type PeriodKey } from "@/lib/reports";
import { getReport } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  return (
    <>
      <PageHeader title="Reportes" subtitle="De dónde llegan tus clientes, cuánto cierras, cuánto cobras y qué tan rápido respondes." />
      <Suspense fallback={<PageSkeleton title="" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** One KPI tile (the number is the chart). */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-[10px] border bg-card px-4 py-3.5">
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[21px] font-bold tracking-[-.01em]">{value}</div>
      {sub ? <div className="text-[12px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

type BarRow = { label: string; value: number; note?: string; tone?: string };

/**
 * Horizontal bar list: one series, one hue (a single magnitude); the value is printed at the end of each bar so
 * it reads without hovering, and the row title is the tooltip.
 */
function Bars({ rows, format, empty }: { rows: BarRow[]; format: (n: number) => string; empty: string }) {
  if (!rows.length || rows.every((r) => r.value === 0)) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.note ? ` · ${r.note}` : ""}`} className="grid grid-cols-[minmax(90px,36%)_1fr] items-center gap-3 text-[13px]">
          <span className="truncate">{r.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn("block h-[10px] shrink-0 rounded-r-[4px]", r.tone ?? "bg-primary")}
              style={{ width: `${r.value ? Math.max(2, (r.value / max) * 60) : 0}%` }}
            />
            <span className="shrink-0 font-semibold tabular-nums">{format(r.value)}</span>
            {r.note ? <span className="truncate text-[12px] text-muted-foreground">{r.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars for the last 6 months (one hue), value above each bar. */
function MonthColumns({ months }: { months: { month: string; label: string; total: number }[] }) {
  if (months.every((m) => m.total === 0)) return <p className="text-[13px] text-muted-foreground">Aún no hay pagos registrados en estos meses.</p>;
  const max = Math.max(...months.map((m) => m.total), 1);
  return (
    <ul className="grid grid-cols-6 items-end gap-2" aria-label="Cobrado por mes">
      {months.map((m) => (
        <li key={m.month} className="flex flex-col items-center gap-1" title={`${m.label}: ${formatCOP(m.total)}`}>
          <span className="text-[11px] font-semibold tabular-nums">{m.total ? `${(m.total / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : "0"}</span>
          <span className="flex h-[120px] w-full max-w-[42px] items-end">
            <span className="block w-full rounded-t-[4px] bg-primary" style={{ height: `${m.total ? Math.max(3, (m.total / max) * 100) : 0}%` }} />
          </span>
          <span className="text-[11.5px] text-muted-foreground">{m.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Older debt = darker (one warm hue, light → dark); "not due yet" stays neutral. */
const AGING_TONE: Record<string, string> = {
  current: "bg-[#b9c2cf]",
  "1-30": "bg-[#f0c27a]",
  "31-60": "bg-[#dd9748]",
  "61-90": "bg-[#c06a2a]",
  "90+": "bg-[#8f3f14]",
};

async function Report({ searchParams }: { searchParams: PageProps<"/reportes">["searchParams"] }) {
  await requireUser();
  const period = periodKey((await searchParams).periodo);
  const r = await getReport(Number(period));
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)} %`);
  const overdue = r.receivable - (r.aging.find((a) => a.key === "current")?.total ?? 0);

  return (
    <div className="grid grid-cols-1 gap-4">
      <nav aria-label="Periodo" className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
          <Link
            key={key}
            href={`/reportes?periodo=${key}`}
            aria-current={key === period ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-[13px]", key === period ? "border-primary bg-success-soft font-semibold text-primary" : "bg-card hover:bg-secondary")}
          >
            {PERIODS[key]}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Contactos nuevos" value={String(r.newContacts)} sub={`${r.newClients} ya son clientes`} />
        <Stat label="Tasa de cierre" value={pct(r.closeRate)} sub={r.decided ? `${r.won} ganadas de ${r.decided} decididas` : "Sin oportunidades cerradas"} />
        <Stat label="Cobrado" value={formatCOP(r.collectedInPeriod)} sub={PERIODS[period].toLowerCase()} />
        <Stat label="Por cobrar" value={formatCOP(r.receivable)} sub={overdue ? `${formatCOP(overdue)} vencido` : "Nada vencido"} />
        <Stat label="Tiempo de respuesta" value={formatDuration(r.responseMedianMinutes)} sub={r.responseCount ? `mediana de ${r.responseCount} respuestas` : "Sin conversaciones"} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card title="¿De dónde llegan los contactos?">
          <Bars
            rows={r.sources.map((s) => ({ label: s.label, value: s.contacts, note: s.clients ? `${s.clients} cliente${s.clients === 1 ? "" : "s"}` : undefined }))}
            format={(n) => String(n)}
            empty="No llegaron contactos nuevos en este periodo."
          />
        </Card>
        <Card title="Cobrado por mes (últimos 6)">
          <MonthColumns months={r.collectedByMonth} />
        </Card>
        <Card title="Cobrado por servicio">
          <Bars rows={r.byService.map((s) => ({ label: s.label, value: s.total }))} format={formatCOP} empty="Sin pagos en este periodo." />
        </Card>
        <Card title="Clientes que más pagaron">
          <Bars rows={r.byClient.map((s) => ({ label: s.label, value: s.total }))} format={formatCOP} empty="Sin pagos en este periodo." />
        </Card>
        <Card title="Cartera por antigüedad" className="lg:col-span-2">
          <Bars
            rows={r.aging.map((a) => ({ label: a.label, value: a.total, note: a.count ? `${a.count} cuenta${a.count === 1 ? "" : "s"}` : undefined, tone: AGING_TONE[a.key] }))}
            format={formatCOP}
            empty="No tienes cuentas de cobro pendientes."
          />
          <p className="mt-3 text-[12px] text-muted-foreground">Cuentas pendientes y vencidas según los días desde su fecha límite.</p>
        </Card>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Tasa de cierre: oportunidades que pasaron a Cliente activo entre las que se ganaron o perdieron en el periodo. Tiempo de respuesta: mediana entre el primer mensaje sin
        responder del cliente y tu respuesta (desde el CRM o el celular; no cuentan las automáticas).
      </p>
    </div>
  );
}
