# CHANGELOG — FASE 0.2.1: CORRECCIÓN DEL ENROLAMIENTO DE TERMINALES
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 2026-09-23  
**Rama:** `security/phase-0.2.1-secure-enrollment`  
**Base Commit (Backup):** `11089dc` (`backup: estado previo a security phase 0.2.1`)  

---

## 1. RESUMEN DE CAMBIOS REALIZADOS

Esta fase interviene de manera quirúrgica sobre el proceso de enrolamiento e identidad de terminales para cerrar la vulnerabilidad de **First-Claim / Enrollment Hijacking** detectada en la auditoría del código real de `terminal-sync`, corrigiendo además discrepancias documentadas y bugs de recuperación en el cliente.

---

## 2. MODIFICACIONES DETALLADAS POR COMPONENTE

### A. Edge Function (`supabase/functions/terminal-sync/index.ts`)
* **Eliminado First-Claim libre en `POST /enroll`**:
  - Ya no se emite un `terminalToken` únicamente conociendo o enviando `installationId`.
  - Ahora se exige `enrollmentTicket` obligatorio junto con `installationId`.
* **Consumo atómico de tickets (`atomic single-use`)**:
  - Se implementó la verificación y consumo en un solo paso mediante `UPDATE terminal_enrollment_tickets SET status='used', used_at=now() WHERE ticket_hash=$1 AND installation_id=$2 AND status='pending' AND expires_at > now() RETURNING id`.
  - Si no retorna filas, se rechaza con HTTP 403 (Ticket inválido, expirado o ya utilizado), mitigando ataques de concurrencia y reuso.
* **Eliminada la creación arbitraria de comercios (`auto-creation`)**:
  - Se eliminó el bloque que ejecutaba `supabase.from('merchants').insert(...)` cuando el comercio no existía. `/enroll` ahora solo enrola instalaciones autorizadas en comercios existentes (o creados por el flujo administrativo correspondiente).
* **Nuevo endpoint administrativo `POST /issue-ticket`**:
  - Permite a un operador autenticado (`supabase.auth.getUser()`) generar un Enrollment Ticket criptográfico (32 bytes / 256 bits de entropía en base64url).
  - Almacena en la base de datos únicamente el hash `SHA-256(ticket)`.
  - Retorna el ticket plaintext al administrador una sola vez para su uso en la terminal.
* **Validación eficiente de `campaign_id` en `POST /events`**:
  - Se subsanó la discrepancia documentada en Fase 0.2 donde no se validaba la existencia de campañas.
  - Se implementó validación por lote (`single batch query` con `.in('id', campaignIds)`) consultando la tabla `campaigns` en una única consulta SQL antes de insertar los eventos.
  - Eventos con `campaign_id` inexistente o vacío son descartados del lote.

### B. Cliente Electron / React (`src/services/terminalIdentityService.js`)
* **Corrección de comportamiento ante HTTP 401**:
  - Se eliminó la instrucción que borraba el token local (`localStorage.removeItem(TOKEN_KEY_ENC)`) ante un error 401 en `/heartbeat`, `/register` o `/events`.
  - Previene que una falla de autenticación transitoria o desincronización deje a la terminal sin credencial local y atrapada en un loop de HTTP 409 Conflict.
  - La terminal marca su estado como suspendida/desincronizada sin destruir su identidad local, preservando la capacidad de operar offline de acuerdo a las reglas maestras.

### C. Base de Datos / SQL (`SECURITY_PHASE_0_2_1_SUPABASE.sql` y Rollback)
* **Nueva tabla `public.terminal_enrollment_tickets`**:
  - Campos: `id` (UUID PK), `ticket_hash` (TEXT UNIQUE, SHA-256), `installation_id` (TEXT NOT NULL), `status` (TEXT: pending, used, revoked, expired), `expires_at` (TIMESTAMPTZ NOT NULL), `used_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ).
  - Índices: `idx_terminal_enrollment_tickets_lookup` sobre `(ticket_hash, installation_id, status)` para consumo atómico ultrarrápido; índice sobre `expires_at`.
  - RLS activada con denegación total para roles públicos (`anon`, `authenticated`). Solo accesible mediante `service_role` o políticas administrativas de backend.
* **Rollback Script (`SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql`)**:
  - Script idempotente para eliminar la tabla y sus políticas asociadas sin afectar `terminal_identities`, `merchants` ni `campaign_events`.

---

## 3. DISCREPANCIAS PREVIAS CORREGIDAS
1. **Creación de Merchants en `/enroll`**: La documentación de Fase 0.2 señalaba que `/enroll` requería un comercio preexistente, pero el código real auditado realizaba un INSERT abierto si no existía. Corregido localmente en `index.ts`.
2. **Validación de Campañas en `/events`**: Se afirmaba que `/events` validaba la existencia de `campaign_id`, pero el código real omitía dicha comprobación. Corregido localmente con batch query.
3. **Manejo de 401 en el Cliente**: Borraba credenciales forzando re-enrolamiento imposible (409 Conflict). Corregido.

---

## 4. ESTADO DE DESPLIEGUE
* **Archivos modificados localmente**: SÍ.
* **Edge Function desplegada en producción**: NO (detenida según Regla 44 y Regla 55 para revisión y selección de mecanismo de autoridad).
* **SQL ejecutado en Supabase Cloud**: NO (preparado y verificado sintácticamente, pendiente de ejecución autorizada).
