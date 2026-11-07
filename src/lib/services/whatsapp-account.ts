import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import * as graph from "@/lib/whatsapp/graph";
import { DomainError, logActivity } from "./core";

export type SyncState = {
  requestedAt?: string;
  contactsRequestId?: string | null;
  historyRequestId?: string | null;
  contactsError?: string | null;
  historyRequestError?: string | null;
  historyProgress?: number | null;
  historyError?: string | null;
  contactsImported?: number;
};

/** Public view of the WhatsApp connection (never includes the token). */
export async function getWhatsAppAccount() {
  const a = await db.channelAccount.findUnique({ where: { channel: "WHATSAPP" } });
  if (!a) return null;
  return {
    wabaId: a.externalId,
    phoneNumberId: a.senderId,
    displayPhone: a.displayName,
    coexistence: a.coexistence,
    historySynced: a.historySynced,
    connectedAt: a.connectedAt,
    sync: (a.sync ?? {}) as SyncState,
  };
}

/** Token + ids to call the Cloud API, or null when WhatsApp is not connected. */
export async function getSendingCredentials() {
  const a = await db.channelAccount.findUnique({ where: { channel: "WHATSAPP" } });
  if (!a?.senderId) return null;
  return { token: decryptSecret(a.tokenEncrypted), phoneNumberId: a.senderId, wabaId: a.externalId };
}

export async function updateSyncState(patch: Partial<SyncState>, extra: { historySynced?: boolean } = {}) {
  const a = await db.channelAccount.findUnique({ where: { channel: "WHATSAPP" } });
  if (!a) return;
  await db.channelAccount.update({
    where: { channel: "WHATSAPP" },
    data: { sync: { ...((a.sync ?? {}) as SyncState), ...patch }, ...extra },
  });
}

/**
 * Saves the connection (token encrypted), subscribes the app to the WABA webhooks and, for coexistence,
 * requests the one-time contacts + history sync right away (Meta allows it only within 24 h).
 */
export async function connectWhatsApp(input: { wabaId: string; phoneNumberId: string; token: string; coexistence: boolean }) {
  // Validates token + ids against Meta before saving.
  const phone = await graph.getPhoneNumber(input.token, input.phoneNumberId).catch((e: unknown) => {
    throw new DomainError(`Meta rechazó los datos: ${e instanceof Error ? e.message : "error"}`);
  });
  await graph.subscribeApp(input.token, input.wabaId).catch((e: unknown) => {
    throw new DomainError(`No se pudo suscribir la app al WABA: ${e instanceof Error ? e.message : "error"}`);
  });

  const data = {
    externalId: input.wabaId,
    senderId: input.phoneNumberId,
    displayName: phone.display_phone_number ?? null,
    tokenEncrypted: encryptSecret(input.token),
    coexistence: input.coexistence,
    historySynced: false,
    connectedAt: new Date(),
    disconnectedAt: null,
    sync: {},
  };
  await db.$transaction(async (tx) => {
    await tx.channelAccount.upsert({ where: { channel: "WHATSAPP" }, update: data, create: { channel: "WHATSAPP", ...data } });
    await logActivity(tx, { type: "whatsapp.connected", text: `WhatsApp conectado (${phone.display_phone_number ?? input.phoneNumberId})` });
  });

  if (input.coexistence) await requestCoexistenceSync();
  return phone;
}

/** Requests the contacts and history sync that are still pending (each can only be done once per onboarding). */
export async function requestCoexistenceSync() {
  const creds = await getSendingCredentials();
  if (!creds) throw new DomainError("WhatsApp no está conectado");
  const account = await getWhatsAppAccount();
  const state = account?.sync ?? {};
  const patch: Partial<SyncState> = { requestedAt: state.requestedAt ?? new Date().toISOString() };

  if (!state.contactsRequestId) {
    try {
      patch.contactsRequestId = await graph.requestSmbSync(creds.token, creds.phoneNumberId, "smb_app_state_sync");
      patch.contactsError = null;
    } catch (e) {
      patch.contactsError = e instanceof Error ? e.message : "Error";
    }
  }
  if (!state.historyRequestId) {
    try {
      patch.historyRequestId = await graph.requestSmbSync(creds.token, creds.phoneNumberId, "history");
      patch.historyRequestError = null;
    } catch (e) {
      patch.historyRequestError = e instanceof Error ? e.message : "Error";
    }
  }
  await updateSyncState(patch);
}

export async function completeEmbeddedSignup(input: { code: string; wabaId: string; phoneNumberId?: string | null }) {
  const token = await graph.exchangeCode(input.code).catch((e: unknown) => {
    throw new DomainError(`No se pudo completar la conexión con Meta: ${e instanceof Error ? e.message : "error"}`);
  });
  let phoneNumberId = input.phoneNumberId ?? null;
  if (!phoneNumberId) {
    const numbers = await graph.listPhoneNumbers(token, input.wabaId).catch(() => []);
    phoneNumberId = numbers[0]?.id ?? null;
  }
  if (!phoneNumberId) throw new DomainError("Meta no devolvió el número de teléfono del WABA");
  return connectWhatsApp({ wabaId: input.wabaId, phoneNumberId, token, coexistence: true });
}

/** Forgets the connection in the CRM. (A coexistence number is offboarded from the phone app, not via API.) */
export async function disconnectWhatsApp() {
  await db.$transaction(async (tx) => {
    await tx.channelAccount.deleteMany({ where: { channel: "WHATSAPP" } });
    await logActivity(tx, { type: "whatsapp.disconnected", text: "WhatsApp desconectado del CRM" });
  });
}
