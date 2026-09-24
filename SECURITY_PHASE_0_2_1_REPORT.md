# INFORME DE SEGURIDAD — FASE 0.2.1 / 0.2.1a / 0.2.1b: CIERRE FINAL DE REVOCACIÓN Y ENROLAMIENTO
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 23 de Septiembre de 2026  
**Auditor / Ingeniero:** Senior Application, Supabase & PostgreSQL Security Engineer  
**Rama de Trabajo:** `security/phase-0.2.1b-revocation-hardening`  
**Commit Backup Previo:** `a72f899` (`backup: previo a ticket pending único fase 0.2.1b`)  
**Base Backup Fase 0.2.1b Inicial:** `e7da732`  
**Base Backup Fase 0.2.1a:** `c807d88`  
**Base Backup Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN EJECUTIVO (AJUSTE FINAL FASE 0.2.1b)

En este ajuste final se garantiza de forma estricta que **jamás coexistan múltiples tickets pendientes simultáneos** para un mismo `installationId`:

1. **Defensa en Profundidad**: Comprobación previa en la Edge Function (con transición a `expired` de tickets vencidos sin borrarlos) + garantía a nivel de motor PostgreSQL mediante índice único parcial.
2. **Control de Concurrencia**: Dos administradores o solicitudes simultáneas resultan en exactamente 1 ticket emitido y 1 rechazo con HTTP 409 `ENROLLMENT_TICKET_ALREADY_PENDING` (evitando errores 500 no controlados).
3. **Preservación Integral**: No se destruye el historial para auditoría. Se mantienen intactos los bloqueos de reactivación de terminales revocadas o suspendidas, la validación de admin real y el funcionamiento offline.

---

## 2. PARÁMETROS TÉCNICOS OBLIGATORIOS (SECCIÓN 35)

```text
Rama: security/phase-0.2.1b-revocation-hardening
Commit backup: a72f899 (backup: previo a ticket pending único fase 0.2.1b)
Commit final: Pendiente de confirmación tras commit de revisión

Archivos modificados:
- supabase/functions/terminal-sync/index.ts
- SECURITY_PHASE_0_2_1_SUPABASE.sql
- SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- SECURITY_PHASE_0_2_1_ARCHITECTURE.md
- SECURITY_PHASE_0_2_1_CHANGELOG.md
- SECURITY_PHASE_0_2_1_REPORT.md

REGLA TICKET:

Máximo pending por installationId: 1
Cómo se garantiza en TypeScript:
Consulta previa en terminal_enrollment_tickets filtrando por installation_id y status = 'pending'. Si existe y expires_at > now(), responde 409. Si está expirado, actualiza a status = 'expired'.
Cómo se garantiza en PostgreSQL:
Mediante índice único parcial sobre la columna installation_id restringido a status = 'pending'.
Constraint/index utilizado:
CREATE UNIQUE INDEX idx_terminal_enrollment_tickets_single_pending ON public.terminal_enrollment_tickets (installation_id) WHERE (status = 'pending');

Ticket pending válido existente: REJECT -> HTTP 409 ENROLLMENT_TICKET_ALREADY_PENDING
Ticket pending expirado: Actualizado server-side a 'expired' (sin borrar) y se permite la emisión del nuevo ticket
Ticket used: No bloquea la emisión de un nuevo ticket si la terminal es elegible (no posee identidad activa/revocada)

CONCURRENCIA:

Dos requests simultáneos: Exactamente 1 insert tiene éxito (200), el segundo viola el índice único parcial y retorna HTTP 409
Dos admins simultáneos: Exactamente 1 ticket pending emitido; el segundo admin recibe HTTP 409
Resultado DB esperado: COUNT(tickets WHERE installation_id = X AND status = 'pending') <= 1 siempre

HTTP:

Primer ticket: HTTP 200 OK
Segundo ticket: HTTP 409 Conflict
Código de conflicto: ENROLLMENT_TICKET_ALREADY_PENDING

DATOS:

¿Se borra historial?: NO (los registros used y expired se conservan intactos)
¿Expired se conserva?: SÍ (status pasa a 'expired' con created_at y expires_at originales)

SEGURIDAD PREVIA:

Admin real: SÍ (validación estricta contra public.admin_users)
Merchant pre-provisionado: SÍ (comprobado en public.merchants antes de emitir ticket)
commerceId server-side: SÍ (derivado de merchants, datos del cliente ignorados)
Revoked protegido: SÍ (rechazado con REENROLL_REQUIRES_ADMIN_RESET en issue-ticket y RPC)
Suspended protegido: SÍ (rechazado con REENROLL_REQUIRES_ADMIN_RESET en issue-ticket y RPC)
ON CONFLICT identidad: ELIMINADO (solo INSERT estricto en terminal_identities)
RLS privada: SÍ (terminal_enrollment_tickets y admin_users cerradas a anon y authenticated)

SQL:
Preparado: SÍ (SECURITY_PHASE_0_2_1_SUPABASE.sql)
Ejecutado: NO (Prohibido desplegar sin autorización)

Edge Function:
Modificada localmente: SÍ (supabase/functions/terminal-sync/index.ts)
Desplegada: NO (Prohibido desplegar sin autorización)

Producción modificada: NO

Build:
Vite v7.3.1 build client: EXIT CODE 0 (Sin errores de bundling ni sintaxis)

Tests realmente ejecutados:
- [TEST EJECUTADO] Compilación frontend Vite limpia (npm run build).
- [TEST EJECUTADO] Verificación estática de tipos TypeScript en Edge Function.
- [TEST EJECUTADO] Verificación sintáctica del índice único parcial en PostgreSQL.
- [TEST EJECUTADO] Verificación del mapeo de código de error PostgreSQL 23505 a HTTP 409.
- [TEST EJECUTADO] Verificación de ausencia de instrucciones DELETE de historial.

Tests pendientes:
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Invocación concurrente real con dos conexiones HTTP contra Supabase Cloud.
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Ejecución DDL en la base de datos qtixbiikhvhzwshfgyeo.

Riesgos residuales:
- Los tickets expirados se marcan como 'expired' de forma reactiva (al solicitar un nuevo ticket) o pueden limpiarse mediante un cron/job administrativo posterior si la tabla creciera significativamente con los años.

Rollback:
- Rollback código: git checkout a72f899 -- supabase/functions/terminal-sync/index.ts SECURITY_PHASE_0_2_1_SUPABASE.sql SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- Rollback SQL: Ejecutar SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- Rollback Edge Function: La versión 1 original sigue activa en Supabase Cloud.
```

---

## 3. DECLARACIÓN FINAL DE ESTADO

```text
AJUSTE FINAL FASE 0.2.1b PREPARADO PARA REVISIÓN

EDGE FUNCTION DESPLEGADA: NO
SQL EJECUTADO: NO
PRODUCCIÓN MODIFICADA: NO

SIGUIENTE PASO:
DESPLIEGUE CONTROLADO + PRUEBAS REALES
```
