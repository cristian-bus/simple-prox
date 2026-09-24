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
    // -------------------------------------------------------------------------
    // RUTA: /issue-ticket (Emisión de Enrollment Ticket - Autoridad Admin Estricta)
    // -------------------------------------------------------------------------
    if (action === "issue-ticket" && req.method === "POST") {
      const authHeader = req.headers.get("authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      
      if (!jwt) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "No autenticado: falta encabezado Authorization Bearer" 
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // 1. Validar autenticidad del JWT con Supabase Auth
      const { data: { user }, error: userError } = await adminClient.auth.getUser(jwt);
      if (userError || !user) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "No autenticado: token JWT inválido o expirado" 
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // 2. REGLA CRÍTICA: Validar privilegios de administrador real (admin_users)
      // Un usuario 'authenticated' común NO tiene permiso para emitir tickets
      const { data: adminRecord, error: adminQueryErr } = await adminClient
        .from("admin_users")
        .select("user_id, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (adminQueryErr || !adminRecord) {
        return new Response(JSON.stringify({
          success: false,
          error: "Acceso denegado: el usuario autenticado no posee privilegios administrativos autorizados"
        }), {
          status: 403,
          headers: corsHeaders
        });
      }

      const body = await req.json().catch(() => ({}));
      const targetInstallationId = String(body.installationId || "").trim();

      if (!targetInstallationId || targetInstallationId.length < 3) {
        return new Response(JSON.stringify({ success: false, error: "installationId inválido" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // 3. PROBLEMA B (Fase 0.2.1b): Validar pre-provisión del comercio en merchants
      const { data: merchantRecord, error: merchantErr } = await adminClient
        .from("merchants")
        .select("id, commerce_id, name")
        .eq("id", targetInstallationId)
        .maybeSingle();

      if (merchantErr || !merchantRecord) {
        return new Response(JSON.stringify({
          success: false,
          code: "MERCHANT_NOT_PROVISIONED",
          error: "MERCHANT_NOT_PROVISIONED: El comercio asociado a este installationId no ha sido provisionado administrativamente"
        }), {
          status: 422,
          headers: corsHeaders
        });
      }

      // 4. PROBLEMA A (Fase 0.2.1b): Comprobar si ya existe una identidad previa en terminal_identities
      const { data: existingIdentity } = await adminClient
        .from("terminal_identities")
        .select("installation_id, status")
        .eq("installation_id", targetInstallationId)
        .maybeSingle();

      if (existingIdentity) {
        if (existingIdentity.status === "active") {
          return new Response(JSON.stringify({
            success: false,
            code: "ALREADY_ENROLLED",
            error: "La terminal ya se encuentra enrolada con credencial activa"
          }), {
            status: 409,
            headers: corsHeaders
          });
        } else {
          // revoked, suspended u otro estado: no emitir ticket de enrolamiento normal
          return new Response(JSON.stringify({
            success: false,
            code: "REENROLL_REQUIRES_ADMIN_RESET",
            error: `La terminal se encuentra en estado '${existingIdentity.status}'. El re-enrolamiento requiere reset administrativo previo.`
          }), {
            status: 409,
            headers: corsHeaders
          });
        }
      }

      // 5. PROBLEMA B: Derivar commerce_id y store_name exclusivamente server-side desde merchants
      // (body.commerceId y body.storeName son COMPLETAMENTE ignorados para evitar asociación cruzada)
      const derivedCommerceId = merchantRecord.commerce_id || targetInstallationId;
      const derivedStoreName = merchantRecord.name || null;

      // 6. REGLA DE TICKET PENDING ÚNICO (Fase 0.2.1b - Ajuste Final):
      // Comprobar si existe algún ticket en estado 'pending' para esta instalación
      const nowIso = new Date().toISOString();
      const { data: pendingTickets } = await adminClient
        .from("terminal_enrollment_tickets")
        .select("ticket_hash, expires_at")
        .eq("installation_id", targetInstallationId)
        .eq("status", "pending");

      if (pendingTickets && pendingTickets.length > 0) {
        for (const pt of pendingTickets) {
          if (pt.expires_at > nowIso) {
            // Existe un ticket pending válido y vigente: rechazar con 409
            return new Response(JSON.stringify({
              success: false,
              code: "ENROLLMENT_TICKET_ALREADY_PENDING",
              error: "Ya existe un ticket de enrolamiento pendiente y vigente para esta terminal"
            }), {
              status: 409,
              headers: corsHeaders
            });
          } else {
            // Ticket pending pero expirado: transicionar server-side a 'expired' (sin borrar historial)
            await adminClient
              .from("terminal_enrollment_tickets")
              .update({ status: "expired" })
              .eq("ticket_hash", pt.ticket_hash);
          }
        }
      }

      // 7. Generar ticket criptográfico de 256 bits de un solo uso
      const rawTicket = "spx_ticket_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const ticketHash = await sha256Hex(rawTicket);
      // Duración unificada estricta server-side: 30 minutos exactos
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: insertTicketError } = await adminClient
        .from("terminal_enrollment_tickets")
        .insert({
          ticket_hash: ticketHash,
          installation_id: targetInstallationId,
          commerce_id: derivedCommerceId,
          store_name: derivedStoreName,
          expires_at: expiresAt,
          status: "pending",
          created_by: user.email || user.id
        });

      if (insertTicketError) {
        // Detección de colisión concurrente por constraint de base de datos (UNIQUE idx_terminal_enrollment_tickets_single_pending)
        if (
          insertTicketError.code === "23505" ||
          (insertTicketError.message && insertTicketError.message.includes("idx_terminal_enrollment_tickets_single_pending"))
        ) {
          return new Response(JSON.stringify({
            success: false,
            code: "ENROLLMENT_TICKET_ALREADY_PENDING",
            error: "Ya existe un ticket de enrolamiento pendiente para esta terminal"
          }), {
            status: 409,
            headers: corsHeaders
          });
        }

        return new Response(JSON.stringify({ success: false, error: "Error al registrar ticket de enrolamiento" }), {
          status: 500,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({
        success: true,
        enrollmentTicket: rawTicket,
        installationId: targetInstallationId,
        expiresAt
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------------------
    // RUTA: /enroll (Enrolamiento Seguro: Consumo Atómico Transaccional con RPC)
    // -------------------------------------------------------------------------
    if (action === "enroll" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const installationId = String(body.installationId || "").trim();
      const enrollmentTicket = String(body.enrollmentTicket || "").trim();

      // REGLA CRÍTICA: installationId no es secreto; exige obligatoriamente enrollmentTicket
      if (!installationId || !enrollmentTicket) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Autenticación requerida: se requiere installationId y enrollmentTicket válido para enrolar" 
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      const ticketHash = await sha256Hex(enrollmentTicket);
      // Generar token de terminal criptográfico de alta entropía (256 bits)
      const rawToken = "spx_term_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const tokenHash = await sha256Hex(rawToken);

      // Consumo y Enrolamiento Atómico Transaccional vía PostgreSQL RPC
      // No confía en body.commerceId ni body.storeName. No auto-crea merchants. No reactiva terminales revocadas/suspendidas.
      const { data: enrollResult, error: rpcError } = await adminClient
        .rpc("enroll_terminal_with_ticket", {
          p_ticket_hash: ticketHash,
          p_installation_id: installationId,
          p_token_hash: tokenHash
        });

      if (rpcError) {
        return new Response(JSON.stringify({ success: false, error: "Error en procedimiento de enrolamiento" }), {
          status: 500,
          headers: corsHeaders
        });
      }

      if (!enrollResult || !enrollResult.success) {
        const statusCode = (enrollResult?.code === "ALREADY_ENROLLED" || enrollResult?.code === "REENROLL_REQUIRES_ADMIN_RESET") ? 409
                         : enrollResult?.code === "MERCHANT_NOT_PROVISIONED" ? 422
                         : 403;

        return new Response(JSON.stringify({
          success: false,
          code: enrollResult?.code || "ENROLL_FAILED",
          error: enrollResult?.error || "No se pudo enrolar la terminal"
        }), {
          status: statusCode,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({
        success: true,
        terminalToken: rawToken,
        installationId: enrollResult.installation_id,
        commerceId: enrollResult.commerce_id
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------------------
    // AUTENTICACIÓN GENERAL PARA RUTAS OPERATIVAS (Heartbeat, Register, Events)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // RUTA: /heartbeat (Telemetría Técnica con Allowlist Estricta)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // RUTA: /register (Registro / Perfil del Comercio Autenticado)
    // -------------------------------------------------------------------------
    if (action === "register" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      // REGLA CRÍTICA: NO permitir alterar commerce_id ni installation_id mediante /register
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

      // Usar upsert merge con ID de la terminal autenticada (sin alterar commerce_id)
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

    // -------------------------------------------------------------------------
    // RUTA: /events (Lote de Métricas - Validación Estricta de Campañas)
    // -------------------------------------------------------------------------
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
      let sanitizedEvents = [];

      for (const ev of rawEvents.slice(0, 50)) { // Límite de 50 eventos por lote
        const eventType = String(ev.eventType || ev.event_type || "");
        if (!validTypes.has(eventType)) continue;

        const rawCampaignId = ev.campaignId || ev.campaign_id;
        const campaignId = (typeof rawCampaignId === "string" && rawCampaignId.trim().length > 0)
          ? rawCampaignId.trim()
          : null;

        sanitizedEvents.push({
          event_id: String(ev.eventId || ev.event_id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          merchant_id: termId, // FORZADO a la terminal autenticada (Imposible suplantar otro comercio)
          campaign_id: campaignId,
          event_type: eventType,
          timestamp: ev.timestamp || new Date().toISOString(),
          synced_at: new Date().toISOString()
        });
      }

      // Validación batch eficiente: validar existencia de campaign_id en 1 sola consulta
      const uniqueCampaignIds = [...new Set(
        sanitizedEvents
          .map(e => e.campaign_id)
          .filter((cid): cid is string => Boolean(cid))
      )];

      if (uniqueCampaignIds.length > 0) {
        const { data: existingCampaigns } = await adminClient
          .from("campaigns")
          .select("id")
          .in("id", uniqueCampaignIds);

        const existingSet = new Set((existingCampaigns || []).map((c: { id: string }) => c.id));

        // REGLA CRÍTICA: Si el evento declara un campaign_id que no existe en campaigns,
        // se DESCARTA el evento del lote (no se convierte en null).
        sanitizedEvents = sanitizedEvents.filter(e => {
          if (e.campaign_id) {
            return existingSet.has(e.campaign_id);
          }
          return true; // Conservar eventos legítimos sin campaña asociada (si existen)
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
