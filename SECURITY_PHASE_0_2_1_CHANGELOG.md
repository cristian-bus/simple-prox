# CHANGELOG — FASE 0.2.1 / 0.2.1a / 0.2.1b: CIERRE FINAL DE REVOCACIÓN Y ENROLAMIENTO
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2.1b-revocation-hardening`  
**Checkpoint Previo (Backup):** `a72f899` (`backup: previo a ticket pending único fase 0.2.1b`)  
**Base Backup Fase 0.2.1b Inicial:** `e7da732`  
**Base Backup Fase 0.2.1a:** `c807d88`  
**Base Backup Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN DE CAMBIOS REALIZADOS (AJUSTE FINAL FASE 0.2.1b)

En este ajuste final se garantiza que jamás coexistan múltiples tickets pendientes simultáneos para una misma terminal:

1. **Regla de Ticket Pending Único**:
   - `/issue-ticket` comprueba la existencia de tickets en estado `pending` para el `installationId`.
   - Si existe uno vigente (`expires_at > now()`), se rechaza la solicitud con **HTTP 409 `ENROLLMENT_TICKET_ALREADY_PENDING`**.
   - Si existe uno expirado (`expires_at <= now()`), se actualiza su estado server-side a `expired` (preservando el historial para auditoría) antes de generar el nuevo ticket.
2. **Garantía en Base de Datos (PostgreSQL)**:
   - Se añadió un índice único parcial en PostgreSQL:
     `CREATE UNIQUE INDEX idx_terminal_enrollment_tickets_single_pending ON public.terminal_enrollment_tickets (installation_id) WHERE (status = 'pending');`
   - Si dos peticiones concurrentes intentan registrar un ticket pending para el mismo `installation_id`, PostgreSQL rechaza la segunda por violación de unicidad (`error 23505`).
   - La Edge Function captura el error y responde con HTTP 409 (en lugar de un error 500 no controlado).
3. **Preservación Total de Auditoría y Reglas Previas**:
   - No se borra ningún registro histórico. Los estados `used` y `expired` quedan documentados en la tabla.
   - Se mantiene el bloqueo estricto de reactivación de identidades revocadas o suspendidas (sin `ON CONFLICT DO UPDATE`).

---

## 2. MODIFICACIONES DETALLADAS POR COMPONENTE

### A. Edge Function (`supabase/functions/terminal-sync/index.ts`)
* **`/issue-ticket`**:
  - Detección previa de tickets `pending`: rechazo 409 si está vigente; transición a `status = 'expired'` si ya venció.
  - Captura de colisión concurrente (`23505` / `idx_terminal_enrollment_tickets_single_pending`) devolviendo HTTP 409 `ENROLLMENT_TICKET_ALREADY_PENDING`.

### B. Base de Datos / SQL (`SECURITY_PHASE_0_2_1_SUPABASE.sql` y Rollback)
* **Tabla `terminal_enrollment_tickets`**:
  - Incorporación del índice único parcial `idx_terminal_enrollment_tickets_single_pending`.
  - Documentación de consulta diagnóstica previa para verificar que no existan duplicados históricos antes de la aplicación del índice.
* **Script de Rollback (`SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql`)**:
  - Actualización de encabezado a Fase 0.2.1b y eliminación explícita de `idx_terminal_enrollment_tickets_single_pending`.

---

## 3. ESTADO DE DESPLIEGUE
* **Archivos modificados localmente**: SÍ.
* **Edge Function desplegada en producción**: NO.
* **SQL ejecutado en Supabase Cloud**: NO.
* **Producción modificada**: NO.
