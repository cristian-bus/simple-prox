# KioscoProX — CHANGELOG: Fase 0.2 de Hardening de Seguridad
## Identidad Segura de Terminal y Protección de Supabase

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2-terminal-identity`  
**Commit de Respaldo Previo (Fase 0.1):** `772c9b4`  
**Modo de Trabajo:** Cambio Quirúrgico (Zero Regressions, Offline-First)

---

## 1. Resumen de la Intervención

En esta fase se abordaron los dos riesgos residuales de Supabase identificados en las Fases 0 y 0.1:
1. **Riesgo A (`merchants`):** Eliminación de la confianza en la clave anónima pública (`anon key`) para realizar `INSERT` y `UPDATE` directos sobre la tabla de comercios.
2. **Riesgo B (`campaign_events`):** Eliminación de la inserción directa desautenticada de métricas de campaña vía PostgREST.

Se diseñó e implementó un esquema de **Identidad Criptográfica de Terminal Individual** gestionada por la Supabase Edge Function `terminal-sync`, respaldada por cifrado nativo de Windows DPAPI (`safeStorage` en Electron), y se cerraron las políticas públicas permisivas de PostgREST en Supabase tras verificar todas las pruebas de compatibilidad y seguridad.

---

## 2. Modificaciones Realizadas

### A. Infraestructura Servidor (Supabase)
* **Tabla `public.terminal_identities`:**
  - Creada con esquema: `installation_id` (PK), `token_hash` (SHA-256), `commerce_id`, `status`, `created_at`, `last_used_at`.
  - Habilitada con Row Level Security (RLS) estricta: sin políticas públicas para `anon` o `public` (100% privada para `service_role`).
* **Supabase Edge Function (`terminal-sync`):**
  - Desplegada y activa en `https://qtixbiikhvhzwshfgyeo.supabase.co/functions/v1/terminal-sync`.
  - Rutas implementadas:
    - `/enroll`: Enrolamiento de terminal y emisión de token criptográfico de alta entropía (256 bits).
    - `/heartbeat`: Telemetría técnica con allowlist estricta (`app_version`, `config_version`, `status`, `last_seen_at`).
    - `/register`: Registro/actualización de perfil del comercio vinculado exclusivamente al `installation_id` autenticado.
    - `/events`: Recepción de lotes de eventos con vinculación forzada del `merchant_id` a la terminal autenticada.
* **Cierre de Políticas PostgREST (Etapa B):**
  - Revocada política `merchants_insert_public`.
  - Revocada política `merchants_update_public`.
  - Revocada política `campaign_events_insert_public`.
  - Las consultas directas de atacantes con `anon key` son rechazadas o devuelven 0 filas modificadas.

### B. Módulo de Identidad y Cifrado en el Cliente
* **`src/services/terminalIdentityService.js` (Nuevo):**
  - Administra la obtención, almacenamiento seguro y enrolamiento del `terminalToken`.
  - Utiliza `safeStorage` (Windows DPAPI) a través de IPC en Electron para almacenar el token cifrado (`kioscoprox_terminal_cred_enc`).
  - Provee fallback seguro local para entornos de desarrollo.
  - Implementa `sendTerminalHeartbeat()`, `sendTerminalRegister()` y `sendTerminalEvents()`.
* **`electron/main.js`:**
  - Importación de `safeStorage` de Electron.
  - Registro de manejadores IPC `secure-store-encrypt` y `secure-store-decrypt` con verificación de `isEncryptionAvailable()`.
* **`electron/preload.cjs` & `electron/preload.js`:**
  - Exposición segura en `window.api` de `secureStoreEncrypt()` y `secureStoreDecrypt()`.

### C. Adaptación de Sincronización y Outbox
* **`src/services/syncService.js`:**
  - Despacho de lotes de métricas a través de `sendTerminalEvents()` en lugar de llamadas directas a PostgREST.
  - Despacho de operaciones individuales (`HEARTBEAT` y `MERCHANT_REGISTER`) a través de `sendTerminalHeartbeat()` y `sendTerminalRegister()`.
  - Preservación íntegra de la cola local Outbox, reintentos con backoff exponencial, detección de conectividad y vaciado automático tras reconexión.
* **`src/services/adSyncEngine.js`:**
  - Actualización de `registerMerchantRemotely()` para canalizar el registro a través de `sendTerminalRegister()`.
  - Actualización de `flushPendingEvents()` para utilizar `sendTerminalEvents()`.

---

## 3. Componentes Protegidos y NO Modificados

Conforme a las reglas maestras de `AGENTS.md`:
* **Identificadores de Terminal:** `installationId`, `merchantId` y `commerceId` existentes se conservaron **100% INTACTOS**.
* **Sistema de Licenciamiento PRO:** `calculateLicenseKey()`, `isValidLicenseKey()` y `SECRET_SALT` sin alteraciones. Las terminales PRO continúan siendo PRO.
* **Módulos POS:** `PuntoDeVenta.jsx`, `Turnos.jsx` (caja), `Productos.jsx`, `Inventario.jsx`, `Clientes.jsx`, impresión y cálculos comerciales intactos.
* **Panel Administrador:** Autenticación y control de sesión de Fase 0.1 (`authSession && authSession.user`) intactos.
* **Hardening Electron:** `isSafeExternalUrl` y deny-by-default intactos.

---

## 4. Archivos Modificados y Creados

| Archivo | Tipo | Descripción |
| :--- | :--- | :--- |
| `src/services/terminalIdentityService.js` | Nuevo | Servicio cliente de identidad y comunicación con Edge Function |
| `electron/main.js` | Modificado | Manejadores IPC para Windows DPAPI (`safeStorage`) |
| `electron/preload.cjs` | Modificado | Exposición en preload de cifrado DPAPI |
| `electron/preload.js` | Modificado | Exposición en preload de cifrado DPAPI |
| `src/services/syncService.js` | Modificado | Enrutamiento de Outbox hacia Edge Function |
| `src/services/adSyncEngine.js` | Modificado | Enrutamiento de registro y eventos hacia Edge Function |
| `SECURITY_PHASE_0_2_ARCHITECTURE.md` | Nuevo | Diseño arquitectónico de la solución |
| `SECURITY_PHASE_0_2_SUPABASE.sql` | Nuevo | DDL y políticas aplicadas |
| `SECURITY_PHASE_0_2_SUPABASE_BEFORE.sql` | Nuevo | Estado previo de RLS |
| `SECURITY_PHASE_0_2_SUPABASE_AFTER.sql` | Nuevo | Estado posterior de RLS |
| `SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql` | Nuevo | Script de reversión exacta de RLS |

---

## 5. Procedimiento de Rollback

### Rollback de Código:
```bash
git checkout security/phase-0.1-fixes
# O alternativamente:
git reset --hard 772c9b4
```

### Rollback de Supabase RLS:
Ejecutar las sentencias de `SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql` en el SQL Editor de Supabase.
