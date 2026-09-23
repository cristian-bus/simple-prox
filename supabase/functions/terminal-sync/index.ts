import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-terminal-id, x-terminal-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

async function sha256Hex(str: string): Promise<string> {
  const buffer = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  // Manejo de CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, "");
  const action = pathname.split("/").pop() || "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // -------------------------------------------------------------
    // RUTA: /enroll (Enrolamiento de Terminal y Emisión de Token)
    // -------------------------------------------------------------
    if (action === "enroll" && req.method === "POST") {
      const body = await req.json();
      const installationId = String(body.installationId || "").trim();
      const commerceId = String(body.commerceId || "").trim();
      const storeName = String(body.storeName || "").trim();

      if (!installationId || installationId.length < 3) {
        return new Response(JSON.stringify({ success: false, error: "installationId inválido" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // 1. Verificar si la terminal ya fue enrolada previamente
      const { data: existingIdentity } = await adminClient
        .from("terminal_identities")
        .select("installation_id, status")
        .eq("installation_id", installationId)
        .maybeSingle();

      if (existingIdentity && existingIdentity.status === "active") {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Terminal ya enrolada previamente con credencial activa." 
        }), {
          status: 409,
          headers: corsHeaders
        });
      }

      // 2. Generar token de terminal criptográfico de alta entropía (256 bits)
      const rawToken = "spx_term_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const tokenHash = await sha256Hex(rawToken);

      // 3. Registrar en terminal_identities
      const { error: idError } = await adminClient
        .from("terminal_identities")
        .upsert({
          installation_id: installationId,
          token_hash: tokenHash,
          commerce_id: commerceId || null,
          status: "active",
          last_used_at: new Date().toISOString()
        });

      if (idError) {
        return new Response(JSON.stringify({ success: false, error: "Error registrando identidad" }), {
          status: 500,
          headers: corsHeaders
        });
      }

      // 4. Si el comercio no existe en merchants, crearlo
      const { data: existingMerchant } = await adminClient
        .from("merchants")
        .select("id")
        .eq("id", installationId)
        .maybeSingle();

      if (!existingMerchant) {
        await adminClient.from("merchants").insert({
          id: installationId,
          installation_id: installationId,
          commerce_id: commerceId || ("COMM-" + installationId),
          name: storeName || `Kiosco ${installationId}`,
          plan: "Básico",
          status: "active",
          registered_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        });
      }

      return new Response(JSON.stringify({
        success: true,
        terminalToken: rawToken,
        installationId
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // AUTENTICACIÓN PARA TODAS LAS DEMÁS RUTAS
    // -------------------------------------------------------------
    const termId = req.headers.get("x-terminal-id")?.trim();
    const termToken = req.headers.get("x-terminal-token")?.trim();

    if (!termId || !termToken) {
      return new Response(JSON.stringify({ success: false, error: "Autenticación requerida: faltan encabezados de terminal" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const tokenHash = await sha256Hex(termToken);
    const { data: identity, error: authError } = await adminClient
      .from("terminal_identities")
      .select("installation_id, status")
      .eq("installation_id", termId)
      .eq("token_hash", tokenHash)
      .eq("status", "active")
      .maybeSingle();

    if (authError || !identity) {
      return new Response(JSON.stringify({ success: false, error: "Credencial de terminal inválida o revocada" }), {
        status: 401,
        headers: corsHeaders
      });
    }

    // Actualizar last_used_at en background
    adminClient
      .from("terminal_identities")
      .update({ last_used_at: new Date().toISOString() })
      .eq("installation_id", termId)
      .then(() => {});

    // -------------------------------------------------------------
    // RUTA: /heartbeat (Telemetría Técnica con Allowlist Estricta)
    // -------------------------------------------------------------
    if (action === "heartbeat" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      
      const updateData: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      if (typeof body.appVersion === "string") updateData.app_version = body.appVersion.slice(0, 30);
      if (typeof body.configVersion === "string") updateData.config_version = body.configVersion.slice(0, 30);
      if (body.status === "active" || body.status === "inactive") updateData.status = body.status;

      await adminClient
        .from("merchants")
        .update(updateData)
        .eq("id", termId);

      return new Response(JSON.stringify({ success: true, updated: true, installationId: termId }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // RUTA: /register (Registro / Perfil del Comercio Autenticado)
    // -------------------------------------------------------------
    if (action === "register" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      const mData: Record<string, unknown> = {
        id: termId,
        installation_id: termId,
        last_active: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };

      if (typeof body.storeName === "string" && body.storeName.trim()) mData.name = body.storeName.trim().slice(0, 100);
      if (typeof body.name === "string" && body.name.trim()) mData.name = body.name.trim().slice(0, 100);
      if (typeof body.address === "string") mData.address = body.address.trim().slice(0, 200);
      if (typeof body.phone === "string") mData.phone = body.phone.trim().slice(0, 50);
      if (typeof body.installer === "string") mData.installer = body.installer.trim().slice(0, 100);
      if (typeof body.businessType === "string") mData.business_type = body.businessType.trim().slice(0, 50);
      if (typeof body.provinceCode === "string") mData.province_code = body.provinceCode.trim().slice(0, 10);
      if (typeof body.provinceName === "string") mData.province_name = body.provinceName.trim().slice(0, 100);
      if (typeof body.cityCode === "string") mData.city_code = body.cityCode.trim().slice(0, 30);
      if (typeof body.cityName === "string") {
        mData.city_name = body.cityName.trim().slice(0, 100);
        mData.city = body.cityName.trim().slice(0, 100);
      }
      if (typeof body.appVersion === "string") mData.app_version = body.appVersion.slice(0, 30);
      if (typeof body.commerceId === "string") mData.commerce_id = body.commerceId.slice(0, 50);

      // Usar upsert merge con ID de la terminal autenticada
      const { error: upsertError } = await adminClient
        .from("merchants")
        .upsert(mData, { onConflict: "id" });

      if (upsertError) {
        return new Response(JSON.stringify({ success: false, error: "Error al actualizar comercio" }), {
          status: 500,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ success: true, installationId: termId }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // RUTA: /events (Lote de Métricas de Campañas - Vinculación Forzada)
    // -------------------------------------------------------------
    if (action === "events" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const rawEvents = Array.isArray(body.events) ? body.events : (Array.isArray(body) ? body : []);

      if (rawEvents.length === 0) {
        return new Response(JSON.stringify({ success: true, processedCount: 0 }), {
          status: 200,
          headers: corsHeaders
        });
      }

      const validTypes = new Set(["impression", "offer_open", "whatsapp_click"]);
      const sanitizedEvents = [];

      for (const ev of rawEvents.slice(0, 50)) { // Límite de 50 eventos por lote
        const eventType = String(ev.eventType || ev.event_type || "");
        if (!validTypes.has(eventType)) continue;

        sanitizedEvents.push({
          event_id: String(ev.eventId || ev.event_id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          merchant_id: termId, // FORZADO a la terminal autenticada (Imposible suplantar otro comercio)
          campaign_id: ev.campaignId || ev.campaign_id || null,
          event_type: eventType,
          timestamp: ev.timestamp || new Date().toISOString(),
          synced_at: new Date().toISOString()
        });
      }

      if (sanitizedEvents.length > 0) {
        const { error: insertError } = await adminClient
          .from("campaign_events")
          .insert(sanitizedEvents);

        if (insertError) {
          return new Response(JSON.stringify({ success: false, error: "Error al registrar eventos" }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        processedCount: sanitizedEvents.length,
        installationId: termId
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Endpoint no encontrado" }), {
      status: 404,
      headers: corsHeaders
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: "Error interno del servidor" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
