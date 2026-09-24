# CHANGELOG — FASE 0.2.1 / 0.2.1a: CORRECCIÓN DEL ENROLAMIENTO DE TERMINALES
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 2026-09-23  
**Rama:** `security/phase-0.2.1a-enrollment-review-fixes`  
**Checkpoint Previo (Backup):** `c807d88` (`backup: estado previo a security phase 0.2.1a`)  
**Base Backup Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN DE CAMBIOS REALIZADOS (REVISIÓN QUIRÚRGICA FINAL)

Esta fase interviene de manera quirúrgica sobre el proceso de enrolamiento e identidad de terminales para cerrar definitivamente la vulnerabilidad de **First-Claim / Enrollment Hijacking** detectada en la auditoría del código real de `terminal-sync`, corrigiendo además los 7 hallazgos identificados en la revisión del borrador inicial:

---

## 2. MODIFICACIONES DETALLADAS POR COMPONENTE

### A. Edge Function (`supabase/functions/terminal-sync/index.ts`)
* **Hallazgo 1 — Verificación de Administrador Real en `/issue-ticket`**:
  - Se eliminó la suposición de que `auth.role() === 'authenticated'` otorga privilegios administrativos.
  - La función ahora valida el token JWT (`getUser`) y luego verifica server-side que el `user.id` exista y esté activo en la tabla privada `public.admin_users`.
  - Si el usuario está autenticado pero no es administrador, responde con HTTP 403 Forbidden.
* **Hallazgo 2 — Erradicación de `commerceId` del cliente en `/enroll`**:
  - Se eliminó la lectura de `body.commerceId` y `body.storeName` para decisiones de identidad. La asignación del comercio proviene exclusivamente del ticket autorizado o del registro pre-provisionado en el servidor.
* **Hallazgo 3 — Eliminación de auto-creación de comercios y atomicidad estricta**:
  - Se eliminó el bloque que insertaba merchants sin autorización previa.
  - El enrolamiento se delega a la función PostgreSQL `enroll_terminal_with_ticket`, garantizando que si el comercio no existe se retorne 422 `MERCHANT_NOT_PROVISIONED` sin consumir el ticket ni dejar identidades parciales.
* **Hallazgo 4 — Blindaje de `commerceId` en `/register`**:
  - Se removió la línea `mData.commerce_id = body.commerceId;`. Una terminal autenticada no puede reasignar su comercio.
* **Hallazgo 5 — Duración unificada del ticket (30 Minutos)**:
  - Duración fijada server-side en exactamente 30 minutos (`Date.now() + 30 * 60 * 1000`). No se admiten parámetros de duración desde el cliente.
* **Hallazgo 6 — Manejo estricto de `campaign_id` en `/events`**:
  - Validación por lote eficiente en una sola consulta.
  - Eventos que declaran un `campaign_id` inexistente en la tabla `campaigns` son **descartados** del lote (no convertidos a null).
  - Eventos sin campaña asociada (legítimos) se conservan.

### B. Base de Datos / SQL (`SECURITY_PHASE_0_2_1_SUPABASE.sql` y Rollback)
* **Tabla `public.admin_users`**:
  - Creada para almacenar los UUID de administradores autorizados.
  - RLS activada con denegación absoluta para roles públicos (`anon`, `authenticated`). Solo accesible por `service_role`.
  - Procedimiento de bootstrap manual documentado en el script.
* **Tabla `public.terminal_enrollment_tickets`**:
  - RLS activada con denegación absoluta a roles públicos (`anon`, `authenticated`). Se eliminó la política previa que permitía acceso a usuarios autenticados.
* **Función RPC Transaccional `public.enroll_terminal_with_ticket`**:
  - Ejecuta dentro de una única transacción en PostgreSQL: verificación de identidad previa, verificación de merchant pre-provisionado, consumo atómico con row lock y creación de registro en `terminal_identities`.
  - Permiso exclusivo de ejecución para `service_role`.
* **Rollback Script (`SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql`)**:
  - Elimina de forma idempotente la función RPC `enroll_terminal_with_ticket`, la tabla `terminal_enrollment_tickets` y la tabla `admin_users`.

### C. Cliente Electron / React (`src/services/terminalIdentityService.js`)
* **Soporte de Ticket de Enrolamiento**:
  - Se agregó `STORAGE_KEYS.ENROLLMENT_TICKET`.
  - La función `getOrEnrollTerminalToken()` comprueba si existe un ticket autorizado. Si no existe, no realiza peticiones de auto-enrolamiento, preservando la operación offline del POS.
* **Protección ante HTTP 401**:
  - No borra el token local ante un error 401, evitando bucles de conflicto 409.

---

## 3. ESTADO DE DESPLIEGUE
* **Archivos modificados localmente**: SÍ.
* **Edge Function desplegada en producción**: NO.
* **SQL ejecutado en Supabase Cloud**: NO.
* **Producción modificada**: NO.
