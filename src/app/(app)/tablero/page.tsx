import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/crm/chip";
import { NewTaskForm, TaskList } from "@/components/crm/task-list";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { formatCOP, formatShortMoment } from "@/lib/format";
import { getDashboard } from "@/lib/services/dashboard";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tablero" };

export default function TableroPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Tablero" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await requireUser();
  const { kpis, tasks, pendingTasks, activity } = await getDashboard();
  const monthName = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "America/Bogota" }).format(new Date());

  return (
    <>
      <PageHeader title="Tablero" subtitle="Resumen de tu agencia: clientes, ventas, cobros y conversaciones." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <Kpi label="Contactos" value={String(kpis.contacts)} sub={`${kpis.activeClients} cliente${kpis.activeClients === 1 ? "" : "s"} activo${kpis.activeClients === 1 ? "" : "s"}`} href="/contactos" />
        <Kpi label="Pipeline abierto" value={formatCOP(kpis.pipelineOpen)} sub={`${kpis.pipelineOpenCount} oportunidad${kpis.pipelineOpenCount === 1 ? "" : "es"}`} href="/pipeline" />
        <Kpi label="Cobrado en el mes" value={formatCOP(kpis.collectedThisMonth)} sub={`${kpis.collectedThisMonthCount} pagada${kpis.collectedThisMonthCount === 1 ? "" : "s"} en ${monthName}`} href="/cuentas-de-cobro" />
        <Kpi
          label="Por cobrar"
          value={formatCOP(kpis.receivable)}
          sub={`${kpis.overdueCount} vencida${kpis.overdueCount === 1 ? "" : "s"}`}
          subClassName={kpis.overdueCount ? "text-destructive" : undefined}
          href="/cuentas-de-cobro"
        />
        <Kpi label="Mensajes sin leer" value={String(kpis.unread)} sub="WhatsApp" href="/conversaciones" />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Valor por etapa del pipeline">
          {kpis.byStage.map((b) => (
            <div key={b.stage} className="my-[9px] flex items-center gap-2.5 text-[13px]">
              <div className="w-[130px] shrink-0">
                {b.label} <span className="text-[12.5px] text-muted-foreground">({b.count})</span>
              </div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-[5px] bg-secondary" role="presentation">
                <div
                  className={cn("h-full rounded-[5px]", b.stage === "LOST" ? "bg-[#b9c2cf]" : "bg-primary")}
                  style={{ width: `${(b.value / kpis.maxStageValue) * 100}%` }}
                />
              </div>
              <div className="w-[110px] text-right text-muted-foreground tabular-nums">{formatCOP(b.value)}</div>
            </div>
          ))}
        </Card>

        <Card title={`Tareas pendientes (${pendingTasks})`}>
          <NewTaskForm />
          <TaskList
            showContact
            emptyText="Sin tareas."
            tasks={tasks.map((t) => ({ id: t.id, text: t.text, done: t.done, dueAt: t.dueAt, contact: t.contact }))}
          />
        </Card>
      </div>

      <Card title="Actividad reciente" className="mt-4">
        {activity.length === 0 ? (
          <p className="text-muted-foreground">Sin actividad todavía.</p>
        ) : (
          activity.map((a) => (
            <div key={a.id} className="flex gap-2.5 border-b py-1.5 text-[12.5px] last:border-b-0">
              <time className="w-[52px] shrink-0 text-muted-foreground tabular-nums">{formatShortMoment(a.createdAt)}</time>
              {a.contact ? (
                <Link href={`/contactos/${a.contact.id}`} className="hover:text-primary hover:underline">
                  {a.text}
                </Link>
              ) : (
                <span>{a.text}</span>
              )}
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, sub, subClassName, href }: { label: string; value: string; sub: string; subClassName?: string; href: string }) {
  return (
    <Link href={href} className="rounded-[10px] border bg-card p-[18px] transition-colors hover:border-[#cfd6e0]">
      <div className="text-[12.5px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-[22px] font-bold tracking-[-.01em] tabular-nums">{value}</div>
      <div className={cn("mt-0.5 text-xs text-muted-foreground", subClassName)}>{sub}</div>
    </Link>
  );
}
