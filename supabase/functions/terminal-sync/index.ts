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

const BASIC_PUBLIC_KEY_JWK = {
  crv: "Ed25519",
  x: "E8DDN-xpkQijtwuNNIA_W9FzXhZQFqjBUDo9PSffCmc",
  kty: "OKP"
};

async function verifyBasicLicenseToken(token: string, expectedInstallationId: string): Promise<{ valid: boolean; error?: string; payload?: any }> {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return { valid: false, error: "Formato de certificado inválido" };
    }
    const [b64Payload, b64Signature] = token.split(".");
    if (!b64Payload || !b64Signature) {
      return { valid: false, error: "Token de activación incompleto" };
    }

    const payloadStr = atob(b64Payload);
    const payloadBytes = new TextEncoder().encode(payloadStr);

    const binarySig = atob(b64Signature);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const payload = JSON.parse(payloadStr);
    if (payload.version !== 1) return { valid: false, error: "Versión de licencia no soportada" };
    if (payload.type !== "initial_activation") return { valid: false, error: "Tipo de certificado inválido" };
    if (payload.plan !== "Básico") return { valid: false, error: "Plan de licencia no autorizado" };
    if (payload.installationId !== expectedInstallationId) {
      return { valid: false, error: "El certificado no corresponde a este installationId" };
    }

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      BASIC_PUBLIC_KEY_JWK,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const isValid = await crypto.subtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      sigBytes,
      payloadBytes
    );

    if (!isValid) {
      return { valid: false, error: "Firma digital del certificado inválida" };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || "Error al verificar certificado" };
  }
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
        } else if (existingIdentity.status === "revoked") {
          // Fase 0.2.1c: Permitir emisión de ticket a terminal revocada si es solicitado por admin verificado
          // La emisión del ticket por el admin constituye la autorización explícita para el re-enrolamiento.
        } else {
          // suspended u otro estado: no emitir ticket de enrolamiento normal
          return new Response(JSON.stringify({
            success: false,
            code: "REENROLL_REQUIRES_ADMIN_RESET",
            error: `La terminal se encuentra en estado '${existingIdentity.status}'. El re-enrolamiento requiere revocación administrativa previa.`
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
    // RUTA: /revoke (Revocación Administrativa de Terminal - Fase 0.2.1c)
    // -------------------------------------------------------------------------
    if (action === "revoke" && req.method === "POST") {
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
          error: "Sesión inválida o expirada"
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // 2. Validar privilegios de administrador real (admin_users)
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
      const reason = String(body.reason || "Revocación administrativa por pérdida de credencial").trim().slice(0, 255);

      if (!targetInstallationId || targetInstallationId.length < 3) {
        return new Response(JSON.stringify({ success: false, error: "installationId inválido" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // 3. Verificar que la terminal existe en terminal_identities
      const { data: targetIdentity, error: identityErr } = await adminClient
        .from("terminal_identities")
        .select("installation_id, commerce_id, status")
        .eq("installation_id", targetInstallationId)
        .maybeSingle();

      if (identityErr || !targetIdentity) {
        return new Response(JSON.stringify({
          success: false,
          code: "TERMINAL_NOT_FOUND",
          error: "La terminal indicada no existe en terminal_identities"
        }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const nowIso = new Date().toISOString();

      // 4. Actualizar a 'revoked' con timestamps y motivos de auditoría (sin borrar la fila)
      const { error: updateErr } = await adminClient
        .from("terminal_identities")
        .update({
          status: "revoked",
          revoked_at: nowIso,
          revocation_reason: reason
        })
        .eq("installation_id", targetInstallationId);

      if (updateErr) {
        return new Response(JSON.stringify({
          success: false,
          error: "Error al revocar la terminal en base de datos"
        }), {
          status: 500,
          headers: corsHeaders
        });
      }

      // 5. Invalidar cualquier ticket pending anterior de esta instalación para evitar carreras
      await adminClient
        .from("terminal_enrollment_tickets")
        .update({ status: "expired" })
        .eq("installation_id", targetInstallationId)
        .eq("status", "pending");

      return new Response(JSON.stringify({
        success: true,
        installationId: targetInstallationId,
        status: "revoked",
        revokedAt: nowIso,
        revocationReason: reason
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
    // RUTA: /enroll-license (Enrolamiento Seguro para Terminales con Licencia Básica)
    // -------------------------------------------------------------------------
    if (action === "enroll-license" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const installationId = String(body.installationId || "").trim();
      const licenseToken = String(body.licenseToken || "").trim();
      const merchantData = body.merchantData || {};

      if (!installationId || !licenseToken) {
        return new Response(JSON.stringify({
          success: false,
          error: "Autenticación requerida: se requiere installationId y licenseToken válido para enrolar"
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // 1. Validar criptográficamente el certificado Ed25519
      const certCheck = await verifyBasicLicenseToken(licenseToken, installationId);
      if (!certCheck.valid) {
        console.warn(`[ENROLL LICENSE] Rechazado para ${installationId}: ${certCheck.error}`);
        return new Response(JSON.stringify({
          success: false,
          code: "INVALID_CERTIFICATE",
          error: certCheck.error || "Certificado digital inválido o alterado"
        }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // 2. Generar credencial de terminal segura (256 bits) y su hash SHA-256
      const rawToken = "spx_term_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const tokenHash = await sha256Hex(rawToken);
      const nowIso = new Date().toISOString();

      // 3. ENROLAMIENTO ATÓMICO EXCLUSIVO MEDIANTE RPC (PostgreSQL Lock FOR UPDATE)
      // p_allow_rotation = false: un certificado de licencia por sí solo SOLO permite el primer enrolamiento.
      // Si la terminal ya está activa, se rechaza con 409 ALREADY_ENROLLED para impedir rotación no autorizada.
      const { data: rpcResult, error: rpcError } = await adminClient.rpc("enroll_terminal_with_license", {
        p_installation_id: installationId,
        p_token_hash: tokenHash,
        p_merchant_data: merchantData,
        p_allow_rotation: false
      });

      if (rpcError) {
        console.error(`[ENROLL LICENSE RPC ERROR] para ${installationId}:`, rpcError);
        // Regla de Oro: NO ejecutar fallbacks de escritura no atómicos que puedan vulnerar la revocación o la concurrencia.
        // Se responde con error controlado 503. El POS continúa operando offline sin perder ventas ni licencias.
        return new Response(JSON.stringify({
          success: false,
          code: "RPC_UNAVAILABLE",
          error: "Servicio de enrolamiento transaccional no disponible en el servidor. Reintente más tarde."
        }), {
          status: 503,
          headers: corsHeaders
        });
      }

      if (!rpcResult || !rpcResult.success) {
        const status = rpcResult?.code === "TERMINAL_REVOKED" ? 403
                     : rpcResult?.code === "ALREADY_ENROLLED" ? 409
                     : 400;
        return new Response(JSON.stringify({
          success: false,
          code: rpcResult?.code || "ENROLL_FAILED",
          error: rpcResult?.error || "No se pudo enrolar la terminal"
        }), {
          status,
          headers: corsHeaders
        });
      }

      console.log(`[ENROLL LICENSE SUCCESS] Terminal enrolada exitosamente con licencia: ${installationId}`);

      return new Response(JSON.stringify({
        success: true,
        terminalToken: rawToken,
        installationId
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
    // RUTA: /campaigns (Entrega de Campañas B2B con Control de Cupos Diarios)
    // -------------------------------------------------------------------------
    if (action === "campaigns" && req.method === "GET") {
      // 1. Consultar campañas activas
      const { data: allCampaigns, error: campErr } = await adminClient
        .from("campaigns")
        .select("id, title, description, category, type, supplier_name, price, regular_price, unit_price, badge_text, image_url, logo_url, cta_text, whatsapp_number, whatsapp_message, status, priority, daily_limit, is_daily_limit_enabled, start_date, end_date, created_at")
        .eq("status", "active");

      if (campErr || !allCampaigns) {
        console.error("[terminal-sync] Error al consultar campañas:", campErr);
        return new Response(JSON.stringify({ success: false, error: "Error al consultar campañas" }), {
          status: 500,
          headers: corsHeaders
        });
      }

      // 2. Consultar vista de cupos v_campaign_daily_quotas mediante service_role
      const { data: quotas, error: quotaErr } = await adminClient
        .from("v_campaign_daily_quotas")
        .select("campaign_id, is_quota_exhausted");

      let filteredCampaigns: any[] = [];

      if (quotaErr || !quotas) {
        console.warn("[terminal-sync] Error al consultar v_campaign_daily_quotas. Aplicando Fail-Safe.");
        // REGLA DE SEGURIDAD FAIL-SAFE:
        // Campañas ilimitadas (is_daily_limit_enabled = false) se entregan siempre.
        // Campañas con cupo (is_daily_limit_enabled = true) se excluyen preventivamente ante fallas.
        filteredCampaigns = allCampaigns.filter((c: any) => !c.is_daily_limit_enabled);
      } else {
        const quotaMap = new Map<string, boolean>();
        for (const q of quotas) {
          quotaMap.set(q.campaign_id, q.is_quota_exhausted);
        }

        filteredCampaigns = allCampaigns.filter((c: any) => {
          // Si la campaña no tiene límite diario habilitado, siempre se entrega
          if (!c.is_daily_limit_enabled) {
            return true;
          }

          // Si tiene límite habilitado, SOLO puede entregarse si existe una fila válida en la vista
          // que confirme is_quota_exhausted = false.
          if (!quotaMap.has(c.id)) {
            // Falta información en la vista -> exclusión preventiva
            return false;
          }

          const isExhausted = quotaMap.get(c.id);
          return isExhausted === false;
        });
      }

      return new Response(JSON.stringify(filteredCampaigns), {
        status: 200,
        headers: corsHeaders
      });
    }

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
      let ackCount = 0; // Conteo de eventos reconocidos para confirmar y liberar el Outbox del POS

      const nowMs = Date.now();
      const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días exactos
      const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // Tolerancia de deriva de reloj hacia el futuro: 5 minutos
      // Formato estricto ISO 8601 con zona horaria explícita obligatoria (Z o +/-HH:MM)
      const ISO_8601_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

      for (const ev of rawEvents.slice(0, 50)) { // Límite de 50 eventos por lote
        const eventType = String(ev.eventType || ev.event_type || "");
        if (!validTypes.has(eventType)) continue;

        // 1. Validación estricta de event_id (NO generar identificadores aleatorios sintéticos)
        const rawEventId = ev.eventId || ev.event_id;
        if (typeof rawEventId !== "string" || rawEventId.trim().length === 0) {
          continue; // Evento inválido sin identificador persistente
        }
        const eventId = rawEventId.trim();

        // 2. Validación estricta de timestamp (sintáctica y semántica ISO 8601 con zona horaria explícita)
        if (!ev.timestamp || typeof ev.timestamp !== "string" || !ISO_8601_TZ_REGEX.test(ev.timestamp)) {
          continue; // Timestamp ausente, sin formato ISO 8601 o sin zona horaria explícita
        }
        const dateParts = ev.timestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!dateParts) continue;
        const pYear = parseInt(dateParts[1], 10);
        const pMonth = parseInt(dateParts[2], 10);
        const pDay = parseInt(dateParts[3], 10);
        if (pMonth < 1 || pMonth > 12 || pDay < 1 || pDay > 31) continue;
        const maxDaysInMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
        if (pDay > maxDaysInMonth) continue; // Rechazo semántico de fechas imposibles (ej. 31 de feb o 29 feb no bisiesto)

        const eventTime = new Date(ev.timestamp).getTime();
        if (isNaN(eventTime)) {
          continue; // Timestamp malformado
        }

        // 3. Regla contra fechas futuras manipuladas (más allá de 5 min de tolerancia de drift de reloj)
        if (eventTime > nowMs + MAX_FUTURE_SKEW_MS) {
          continue; // Descarte de eventos con fecha futura
        }

        // 4. Política de Retención de 30 días:
        // Si el evento tiene 30 días o más de antigüedad, se reconoce (ackCount++) para que
        // el POS lo limpie de su Outbox/Deadletter, pero NO se inserta en campaign_events,
        // previniendo de forma infalible la duplicación post-purga.
        if (eventTime <= nowMs - MAX_RETENTION_MS) {
          ackCount++;
          continue;
        }

        const rawCampaignId = ev.campaignId || ev.campaign_id;
        const campaignId = (typeof rawCampaignId === "string" && rawCampaignId.trim().length > 0)
          ? rawCampaignId.trim()
          : null;

        sanitizedEvents.push({
          event_id: eventId,
          merchant_id: termId, // FORZADO a la terminal autenticada (Imposible suplantar otro comercio)
          campaign_id: campaignId,
          event_type: eventType,
          timestamp: new Date(eventTime).toISOString(),
          synced_at: new Date(nowMs).toISOString()
        });
        ackCount++;
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
          .upsert(sanitizedEvents, {
            onConflict: "event_id",
            ignoreDuplicates: true
          });

        if (insertError) {
          return new Response(JSON.stringify({ success: false, error: "Error al registrar eventos" }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        processedCount: ackCount,
        insertedCount: sanitizedEvents.length,
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
