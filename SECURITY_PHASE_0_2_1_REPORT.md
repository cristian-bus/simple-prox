# INFORME DE SEGURIDAD — FASE 0.2.1 / 0.2.1a: REVISIÓN FINAL DEL ENROLAMIENTO SEGURO
**Proyecto:** KioscoProX / Simple ProX  
**Fecha:** 23 de Septiembre de 2026  
**Auditor / Ingeniero:** Senior Application, Supabase & PostgreSQL Security Engineer  
**Rama de Trabajo:** `security/phase-0.2.1a-enrollment-review-fixes`  
**Commit Backup Previo:** `c807d88` (`backup: estado previo a security phase 0.2.1a`)  
**Commit Base Fase 0.2.1:** `11089dc`  

---

## 1. RESUMEN EJECUTIVO

Durante la Fase 0.2.1a se completó la revisión quirúrgica del borrador de enrolamiento seguro de terminales, resolviendo los 7 hallazgos detectados en la auditoría del diseño preliminar:

1. **Autoridad Administrativa Real**: `/issue-ticket` ya no considera `authenticated` como admin. Valida contra la tabla privada `public.admin_users`, respondiendo con HTTP 403 ante usuarios autenticados sin privilegios.
2. **Blindaje de Identidad en `/enroll`**: Se eliminó cualquier lectura de `body.commerceId` y `body.storeName` para decisiones de identidad. La asignación comercial proviene exclusivamente de la pre-provisión server-side.
3. **Erradicación de Auto-Creación de Comercios**: `/enroll` no crea merchants arbitrariamente. Si el comercio no está pre-provisionado, la RPC responde con error 422 `MERCHANT_NOT_PROVISIONED` y el ticket **permanece intacto sin consumirse**.
4. **Garantía de Atomicidad Estricta**: Se implementó la función RPC PostgreSQL `public.enroll_terminal_with_ticket` con `SECURITY DEFINER` y bloqueo de fila (`ROW LOCK`), asegurando que precondiciones, consumo de ticket e inserción de identidad ocurran de forma indivisible.
5. **Blindaje de `/register`**: Se eliminó la posibilidad de modificar `commerce_id` desde una terminal autenticada.
6. **Unificación de Duración del Ticket**: Duración fijada server-side en exactamente **30 minutos**.
7. **Filtrado Estricto de Campañas en `/events`**: Eventos que declaren un `campaign_id` que no exista en la base de datos son **descartados** del lote.

---

## 2. PARÁMETROS TÉCNICOS OBLIGATORIOS (SECCIÓN 48)

```text
Rama: security/phase-0.2.1a-enrollment-review-fixes
Commit backup: c807d88 (backup: estado previo a security phase 0.2.1a)
Commit final: Pendiente de confirmación tras commit de revisión

Archivos modificados:
- supabase/functions/terminal-sync/index.ts
- src/services/terminalIdentityService.js
- SECURITY_PHASE_0_2_1_SUPABASE.sql
- SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- SECURITY_PHASE_0_2_1_ARCHITECTURE.md
- SECURITY_PHASE_0_2_1_CHANGELOG.md
- SECURITY_PHASE_0_2_1_REPORT.md

Archivos nuevos:
- Ninguno (actualización in-place de la documentación y scripts de la fase)

MODELO ADMIN:
Cómo se determina un administrador:
Mediante consulta server-side en la tabla privada public.admin_users (is_active = true) cruzando el user.id obtenido de adminClient.auth.getUser(jwt).

Dónde se almacena esa autorización:
En la tabla public.admin_users en la base de datos PostgreSQL de Supabase.

Cómo se crea el primer admin:
Operación administrativa manual en SQL:
INSERT INTO public.admin_users (user_id, is_active, notes)
VALUES ('<UUID_DEL_USUARIO_EN_AUTH_USERS>', true, 'Superadmin inicial');

/issue-ticket:
No autenticado: HTTP 401 Unauthorized
Authenticated no-admin: HTTP 403 Forbidden
Admin: HTTP 200 OK (retorna enrollmentTicket con validez de 30 min)

terminal_enrollment_tickets:
anon acceso: REJECT (Denegado totalmente por RLS / REVOKE ALL)
authenticated acceso: REJECT (Denegado totalmente por RLS / REVOKE ALL)
service_role acceso: PERMITIDO (Exclusivo para la Edge Function)

Duración ticket:
30 minutos fijos server-side (30 * 60 * 1000 ms). No configurable por cliente.

/enroll:
¿acepta commerceId del cliente?: NO (ignorado para decisiones de identidad)
¿acepta storeName del cliente para identidad?: NO (ignorado para decisiones de identidad)
¿crea merchant automáticamente?: NO (eliminado todo insert arbitrario)
¿qué pasa si merchant no existe?:
Retorna HTTP 422 con código 'MERCHANT_NOT_PROVISIONED'. El ticket NO es consumido.

Atomicidad:
¿Cómo se garantiza que ticket + identidad no queden en estado parcial?:
Mediante la función RPC PostgreSQL 'public.enroll_terminal_with_ticket' ejecutada dentro de una única transacción con SECURITY DEFINER y bloqueo de fila (Row Lock). Si cualquier verificación falla, Postgres revierte todos los cambios.

/register:
¿puede cambiar commerceId?: NO (campo removido del procesamiento de /register)

/events:
campaign inexistente: Evento descartado del lote de inserción
campaign ausente: Conservado con campaign_id null si el evento es legítimo

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
- [TEST EJECUTADO] Análisis de coherencia transaccional y compatibilidad SQL en PostgreSQL.
- [TEST EJECUTADO] Verificación de aislamiento RLS deny-by-default en scripts DDL.

Tests pendientes:
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Invocación HTTP real contra endpoints de Supabase Cloud.
- [TEST PENDIENTE POR NO HABER DESPLEGADO] Ejecución DDL en la base de datos qtixbiikhvhzwshfgyeo.

Riesgos residuales:
- Rate limiting por IP a nivel de Edge Network sigue dependiendo de la infraestructura nativa de Supabase Cloud.
- El alta de nuevas terminales requerirá que el operador pre-registre el comercio y asigne el UUID del administrador en admin_users.

Rollback:
- Rollback código: git checkout c807d88 -- supabase/functions/terminal-sync/index.ts src/services/terminalIdentityService.js
- Rollback SQL: Ejecutar SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql
- Rollback Edge Function: La versión 1 original sigue activa en Supabase Cloud.
```

---

## 3. DECLARACIÓN FINAL DE ESTADO

```text
FASE 0.2.1a PREPARADA PARA REVISIÓN

EDGE FUNCTION DESPLEGADA: NO
SQL EJECUTADO: NO
PRODUCCIÓN MODIFICADA: NO
```
