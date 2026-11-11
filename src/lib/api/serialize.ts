import { STAGE_LABEL } from "@/lib/constants";
import type { Stage } from "@/generated/prisma/enums";

// JSON shapes returned by the public API (see docs/openapi.yaml). Structural input types keep this file pure.

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** @db.Date columns (UTC midnight) → "YYYY-MM-DD". */
const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export function serializeContact(c: {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  tags: string[];
  monthlyValue: number;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    phone: c.phone,
    email: c.email,
    service: c.service,
    tags: c.tags,
    monthlyValue: c.monthlyValue,
    source: c.source,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function serializeDeal(d: { id: string; contactId: string; title: string; stage: Stage; value: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: d.id,
    contactId: d.contactId,
    title: d.title,
    stage: d.stage,
    stageLabel: STAGE_LABEL[d.stage],
    value: d.value,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function serializeInvoice(i: {
  id: string;
  number: string;
  contactId: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  sentAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; position?: number }[];
}) {
  const items = [...i.items]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice }));
  return {
    id: i.id,
    number: i.number,
    contactId: i.contactId,
    issueDate: dayOf(i.issueDate),
    dueDate: dayOf(i.dueDate),
    status: i.status,
    sentAt: iso(i.sentAt),
    paidAt: dayOf(i.paidAt),
    notes: i.notes,
    items,
    total: items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
  };
}

export function serializeMessage(m: {
  id: string;
  channel: string;
  direction: string;
  via: string | null;
  type: string;
  body: string | null;
  status: string;
  externalId: string | null;
  error: string | null;
  sentAt: Date;
}) {
  return {
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    via: m.via,
    type: m.type,
    text: m.body,
    status: m.status,
    wamid: m.externalId,
    error: m.error,
    sentAt: iso(m.sentAt),
  };
}
