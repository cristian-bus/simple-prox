/**
 * Base64 string to Uint8Array helper
 */
function base64ToUint8Array(base64) {
  const binaryString = (typeof atob !== 'undefined')
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Public key for production.
 * In production builds, this is a hardcoded constant.
 * For testing purposes (NODE_ENV === 'test'), it uses a global variable.
 */
export const PUBLIC_KEY_JWK = (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && globalThis.__TEST_PUBLIC_KEY_JWK__)
  ? globalThis.__TEST_PUBLIC_KEY_JWK__
  : {
      "crv": "Ed25519",
      "x": "g2YZsqZVp1AkXx_ThaNWqGTd4PkbExIRjmXHTjNtVF4",
      "kty": "OKP"
    };


/**
 * Verifies the Ed25519 license token locally using Web Crypto API.
 * @param {string} token - The full license token (Base64(Payload).Base64(Signature))
 * @param {string} localInstallationId - The installation ID of the current machine
 * @returns {Promise<{valid: boolean, payload: object, error: string}>}
 */
export async function verifyEd25519License(token, localInstallationId) {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, error: 'Formato de licencia inválido.' };
    }

    const [b64Payload, b64Signature] = token.split('.');
    
    const payloadBytes = base64ToUint8Array(b64Payload);
    const signatureBytes = base64ToUint8Array(b64Signature);
    const payloadStr = new TextDecoder('utf-8').decode(payloadBytes);
    
    // Parse the canonical string
    const parts = payloadStr.split('|');
    if (parts.length !== 6) {
      return { valid: false, error: 'Payload de licencia malformado.' };
    }
    
    const [versionStr, licenseId, installationId, plan, iatStr, expStr] = parts;
    const version = parseInt(versionStr, 10);
    const iat = parseInt(iatStr, 10);
    const exp = parseInt(expStr, 10);
    
    if (version !== 1) {
      return { valid: false, error: 'Versión de licencia no soportada.' };
    }

    // Verify Installation ID
    if (installationId !== localInstallationId) {
      return { valid: false, error: 'La licencia no corresponde a este equipo.' };
    }
    
    // Verify Expiration (0 means permanent). 0 tolerance.
    if (exp !== 0 && Date.now() > exp) {
      return { valid: false, error: 'La licencia ha expirado.' };
    }

    if (!PUBLIC_KEY_JWK) {
      return { valid: false, error: 'Clave pública no configurada.' };
    }

    // WebCrypto implementation for Ed25519 signature verification
    const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
        ? globalThis.crypto.subtle
        : (typeof crypto !== 'undefined' && crypto.webcrypto ? crypto.webcrypto.subtle : null);

    if (!cryptoSubtle) {
      return { valid: false, error: 'SubtleCrypto no disponible en el entorno.' };
    }
    
    const cryptoKey = await cryptoSubtle.importKey(
      "jwk",
      PUBLIC_KEY_JWK,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const isValidSignature = await cryptoSubtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      signatureBytes,
      payloadBytes
    );

    if (!isValidSignature) {
      return { valid: false, error: 'Firma digital inválida o licencia alterada.' };
    }

    return { 
      valid: true, 
      payload: { version, licenseId, installationId, plan, iat, exp },
      error: null
    };

  } catch (error) {
    console.error("Error validando licencia:", error);
    return { valid: false, error: 'Error interno al validar la licencia.' };
  }
}

/**
 * Valida de forma local y offline un certificado de licencia Plan Pro emitido con Ed25519.
 * 
 * Reglas de validación:
 * 1. Formato de certificado digital (Base64.Base64).
 * 2. Integridad de firma asimétrica verificada con la clave pública Ed25519 Pro.
 * 3. Coincidencia estricta con el installationId del equipo.
 * 4. Plan Pro (payload.plan === 'Pro'). Rechaza certificados 'Básico' u otros planes.
 * 5. Vigencia: exp === 0 para licencias comerciales permanentes (sin vencimiento). Si exp > 0, verifica Date.now() <= exp.
 * 
 * @param {string} token - Formato Base64(Payload).Base64(Signature)
 * @param {string} localInstallationId - installationId único de la terminal
 * @returns {Promise<{valid: boolean, payload: object|null, error: string|null}>}
 */
export async function verifyProLicenseCertificate(token, localInstallationId) {
  if (!token || typeof token !== 'string') {
    return { valid: false, payload: null, error: 'Token de licencia no proporcionado.' };
  }

  const result = await verifyEd25519License(token, localInstallationId);
  if (!result.valid) {
    return { valid: false, payload: null, error: result.error };
  }

  if (result.payload?.plan !== 'Pro') {
    return { valid: false, payload: null, error: 'El certificado no corresponde a una licencia Plan Pro.' };
  }

  return { valid: true, payload: result.payload, error: null };
}

/**
 * Clave pública Ed25519 para activación básica (emitida por la Edge Function activate-device).
 */
export const BASIC_PUBLIC_KEY_JWK = (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__)
  ? globalThis.__TEST_BASIC_PUBLIC_KEY_JWK__
  : {
      "crv": "Ed25519",
      "x": "E8DDN-xpkQijtwuNNIA_W9FzXhZQFqjBUDo9PSffCmc",
      "kty": "OKP"
    };

/**
 * Valida de forma local y offline el certificado digital de activación básica emitido por activate-device.
 * Reglas de seguridad:
 * - Valida la firma Ed25519 con la clave pública Básica.
 * - Requiere coincidencia exacta con el installationId del equipo.
 * - Requiere type === 'initial_activation'.
 * - Requiere plan === 'Básico'.
 * @param {string} token - Formato base64(JSON).base64(Firma)
 * @param {string} localInstallationId - Identificador único de este equipo
 * @returns {Promise<{valid: boolean, payload: object|null, error: string|null}>}
 */
export async function verifyBasicActivationCertificate(token, localInstallationId) {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, payload: null, error: 'Formato de certificado inválido.' };
    }

    const [b64Payload, b64Signature] = token.split('.');
    if (!b64Payload || !b64Signature) {
      return { valid: false, payload: null, error: 'Token de activación incompleto.' };
    }

    let payloadBytes;
    try {
      payloadBytes = base64ToUint8Array(b64Payload);
    } catch {
      return { valid: false, payload: null, error: 'Codificación del certificado no válida.' };
    }

    let payloadStr;
    try {
      payloadStr = new TextDecoder('utf-8').decode(payloadBytes);
    } catch {
      return { valid: false, payload: null, error: 'Texto del certificado no válido.' };
    }

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return { valid: false, payload: null, error: 'Payload de activación malformado.' };
    }


    // Validar versión
    if (payload.version !== 1) {
      return { valid: false, payload: null, error: 'Versión de certificado no soportada.' };
    }

    // Validar type explícito: no permitir que se use como licencia Pro
    if (payload.type !== 'initial_activation') {
      return { valid: false, payload: null, error: 'El certificado no corresponde a una activación básica.' };
    }

    // Validar plan: siempre debe ser Básico
    if (payload.plan !== 'Básico') {
      return { valid: false, payload: null, error: 'El certificado no autoriza este plan.' };
    }

    // Validar coincidencia de installationId
    if (!payload.installationId || payload.installationId !== localInstallationId) {
      return { valid: false, payload: null, error: 'El certificado no corresponde a este equipo.' };
    }

    const signatureBytes = base64ToUint8Array(b64Signature);

    const cryptoSubtle = (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
      ? window.crypto.subtle
      : (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
        ? globalThis.crypto.subtle
        : (typeof crypto !== 'undefined' && crypto.webcrypto ? crypto.webcrypto.subtle : null);

    if (!cryptoSubtle) {
      return { valid: false, payload: null, error: 'SubtleCrypto no disponible en el entorno.' };
    }


    const cryptoKey = await cryptoSubtle.importKey(
      "jwk",
      BASIC_PUBLIC_KEY_JWK,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const isValidSignature = await cryptoSubtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      signatureBytes,
      payloadBytes
    );

    if (!isValidSignature) {
      return { valid: false, payload: null, error: 'Firma digital inválida o certificado alterado.' };
    }

    return {
      valid: true,
      payload,
      error: null
    };
  } catch (error) {
    console.error('[licenseCrypto] Error validando certificado básico:', error);
    return { valid: false, payload: null, error: 'Error interno al validar el certificado básico.' };
  }
}

