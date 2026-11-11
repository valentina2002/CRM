import type { Channel, InvoiceStatus, Stage, TriggerType } from "@/generated/prisma/enums";

/** Pipeline stages in board order, with their Spanish labels (same as the prototype). */
export const STAGES: readonly { value: Stage; label: string }[] = [
  { value: "PROSPECT", label: "Prospecto" },
  { value: "PROPOSAL_SENT", label: "Propuesta enviada" },
  { value: "NEGOTIATION", label: "Negociación" },
  { value: "ACTIVE_CLIENT", label: "Cliente activo" },
  { value: "LOST", label: "Perdido" },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<Stage, string>;

/** Open pipeline = Prospecto + Propuesta enviada + Negociación. */
export const OPEN_STAGES: readonly Stage[] = ["PROSPECT", "PROPOSAL_SENT", "NEGOTIATION"];

export const SERVICES = [
  "SEO técnico",
  "SEO local",
  "Contenidos / blog",
  "Auditoría SEO",
  "SEO para IA (GEO)",
] as const;

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Pendiente",
  PAID: "Pagada",
  OVERDUE: "Vencida",
};

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  CONTACT_CREATED: "Se crea un contacto",
  MESSAGE_RECEIVED: "Llega un mensaje",
  DEAL_STAGE_CHANGED: "Un negocio cambia de etapa",
  INVOICE_SENT: "Se envía una cuenta de cobro",
  INVOICE_PAID: "Se paga una cuenta de cobro",
  INVOICE_OVERDUE: "Una cuenta de cobro se vence",
};

export const ACTION_LABEL = {
  send_whatsapp: "Enviar WhatsApp",
  add_tag: "Agregar etiqueta",
  move_stage: "Mover a etapa",
  create_task: "Crear tarea",
  wait: "Esperar",
  wait_due: "Esperar hasta la fecha límite",
  stop_if: "Detener si…",
} as const;

/** Contact origins (Contact.source) usable as the condition of "Se crea un contacto". */
export const CONTACT_SOURCE_LABEL: Record<string, string> = {
  form: "Formulario web",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  manual: "Creado a mano",
  api: "API",
};

export type AutomationActionType = keyof typeof ACTION_LABEL;
export type AutomationAction = { type: AutomationActionType; value: string };

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};
