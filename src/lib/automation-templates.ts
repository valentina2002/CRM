import type { AutomationInput } from "@/lib/automation-engine";

// Ready-made automations (GoHighLevel-style "recipes"), created from Automatizaciones → "Usar una plantilla".

export type AutomationTemplate = {
  key: string;
  title: string;
  description: string;
  /** Created paused when it needs editing first (e.g. a link to replace). */
  startPaused?: boolean;
  automation: AutomationInput;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "invoice-reminders",
    title: "Recordatorios de cobro",
    description: "3 días antes de la fecha límite recuerda el pago; si al día siguiente de vencer no ha pagado, vuelve a escribir y te crea una tarea. Se detiene sola si ya pagó.",
    automation: {
      name: "Recordatorios de cobro",
      trigger: "INVOICE_SENT",
      condition: null,
      actions: [
        { type: "wait_due", value: "-3" },
        { type: "stop_if", value: "invoice_paid" },
        { type: "send_whatsapp", value: "Hola {nombre}, te recuerdo que la cuenta de cobro {factura} por {valor} vence el {vence}. ¡Gracias!" },
        { type: "wait_due", value: "1" },
        { type: "stop_if", value: "invoice_paid" },
        { type: "send_whatsapp", value: "Hola {nombre}, la cuenta de cobro {factura} por {valor} venció el {vence}. ¿Me confirmas la fecha de pago?" },
        { type: "create_task", value: "Llamar a {nombre} por el pago de {factura} ({valor})" },
      ],
    },
  },
  {
    key: "prospect-follow-up",
    title: "Seguimiento a prospecto sin respuesta",
    description: "Si un contacto nuevo no responde en 2 días, le escribe de nuevo; si a la semana sigue sin responder, te crea una tarea para llamarlo.",
    automation: {
      name: "Seguimiento a prospecto sin respuesta",
      trigger: "CONTACT_CREATED",
      condition: null,
      actions: [
        { type: "wait", value: "2d" },
        { type: "stop_if", value: "replied" },
        { type: "send_whatsapp", value: "Hola {nombre}, ¿pudiste ver mi mensaje? Me encantaría contarte cómo podemos mejorar el posicionamiento de {empresa}." },
        { type: "wait", value: "5d" },
        { type: "stop_if", value: "replied" },
        { type: "create_task", value: "Llamar a {nombre}: no respondió en una semana" },
      ],
    },
  },
  {
    key: "google-review",
    title: "Pedir reseña en Google",
    description: "Al mes de convertirse en cliente activo le pide una reseña. Se crea en pausa: reemplaza el enlace por el de tu perfil de Google y actívala.",
    startPaused: true,
    automation: {
      name: "Pedir reseña en Google",
      trigger: "DEAL_STAGE_CHANGED",
      condition: "ACTIVE_CLIENT",
      actions: [
        { type: "wait", value: "30d" },
        { type: "stop_if", value: "stage:LOST" },
        {
          type: "send_whatsapp",
          value: "Hola {nombre}, ¡gracias por confiar en mí este mes! Si estás contento con el trabajo, ¿me ayudarías con una reseña en Google? Toma un minuto: https://g.page/r/TU-ENLACE/review",
        },
        { type: "add_tag", value: "reseña solicitada" },
      ],
    },
  },
  {
    key: "web-lead-welcome",
    title: "Bienvenida a leads del formulario web",
    description: "Cuando alguien llena un formulario de tu web, le escribe al instante, lo etiqueta y te crea una tarea para llamarlo.",
    automation: {
      name: "Bienvenida a leads del formulario web",
      trigger: "CONTACT_CREATED",
      condition: "form",
      actions: [
        { type: "send_whatsapp", value: "Hola {nombre}, soy Valentina. Recibí tu mensaje desde mi página web. ¿Te parece si agendamos una llamada corta para entender qué necesita {empresa}?" },
        { type: "add_tag", value: "lead web" },
        { type: "create_task", value: "Llamar a {nombre} (llegó por el formulario web)" },
      ],
    },
  },
];
