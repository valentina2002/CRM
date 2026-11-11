import { after } from "next/server";
import { clientIp, extractUtm, hashIp, isBot, leadSubmissionSchema, safeHttpUrl } from "@/lib/lead-form";
import { DomainError } from "@/lib/services/core";
import { submitLead } from "@/lib/services/lead-forms";
import { runBackgroundWork } from "@/lib/services/pipeline";

// Public endpoint of the lead capture forms (no session, no API key). Accepts a plain HTML form post
// (answers with a redirect) or JSON (answers JSON, CORS open so a website's own script can call it).

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export async function POST(request: Request, { params }: RouteContext<"/api/forms/[publicId]">) {
  const { publicId } = await params;
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  const hosted = new URL(`/f/${encodeURIComponent(publicId)}`, request.url);

  let raw: Record<string, unknown>;
  try {
    raw = isJson ? ((await request.json()) as Record<string, unknown>) : Object.fromEntries((await request.formData()).entries());
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("bad body");
  } catch {
    return isJson ? Response.json({ error: "Datos inválidos" }, { status: 400, headers: CORS }) : Response.redirect(hosted, 303);
  }

  const fail = (status: number, error: string) => {
    if (isJson) return Response.json({ error }, { status, headers: CORS });
    hosted.searchParams.set("error", error);
    return Response.redirect(hosted, 303);
  };

  // Bots that fill the hidden field get a normal-looking success and nothing is stored.
  if (isBot(raw)) return isJson ? Response.json({ data: { ok: true } }, { headers: CORS }) : Response.redirect(new URL(`${hosted.pathname}?enviado=1`, request.url), 303);

  const parsed = leadSubmissionSchema.safeParse(raw);
  if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Revisa los datos");

  const pageUrl = safeHttpUrl(parsed.data.page_url ?? request.headers.get("referer"));
  try {
    const result = await submitLead(publicId, parsed.data, {
      ipHash: hashIp(clientIp(request.headers), process.env.AUTH_SECRET ?? "crm"),
      pageUrl,
      utm: extractUtm(raw, pageUrl),
    });
    // Welcome automation, WhatsApp and outgoing webhooks after the response.
    after(() => runBackgroundWork().catch((error) => console.error("Formulario: error en el trabajo en segundo plano", error)));
    if (isJson) return Response.json({ data: { ok: true, message: result.successMessage } }, { status: 201, headers: CORS });
    const redirect = safeHttpUrl(result.redirectUrl);
    return Response.redirect(redirect ?? new URL(`${hosted.pathname}?enviado=1`, request.url), 303);
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code === "not_found" ? 404 : error.code === "conflict" ? 429 : 422, error.message);
    console.error("Formulario: error guardando el lead", error);
    return fail(500, "No pudimos enviar tu mensaje. Intenta de nuevo en un momento.");
  }
}
