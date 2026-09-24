# CHANGELOG — FASE 0.2.1 / 0.2.1a / 0.2.1b: CIERRE FINAL DE REVOCACIÓN Y ENROLAMIENTO
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 2026-09-23  
**Rama:** `security/phase-0.2.1b-revocation-hardening`  
**Checkpoint Previo (Backup):** `e7da732` (`backup: estado previo a security phase 0.2.1b`)  
**Base Backup Fase 0.2.1a:** `c807d88`  
**Base Backup Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN DE CAMBIOS REALIZADOS (FASE 0.2.1b)

Esta intervención resuelve quirúrgicamente los dos riesgos residuales identificados tras la revisión del borrador:

1. **Problema A (Bloqueo de Reactivación de Identidades)**:
   - Se eliminó completamente la cláusula `ON CONFLICT (installation_id) DO UPDATE` de la RPC `enroll_terminal_with_ticket`.
   - Se implementó la regla estricta de estados: si ya existe una identidad en `terminal_identities`, el enrolamiento normal es **rechazado**:
     - `status = 'active'` -> rechazo con `ALREADY_ENROLLED` (HTTP 409).
     - `status = 'revoked'`, `'suspended'` o cualquier otro estado -> rechazo con `REENROLL_REQUIRES_ADMIN_RESET` (HTTP 409).
   - El ticket **no se consume** si la terminal ya posee un registro previo en la base de datos.
2. **Problema B (Derivación Server-Side en `/issue-ticket`)**:
   - `/issue-ticket` ya no confía en `commerceId` ni `storeName` provistos por el cliente o panel.
   - Valida primero que el `installationId` exista pre-provisionado en `merchants`. Si no existe, rechaza con HTTP 422 `MERCHANT_NOT_PROVISIONED`.
   - Comprueba también si ya existe identidad previa en `terminal_identities`, impidiendo emitir tickets inútiles para terminales activas, revocadas o suspendidas (Defensa en Profundidad).
   - Deriva `commerce_id` y `store_name` directamente desde la fila de `merchants` obtenida del servidor.

---

## 2. MODIFICACIONES DETALLADAS POR COMPONENTE

### A. Edge Function (`supabase/functions/terminal-sync/index.ts`)
* **`/issue-ticket`**:
  - Valida precondición en `merchants`: si no existe el ID -> 422 `MERCHANT_NOT_PROVISIONED`.
  - Valida precondición en `terminal_identities`: si ya existe activa -> 409 `ALREADY_ENROLLED`; si está revocada/suspendida/otra -> 409 `REENROLL_REQUIRES_ADMIN_RESET`.
  - Deriva `commerce_id` y `store_name` desde la base de datos server-side.
  - Ignora cualquier `body.commerceId` o `body.storeName` enviado en el request.
* **`/enroll`**:
  - Mapea códigos de error de la RPC: `ALREADY_ENROLLED` y `REENROLL_REQUIRES_ADMIN_RESET` a HTTP 409, `MERCHANT_NOT_PROVISIONED` a HTTP 422, `INVALID_OR_EXPIRED_TICKET` a HTTP 403.

### B. Base de Datos / SQL (`SECURITY_PHASE_0_2_1_SUPABASE.sql` y Rollback)
* **RPC `public.enroll_terminal_with_ticket`**:
  - Reemplazado `ON CONFLICT DO UPDATE` por un `INSERT` estricto.
  - Consulta previa de precondiciones: evalúa `status` de identidad y existencia en `merchants` **antes** de marcar el ticket como usado.
  - Rechaza terminales revocadas o suspendidas con `REENROLL_REQUIRES_ADMIN_RESET`.
  - Rollback script mantiene la eliminación limpia de `enroll_terminal_with_ticket`, `terminal_enrollment_tickets` y `admin_users`.

---

## 3. ESTADO DE DESPLIEGUE
* **Archivos modificados localmente**: SÍ.
* **Edge Function desplegada en producción**: NO.
* **SQL ejecutado en Supabase Cloud**: NO.
* **Producción modificada**: NO.
