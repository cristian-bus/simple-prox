import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper criptográfico para hashear identificadores (resguarda privacidad de hardware e IPs)
async function hashIdentifier(input: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Extracción defensiva de IP (prioriza Cloudflare/Gateway de confianza para evitar spoofing)
function extractClientIp(req: Request): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[0].trim();
  }

  return "unknown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { masterKey, installationId, installationData } = await req.json();

    if (!installationId) {
      return new Response(JSON.stringify({ success: false, error: "Identificador de instalación requerido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. CONFIGURACIÓN CLIENTE SUPABASE (service_role con permisos para RPC atómico)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[CONFIG ERROR] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados.");
      return new Response(JSON.stringify({ success: false, error: "Error interno de configuración de base de datos." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. IDENTIFICADORES DEFENSIVOS HASHEADOS
    // Clave de dispositivo: combinación de installationId y hardwareId
    const rawDevice = `${installationId}:${installationData?.hardwareId || "nohw"}`;
    const deviceKey = `dev:${await hashIdentifier(rawDevice)}`;

    // Clave de red: IP de origen extraída de cabeceras seguras
    const clientIp = extractClientIp(req);
    const ipKey = `ip:${await hashIdentifier(clientIp)}`;

    // 3. RATE LIMITING DISTRIBUIDO Y ATÓMICO EN POSTGRESQL
    // Registra el intento y comprueba bloqueos atómicamente en PostgreSQL
    const { data: limitCheck, error: rpcError } = await supabase.rpc(
      "check_and_record_activation_attempt",
      {
        p_device_key: deviceKey,
        p_ip_key: ipKey,
        p_max_device_attempts: 5,
        p_max_ip_attempts: 15,
        p_window_seconds: 900, // Ventana de 15 minutos
        p_block_seconds: 900,  // Bloqueo de 15 minutos
      }
    );

    if (rpcError) {
      console.error("[RATE LIMIT RPC ERROR]:", rpcError);
      return new Response(JSON.stringify({ success: false, error: "Error de verificación de seguridad." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!limitCheck || limitCheck.allowed === false) {
      const retryAfter = limitCheck?.retry_after_seconds || 900;
      console.warn(`[RATE LIMIT EXCEEDED] Bloqueo activo. Motivo: ${limitCheck?.reason}. Retry after: ${retryAfter}s`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Demasiados intentos de activación. Dispositivo o red bloqueados temporalmente.",
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        }
      );
    }

    // 4. VALIDAR CLAVE MAESTRA
    const validMasterKey = Deno.env.get("MASTER_ACTIVATION_KEY");
    if (!validMasterKey) {
      console.error("Configuración de servidor incompleta: MASTER_ACTIVATION_KEY no existe.");
      return new Response(JSON.stringify({ success: false, error: "Error interno del servidor." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (masterKey !== validMasterKey) {
      console.warn(`[AUTH FAILED] Clave maestra incorrecta para dispositivo ${installationId}`);
      return new Response(JSON.stringify({ success: false, error: "Clave Maestra incorrecta." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. LIMPIAR CONTADOR DE DISPOSITIVO TRAS VALIDACIÓN EXITOSA
    // Evita acumular intentos fallidos previos si la clave finalmente fue correcta
    await supabase.rpc("clear_activation_rate_limit", { p_device_key: deviceKey });

    // 6. RECUPERAR LLAVE PRIVADA BÁSICA (Protegida como Secreto)
    const privateKeyPem = Deno.env.get("BASIC_ACTIVATION_PRIVATE_KEY");
    if (!privateKeyPem) {
      console.error("Configuración incompleta: BASIC_ACTIVATION_PRIVATE_KEY no existe.");
      return new Response(JSON.stringify({ success: false, error: "Error interno del servidor." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. FIRMAR TOKEN ED25519 NATIVO CON DENO WEB CRYPTO
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem),
      { name: "Ed25519" },
      false,
      ["sign"]
    );

    const payload = {
      version: 1,
      type: "initial_activation", // Propósito explícito (No autoriza Plan Pro)
      plan: "Básico",             // Siempre básico
      installationId,
      issuedAt: new Date().toISOString(),
      installationData,
    };

    const payloadStr = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadStr);
    const signatureBytes = await crypto.subtle.sign("Ed25519", privateKey, payloadBytes);

    // Formato canónico: payloadBase64.signatureBase64
    const payloadB64 = btoa(String.fromCharCode(...new Uint8Array(payloadBytes)));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
    const token = `${payloadB64}.${signatureB64}`;

    console.log(`[SUCCESS] Activación inicial firmada para instalación ${installationId}`);

    // 8. GENERAR Y APROVISIONAR CREDENCIAL DE TERMINAL PARA TELEMETRÍA B2B
    let rawTerminalToken: string | null = null;
    try {
      rawTerminalToken = "spx_term_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const tokenHash = await hashIdentifier(rawTerminalToken);
      const nowIso = new Date().toISOString();

      const merchantData = {
        storeName: installationData?.negocio || `Kiosco ${installationId}`,
        address: installationData?.direccion || null,
        phone: installationData?.telefono || null,
        installer: installationData?.instalador || null,
        appVersion: installationData?.version || "1.3.9"
      };

      // Invocación atómica exclusiva mediante RPC (p_allow_rotation = false: la Clave Maestra global no autoriza rotar identidades activas)
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("enroll_terminal_with_license", {
        p_installation_id: installationId,
        p_token_hash: tokenHash,
        p_merchant_data: merchantData,
        p_allow_rotation: false
      });

      if (rpcErr || !rpcResult?.success) {
        console.warn(`[ACTIVATE WARNING] RPC enroll_terminal_with_license falló o no existe:`, rpcErr || rpcResult?.error);
        // Si la RPC falla, NO se ejecutan escrituras no atómicas de fallback.
        // La activación básica offline se entrega con éxito (token), pero rawTerminalToken se mantiene null.
        // El POS operará offline y se auto-enrolará en cuanto el servicio RPC esté disponible.
        rawTerminalToken = null;
      }
    } catch (enrollErr) {
      console.warn(`[ACTIVATE WARNING] Error aprovisionando identidad de terminal:`, enrollErr);
      rawTerminalToken = null;
      // No bloquea la entrega del certificado básico para asegurar offline-first
    }

    return new Response(JSON.stringify({ 
      success: true, 
      token, 
      payload, 
      terminalToken: rawTerminalToken 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error procesando solicitud:", err);
    return new Response(JSON.stringify({ success: false, error: "Error procesando solicitud." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper de extracción PEM a ArrayBuffer para Deno Web Crypto
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/(-----(BEGIN|END) PRIVATE KEY-----|\n|\r)/g, "");
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
