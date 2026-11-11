/**
 * Seed with the same sample data as prototipo/crm-seo-prototipo.html.
 * It WIPES all CRM tables first (dev data only). Refuses to run in production unless SEED_FORCE=1.
 * Admin user comes from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.local.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { MessageDirection, MessageStatus, MessageVia, Stage } from "../src/generated/prisma/enums";
import { encryptSecret } from "../src/lib/crypto";
import { addDaysISO, isoToDbDate, normalizePhone, todayISO } from "../src/lib/format";
import { generateWebhookSecret } from "../src/lib/webhooks/outgoing";

config({ path: ".env.local", quiet: true });

if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
  console.error("El seed borra todos los datos. No se ejecuta en producción (usa SEED_FORCE=1 si de verdad quieres).");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX) || undefined }),
});

const today = todayISO();
const day = (offset: number) => isoToDbDate(addDaysISO(today, offset));
/** Prototype messages only carry "HH:mm"; place them yesterday at that Bogotá time. */
const yesterdayAt = (hhmm: string) => new Date(`${addDaysISO(today, -1)}T${hhmm}:00-05:00`);

type SeedContact = {
  key: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  service: string;
  tags: string[];
  value: number;
  deal: { title: string; stage: Stage };
};

const contacts: SeedContact[] = [
  { key: "c1", name: "Andrea Morales", company: "Megalámparas Guatemala", phone: "+502 5555 0101", email: "andrea@ejemplo.gt", service: "SEO técnico", tags: ["cliente", "retainer"], value: 2400000, deal: { title: "Plan SEO 3 meses", stage: "ACTIVE_CLIENT" } },
  { key: "c2", name: "Carlos Restrepo", company: "Clínica Dental Sonrisa", phone: "+57 300 555 0102", email: "carlos@ejemplo.co", service: "SEO local", tags: ["lead"], value: 1200000, deal: { title: "SEO local Google Maps", stage: "PROSPECT" } },
  { key: "c3", name: "Luisa Gómez", company: "Ferretería El Tornillo", phone: "+57 310 555 0103", email: "luisa@ejemplo.co", service: "SEO local", tags: ["cliente"], value: 900000, deal: { title: "Ficha Google + reseñas", stage: "ACTIVE_CLIENT" } },
  { key: "c4", name: "Jorge Ramírez", company: "Hotel Montaña Verde", phone: "+57 315 555 0104", email: "jorge@ejemplo.co", service: "Contenidos / blog", tags: ["propuesta"], value: 1800000, deal: { title: "4 artículos mensuales", stage: "PROPOSAL_SENT" } },
  { key: "c5", name: "Paula Henao", company: "Café Origen", phone: "+57 320 555 0105", email: "paula@ejemplo.co", service: "Auditoría SEO", tags: ["lead"], value: 1500000, deal: { title: "Auditoría técnica", stage: "PROSPECT" } },
  { key: "c6", name: "Felipe Arango", company: "Arango & Asociados Abogados", phone: "+57 301 555 0106", email: "felipe@ejemplo.co", service: "SEO para IA (GEO)", tags: ["negociación"], value: 2000000, deal: { title: "Visibilidad en IA", stage: "NEGOTIATION" } },
];

type SeedMsg = { from: "them" | "me"; via?: MessageVia; text: string; time: string };
const conversations: Record<string, { unread: number; messages: SeedMsg[] }> = {
  c1: { unread: 0, messages: [
    { from: "them", text: "Hola Valentina, ¿cómo vamos con las redirecciones 301?", time: "09:12" },
    { from: "me", via: "APP", text: "¡Hola Andrea! Ya quedaron listas, el viernes te comparto el informe.", time: "09:20" },
    { from: "them", text: "Perfecto, gracias 🙌", time: "09:21" },
  ] },
  c2: { unread: 1, messages: [
    { from: "them", text: "Buenas tardes, quisiera saber el precio del plan de SEO local para la clínica.", time: "16:40" },
  ] },
  c3: { unread: 0, messages: [
    { from: "me", via: "CRM", text: "Hola Luisa, te comparto la cuenta de cobro CC-003. Quedo atenta.", time: "10:02" },
  ] },
  c4: { unread: 2, messages: [
    { from: "me", via: "CRM", text: "Hola Jorge, te envié la propuesta de contenidos al correo.", time: "11:15" },
    { from: "them", text: "La revisé, me gusta.", time: "18:03" },
    { from: "them", text: "¿Podemos empezar el próximo mes?", time: "18:04" },
  ] },
  c6: { unread: 0, messages: [
    { from: "them", text: "¿Qué incluye exactamente lo de aparecer en ChatGPT?", time: "08:30" },
    { from: "me", via: "APP", text: "Te lo explico en una llamada corta, ¿te sirve hoy a las 3?", time: "08:45" },
  ] },
};

const invoices = [
  { number: "CC-001", contact: "c1", issue: -35, due: -20, status: "PAID" as const, items: [["Auditoría técnica y redirecciones 301", 1, 1400000], ["Optimización de crawl budget", 1, 1000000]] as const },
  { number: "CC-002", contact: "c1", issue: -3, due: 12, status: "SENT" as const, items: [["Plan SEO mensual – mes 2", 1, 2400000]] as const },
  { number: "CC-003", contact: "c3", issue: -25, due: -5, status: "OVERDUE" as const, items: [["Optimización ficha de Google", 1, 600000], ["Gestión de reseñas", 1, 300000]] as const },
  { number: "CC-004", contact: "c4", issue: 0, due: 15, status: "DRAFT" as const, items: [["Artículo de blog optimizado", 4, 450000]] as const },
];

async function wipe() {
  // Children first. Users are kept (upserted below) so the login survives a re-seed.
  await db.webhookDelivery.deleteMany();
  await db.webhookEndpoint.deleteMany();
  await db.automationJob.deleteMany();
  await db.automationRun.deleteMany();
  await db.automation.deleteMany();
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.deal.deleteMany();
  await db.task.deleteMany();
  await db.note.deleteMany();
  await db.activityLog.deleteMany();
  await db.contactChannel.deleteMany();
  await db.contact.deleteMany();
  await db.event.deleteMany();
  await db.webhookInbox.deleteMany();
  await db.issuerSettings.deleteMany();
  await db.leadSubmission.deleteMany();
  await db.leadForm.deleteMany();
  await db.quickReply.deleteMany();
}

async function main() {
  await wipe();

  const ids: Record<string, string> = {};
  for (const c of contacts) {
    const phone = normalizePhone(c.phone);
    if (!phone) throw new Error(`Teléfono inválido en el seed: ${c.phone}`);
    const created = await db.contact.create({
      data: {
        name: c.name,
        company: c.company,
        phone,
        email: c.email,
        service: c.service,
        tags: c.tags,
        monthlyValue: c.value,
        source: "manual",
        channels: { create: { channel: "WHATSAPP", externalId: phone.slice(1) } },
        deals: { create: { title: c.deal.title, stage: c.deal.stage, value: c.value } },
      },
    });
    ids[c.key] = created.id;
  }

  for (const [key, conv] of Object.entries(conversations)) {
    const msgs = conv.messages.map((m) => ({
      direction: (m.from === "them" ? "IN" : "OUT") as MessageDirection,
      via: m.via ?? null,
      status: (m.from === "them" ? "RECEIVED" : "READ") as MessageStatus,
      channel: "WHATSAPP" as const,
      body: m.text,
      sentAt: yesterdayAt(m.time),
    }));
    const lastIn = msgs.filter((m) => m.direction === "IN").at(-1);
    await db.conversation.create({
      data: {
        contactId: ids[key],
        unread: conv.unread,
        lastChannel: "WHATSAPP",
        lastInboundAt: lastIn?.sentAt ?? null,
        lastMessageAt: msgs.at(-1)?.sentAt ?? null,
        messages: { create: msgs },
      },
    });
  }
  // Paula (c5) has no messages in the prototype, but every contact gets its (empty) thread.
  await db.conversation.create({ data: { contactId: ids.c5 } });

  for (const inv of invoices) {
    await db.invoice.create({
      data: {
        number: inv.number,
        contactId: ids[inv.contact],
        issueDate: day(inv.issue),
        dueDate: day(inv.due),
        status: inv.status,
        paidAt: inv.status === "PAID" ? day(inv.due - 2) : null,
        items: {
          create: inv.items.map(([description, quantity, unitPrice], position) => ({ description, quantity, unitPrice, position })),
        },
      },
    });
  }

  await db.automation.createMany({
    data: [
      { name: "Respuesta automática a \"precio\"", trigger: "MESSAGE_RECEIVED", condition: "precio", active: true, runCount: 3, actions: [
        { type: "send_whatsapp", value: "Hola {nombre}, gracias por escribir. Nuestros planes SEO arrancan desde $900.000 al mes. ¿Agendamos una llamada de 15 minutos?" },
        { type: "add_tag", value: "interesado" },
      ] },
      { name: "Bienvenida a nuevo contacto", trigger: "CONTACT_CREATED", active: true, runCount: 6, actions: [
        { type: "send_whatsapp", value: "Hola {nombre}, soy Valentina, consultora SEO. Gracias por tu interés en posicionar {empresa}. ¿Cuándo podemos hablar?" },
        { type: "create_task", value: "Llamar a {nombre} ({empresa}) en las próximas 24 h" },
      ] },
      { name: "Pago recibido → cliente activo", trigger: "INVOICE_PAID", active: true, runCount: 1, actions: [
        { type: "move_stage", value: "ACTIVE_CLIENT" },
        { type: "send_whatsapp", value: "¡Gracias {nombre}! Recibimos el pago de la cuenta de cobro {factura} por {valor}." },
      ] },
      { name: "Recordatorio de cuenta vencida", trigger: "INVOICE_OVERDUE", active: true, runCount: 1, actions: [
        { type: "send_whatsapp", value: "Hola {nombre}, te recuerdo que la cuenta de cobro {factura} por {valor} está vencida. ¿Me confirmas la fecha de pago?" },
        { type: "create_task", value: "Hacer seguimiento al pago de {factura}" },
      ] },
      { name: "Seguimiento a propuesta enviada", trigger: "DEAL_STAGE_CHANGED", condition: "PROPOSAL_SENT", active: false, runCount: 0, actions: [
        { type: "create_task", value: "Hacer seguimiento a la propuesta de {nombre} en 3 días" },
      ] },
    ],
  });

  await db.task.createMany({
    data: [
      { text: "Enviar informe mensual a Megalámparas", contactId: ids.c1 },
      { text: "Llamar a Carlos (Clínica Dental Sonrisa)", contactId: ids.c2 },
    ],
  });

  await db.activityLog.create({ data: { type: "system", text: "Datos de ejemplo cargados" } });

  await db.issuerSettings.create({
    data: { id: 1, name: "Valentina", document: "C.C. ________", city: "Medellín", paymentInfo: "Banco: ________ · Cuenta de ahorros N.º ________" },
  });

  // Phase 7: a sample lead form (its public page is /f/demo-contacto).
  await db.leadForm.create({
    data: {
      publicId: "demo-contacto",
      name: "Contacto página web",
      tags: ["lead web"],
      service: "SEO local",
      successMessage: "Gracias por escribir. Te contacto muy pronto por WhatsApp.",
    },
  });

  await db.webhookEndpoint.create({
    data: {
      url: "https://hooks.zapier.com/hooks/catch/ejemplo",
      events: ["invoice.paid", "contact.created"],
      // Stored encrypted like the ones created in Ajustes (plain only if ENCRYPTION_KEY is missing; it stays inactive).
      secret: process.env.ENCRYPTION_KEY ? encryptSecret(generateWebhookSecret()) : generateWebhookSecret(),
      active: false, // sample only: never deliver to the example URL
    },
  });

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres");
    const passwordHash = await bcrypt.hash(password, 12);
    await db.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, name: "Valentina", passwordHash, role: "ADMIN" },
    });
    console.log(`Usuaria admin lista: ${email}`);
  } else {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no están en .env.local: no se creó la usuaria admin.");
  }

  console.log("Seed completo: 6 contactos, 6 oportunidades, 6 conversaciones, 4 cuentas de cobro, 5 automatizaciones, 2 tareas.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
