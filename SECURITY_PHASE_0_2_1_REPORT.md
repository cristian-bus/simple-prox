# INFORME DE SEGURIDAD — FASE 0.2.1 / 0.2.1a / 0.2.1b: CIERRE FINAL DE REVOCACIÓN Y ENROLAMIENTO
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 23 de Septiembre de 2026  
**Auditor / Ingeniero:** Senior Application, Supabase & PostgreSQL Security Engineer  
**Rama de Trabajo:** `security/phase-0.2.1b-revocation-hardening`  
**Commit Backup Previo:** `e7da732` (`backup: estado previo a security phase 0.2.1b`)  
**Base Backup Fase 0.2.1a:** `c807d88`  
**Base Backup Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN EJECUTIVO (FASE 0.2.1b)

Durante la Fase 0.2.1b se completó el endurecimiento definitivo del ciclo de vida de identidades y la emisión de tickets, mitigando los dos riesgos residuales identificados:

1. **Problema A (Bloqueo de Reactivación de Terminales Revocadas o Suspendidas)**:
   - Se erradicó la instrucción `ON CONFLICT DO UPDATE` de la base de datos PostgreSQL.
   - La RPC `enroll_terminal_with_ticket` ahora implementa una verificación estricta de estados previa: si existe un registro previo con estado `revoked`, `suspended` o cualquier otro estado no activo, rechaza la operación con código `REENROLL_REQUIRES_ADMIN_RESET` (HTTP 409) sin consumir el ticket ni alterar el hash ni el estado existente.
2. **Problema B (Derivación Server-Side en `/issue-ticket`)**:
   - `/issue-ticket` ya no confía en `commerceId` ni `storeName` provistos en el request.
   - Comprueba la pre-existencia del comercio en `public.merchants`; si no existe, rechaza con HTTP 422 `MERCHANT_NOT_PROVISIONED`.
   - Comprueba en `public.terminal_identities` si la terminal ya está activa (HTTP 409 `ALREADY_ENROLLED`) o revocada/suspendida (HTTP 409 `REENROLL_REQUIRES_ADMIN_RESET`).
   - Deriva `commerce_id` y `store_name` directamente del registro de `merchants` en el servidor, almacenándolos de forma fidedigna en `terminal_enrollment_tickets`.

---

## 2. PARÁMETROS TÉCNICOS OBLIGATORIOS (SECCIÓN 43)

```text
Rama: security/phase-0.2.1b-revocation-hardening
Commit backup: e7da732 (backup: estado previo a security phase 0.2.1b)
Commit final: Pendiente de confirmación tras commit de revisión

Archivos modificados:
- supabase/functions/terminal-sync/index.ts
- SECURITY_PHASE_0_2_1_SUPABASE.sql
- SECURITY_PHASE_0_2_1_ARCHITECTURE.md
- SECURITY_PHASE_0_2_1_CHANGELOG.md
- SECURITY_PHASE_0_2_1_REPORT.md

IDENTIDADES:

No existe: Enrolamiento normal permitido (si el ticket es válido y el comercio está provisionado)
Active: REJECT -> ALREADY_ENROLLED (HTTP 409)
Revoked: REJECT -> REENROLL_REQUIRES_ADMIN_RESET (HTTP 409)
Suspended: REJECT -> REENROLL_REQUIRES_ADMIN_RESET (HTTP 409)
Otro estado: FAIL CLOSED -> REENROLL_REQUIRES_ADMIN_RESET (HTTP 409)

¿Enrollment puede sobrescribir token existente?: NO (INSERT estricto, sin ON CONFLICT DO UPDATE)
¿Enrollment puede cambiar revoked → active?: NO (bloqueado por precondición y ausencia de UPDATE)
¿Enrollment puede cambiar suspended → active?: NO (bloqueado por precondición y ausencia de UPDATE)

ON CONFLICT DO UPDATE:
ELIMINADO

ISSUE-TICKET:

Datos recibidos del cliente: installationId (obligatorio, string)
Datos obtenidos de merchants: commerce_id, name (obtenidos server-side por query)
¿commerceId del request se utiliza?: NO (ignorado)
¿storeName del request se utiliza?: NO (ignorado)

Merchant inexistente: REJECT -> HTTP 422 MERCHANT_NOT_PROVISIONED
Identidad active: REJECT -> HTTP 409 ALREADY_ENROLLED
Identidad revoked: REJECT -> HTTP 409 REENROLL_REQUIRES_ADMIN_RESET
Identidad suspended: REJECT -> HTTP 409 REENROLL_REQUIRES_ADMIN_RESET

TICKET:

Duración: 30 minutos fijos server-side (30 * 60 * 1000 ms)
Single-use: SÍ (status pasa de 'pending' a 'used' con row lock)
Hash: SHA-256 (almacenado en terminal_enrollment_tickets)
¿se consume ante MERCHANT_NOT_PROVISIONED?: NO (precondición comprobada antes del UPDATE del ticket)
¿se consume ante ALREADY_ENROLLED?: NO (precondición comprobada antes del UPDATE del ticket)
¿se consume ante REENROLL_REQUIRES_ADMIN_RESET?: NO (precondición comprobada antes del UPDATE del ticket)

CONCURRENCIA:

Mismo ticket: Exactamente 1 request obtiene la fila vía Row-Level Lock; el concurrente falla (403)
Dos tickets / mismo installationId:
Exactamente 1 identidad es creada vía INSERT. El segundo request falla por conflicto con la PRIMARY KEY (installation_id) revirtiendo la transacción y dejando intacta la primera identidad.

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
- [TEST EJECUTADO] Verificación estática de sintaxis y tipos TypeScript en Deno Edge Function.
- [TEST EJECUTADO] Verificación de estructura PL/pgSQL y control de flujo de errores en RPC PostgreSQL.
- [TEST EJECUTADO] Verificación de ausencia de ON CONFLICT DO UPDATE en todo el script DDL.
- [TEST EJECUTADO] Verificación de aislamiento deny-by-default en RLS de tablas privadas.

Tests pendientes:
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Invocación HTTP real contra endpoints de Supabase Cloud.
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Ejecución DDL en la base de datos qtixbiikhvhzwshfgyeo.

Riesgos residuales:
- Operación de reactivación/re-enrolamiento de terminales legítimamente reemplazadas debe realizarse manualmente vía SQL o función administrativa específica que limpie o resetee el registro de terminal_identities.

Rollback:
- Rollback código: git checkout e7da732 -- supabase/functions/terminal-sync/index.ts SECURITY_PHASE_0_2_1_SUPABASE.sql
- Rollback SQL: Ejecutar SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- Rollback Edge Function: La versión 1 original sigue activa en Supabase Cloud.
```

---

## 3. DECLARACIÓN FINAL DE ESTADO

```text
FASE 0.2.1b PREPARADA PARA REVISIÓN

EDGE FUNCTION DESPLEGADA: NO
SQL EJECUTADO: NO
PRODUCCIÓN MODIFICADA: NO
```
