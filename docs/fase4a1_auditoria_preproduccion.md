# SIMPLE PROX v1.3.10 — FASE 4A.1
# INFORME DE AUDITORÍA FINAL PREVIA AL DESPLIEGUE EN SUPABASE

**Fecha de Auditoría:** 6 de Noviembre de 2026  
**Tipo de Auditoría:** Seguridad, Compatibilidad, Concurrencia e Integridad SQL  
**Objetivo:** Auditar los archivos SQL generados en FASE 4A antes de cualquier ejecución en Supabase productivo.  
**Modo:** Solo lectura (salvo traslado autorizado de scripts de ROLLBACK).  
**Producción Supabase:** **100% INTACTA. CERO CONEXIÓN O EJECUCIÓN EN PRODUCCIÓN.**  

---

## 1. RESUMEN DE CAMBIOS REALIZADOS EN ESTA FASE

En cumplimiento de las instrucciones de la FASE 4A.1, se realizó una única modificación de estructura de archivos autorizada:
- Se trasladaron los dos archivos de reversión fuera de `supabase/migrations/` hacia `supabase/manual-scripts/`:
  1. `supabase/migrations/20261106_campaign_statistics_aggregates_ROLLBACK.sql` $\rightarrow$ `supabase/manual-scripts/20261106_campaign_statistics_aggregates_ROLLBACK.sql`
  2. `supabase/migrations/20261106_campaign_statistics_functions_ROLLBACK.sql` $\rightarrow$ `supabase/manual-scripts/20261106_campaign_statistics_functions_ROLLBACK.sql`
- Se actualizó la ruta de lectura en la suite de pruebas `tests/fase4a_migrations_runner.mjs`.
- **Ningún código productivo (src/, panel-admin/, electron/, terminal-sync) fue modificado.**

---

## 2. HALLAZGOS DE AUDITORÍA CLASIFICADOS POR RIESGO

### HALLAZGO 1: Falta de `SET search_path = ''` en Funciones `SECURITY DEFINER`
- **Clasificación:** **CRÍTICO**
- **Archivo y Líneas Afectadas:** `supabase/migrations/20261106_campaign_statistics_functions.sql` (líneas 15-20, 110-115, 200-205).
- **Explicación del Riesgo:**  
  Las funciones `consolidate_campaign_events_batch`, `reconcile_campaign_metrics_4d` y `purge_campaign_events_safe` se ejecutan con privilegios de superusuario (`SECURITY DEFINER`), pero omiten declarar `SET search_path = ''`.  
  En PostgreSQL, una función `SECURITY DEFINER` sin `search_path` fijo es vulnerable a secuestro de rutas de búsqueda (CVE search-path hijacking), ya que hereda el `search_path` del usuario que la invoca. Además, el Database Linter oficial de Supabase rechaza o marca con severidad crítica las funciones `SECURITY DEFINER` sin `search_path` explícito.
- **Evidencia Técnica en el Repositorio:**  
  En las migraciones previas aprobadas para producción (`20261013_merchants_admin_rls.sql` y `20261102_b2b_commercial_management.sql`), todas las funciones fijan estrictamente:
  ```sql
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$ ...
  ```
- **Corrección Mínima Propuesta:**  
  Incorporar `SET search_path = ''` en las tres funciones y calificar todas las llamadas de tablas y funciones con sus esquemas explícitos (`public.campaign_events`, `public.campaign_daily_aggregates`, `pg_catalog.now()`).

---

### HALLAZGO 2: Omisión de `WITH (security_invoker = true)` en Vistas Públicas
- **Clasificación:** **ALTO**
- **Archivo y Líneas Afectadas:** `supabase/migrations/20261106_campaign_statistics_aggregates.sql` (líneas 86 y 130).
- **Explicación del Riesgo:**  
  En PostgreSQL 15+, las vistas normales ejecutan las consultas subyacentes con los privilegios del *propietario de la vista* (usualmente `postgres`), omitiendo por completo las políticas RLS de las tablas base.  
  Dado que se otorgó `GRANT SELECT ON public.v_campaign_combined_metrics TO authenticated;`, cualquier usuario autenticado en Supabase que consulte la vista podría saltarse las políticas RLS de `campaign_daily_aggregates` y `campaign_events`.
- **Evidencia Técnica en el Repositorio:**  
  La migración productiva `20261026_campaign_daily_quota_support.sql` utilizó expresamente:
  ```sql
  CREATE OR REPLACE VIEW public.v_campaign_daily_quotas
  WITH (security_invoker = true) AS ...
  ```
- **Corrección Mínima Propuesta:**  
  Declarar `v_campaign_combined_metrics` y `v_campaign_totals` con `WITH (security_invoker = true)` para que respeten estrictamente el contexto y las políticas RLS del usuario que realiza la consulta.

---

### HALLAZGO 3: Sentencias `CREATE ROLE` en Migraciones Productivas
- **Clasificación:** **ALTO**
- **Archivo y Líneas Afectadas:** `supabase/migrations/20261106_campaign_statistics_aggregates.sql` (líneas 16-27) y `20261106_campaign_statistics_functions.sql` (líneas 12-23).
- **Explicación del Riesgo:**  
  Se incluyó un bloque `DO $$ ... CREATE ROLE anon/authenticated/service_role ... $$;` para compatibilidad con PostgreSQL local (Docker). Sin embargo, en Supabase Cloud administrado, el usuario con el que se aplican las migraciones no tiene privilegios de superusuario global `CREATEROLE`. La ejecución de sentencias `CREATE ROLE` puede arrojar un error fatal `permission denied to create role` y abortar la migración durante el despliegue.
- **Evidencia Técnica en el Repositorio:**  
  Ninguna otra migración en `supabase/migrations/` contiene `CREATE ROLE`. En Supabase, esos roles existen nativamente por defecto.
- **Corrección Mínima Propuesta:**  
  Remover completamente los bloques `CREATE ROLE` de los archivos en `supabase/migrations/` y mantener la creación de roles sintéticos exclusivamente dentro del script de pruebas local (`tests/fase4a_migrations_runner.mjs`).

---

### HALLAZGO 4: Políticas RLS con `USING (true)` en Lugar de Validar Administrador Activo
- **Clasificación:** **MEDIO**
- **Archivo y Líneas Afectadas:** `supabase/migrations/20261106_campaign_statistics_aggregates.sql` (líneas 165-195).
- **Explicación del Riesgo:**  
  Las políticas otorgan lectura a cualquier usuario `authenticated` mediante `USING (true)`. En Simple ProX, los usuarios autenticados comunes no deben tener acceso libre a las tablas de auditoría `purge_ledger` y `consolidation_audit_log`, las cuales deben estar restringidas exclusivamente a administradores activos o a `service_role`.
- **Evidencia Técnica en el Repositorio:**  
  `20261013_merchants_admin_rls.sql` define la regla del proyecto:
  ```sql
  CREATE POLICY "merchants_select_admin" ON public.merchants
    FOR SELECT TO authenticated
    USING (public.is_active_admin());
  ```
- **Corrección Mínima Propuesta:**  
  Reemplazar `USING (true)` por `USING (public.is_active_admin())` en las políticas de lectura para `authenticated` en `campaign_daily_aggregates`, y revocar el acceso de lectura a `authenticated` en `purge_ledger` y `consolidation_audit_log` (dejándolas exclusivas para `service_role`).

---

### HALLAZGO 5: Riesgo de Auto-Ejecución de Rollbacks en Supabase CLI
- **Clasificación:** **MEDIO**
- **Estado:** **CORREGIDO / MITIGADO EN ESTA FASE.**
- **Explicación del Riesgo:**  
  Supabase CLI ejecuta alfabéticamente todos los archivos en `supabase/migrations/`. La permanencia de scripts `*_ROLLBACK.sql` dentro de esa carpeta provocaría la reversión inmediata de las tablas recién creadas.
- **Acción Ejecutada:**  
  Se trasladaron a `supabase/manual-scripts/`, quedando únicamente las migraciones canónicas hacia adelante en `supabase/migrations/`.

---

### HALLAZGO 6: Falta de Validación Administrativa en RPC `reconcile_campaign_metrics_4d`
- **Clasificación:** **BAJO**
- **Archivo y Líneas Afectadas:** `supabase/migrations/20261106_campaign_statistics_functions.sql` (líneas 115-130).
- **Explicación del Riesgo:**  
  La función está expuesta con `GRANT EXECUTE ... TO authenticated`. Aunque es de solo lectura (`STABLE`), cualquier usuario autenticado podría invocarla en bucle vía API PostgREST (`/rpc/reconcile_campaign_metrics_4d`), generando consumo innecesario de recursos en la base de datos al forzar el escaneo de particiones.
- **Corrección Mínima Propuesta:**  
  Agregar control de guardia administrativa al inicio de la función:
  ```sql
  IF current_user NOT IN ('service_role', 'postgres') THEN
    IF NOT public.is_active_admin() THEN
      RAISE EXCEPTION 'Acceso denegado: se requieren privilegios administrativos.';
    END IF;
  END IF;
  ```

---

## 3. ESTADO DE LAS VERIFICACIONES TÉCNICAS

| Dimensión Auditada | Estado | Detalle |
| :--- | :---: | :--- |
| **Seguridad de Funciones (RPC)** | **Requiere Ajuste** | Consolidador y Purga están correctamente restringidos a `service_role` (las terminales NO pueden ejecutarlos). Sin embargo, requieren `SET search_path = ''` por CVE search-path hijacking. |
| **Seguridad de Vistas** | **Requiere Ajuste** | Faltan cláusulas `WITH (security_invoker = true)` para respetar RLS en consultas autenticadas. |
| **Integridad de Estadísticas** | **CORRECTA** | Cero duplicación. Eventos pendientes visibles en vistas combinadas. Topes diarios preservados en su calendario. Dimensiones de mayoristas (`distributor_id`), comercios y tipos 100% conservadas. |
| **Concurrencia y Bloqueos** | **CORRECTA** | Advisory lock transaccional (`pg_try_advisory_xact_lock`) impide workers concurrentes. `FOR UPDATE SKIP LOCKED` evita deadlocks. La purga solo borra tuplas consolidadas. |
| **Reversibilidad y Rollback** | **CORRECTA** | Rollback antes de purga preserva el 100% de datos crudos. Scripts de rollback protegidos fuera de `supabase/migrations/`. Estrategia dry-run por defecto. |
| **Compatibilidad con Supabase** | **Requiere Ajuste** | Deben eliminarse sentencias `CREATE ROLE` que fallarían en el entorno Cloud gestionado. |

---

## 4. DICTAMEN FINAL OBLIGATORIO

```text
================================================================================
                    DICTAMEN FINAL: NO APTO PARA FASE 4B
================================================================================
```

### Justificación Técnica:
Aunque la arquitectura demostró una solidez matemática y funcional impecable en el entorno local (12/12 pruebas aprobadas en PostgreSQL 17), los archivos SQL actuales **presentan riesgos de seguridad y compatibilidad de despliegue en Supabase Cloud**:
1. Vulnerabilidad de `search_path` en funciones `SECURITY DEFINER` (Hallazgo 1 - Crítico).
2. Potencial fallo de permisos por `CREATE ROLE` en Supabase Cloud (Hallazgo 3 - Alto).
3. Omisión de `security_invoker = true` en vistas públicas (Hallazgo 2 - Alto).
4. Políticas RLS con `USING (true)` en tablas de auditoría (Hallazgo 4 - Medio).

### Próximo Paso Requerido:
Aplicar quirúrgicamente las 4 correcciones mínimas identificadas sobre los dos archivos de migración:
- `supabase/migrations/20261106_campaign_statistics_aggregates.sql`
- `supabase/migrations/20261106_campaign_statistics_functions.sql`

Una vez aplicadas y revalidadas las pruebas, el estado pasará a **APTO PARA FASE 4B**.

---

## 5. CONFIRMACIÓN FINAL DE PRODUCCIÓN INTACTA

Se certifica bajo las directivas de `AGENTS.md`:
- **Supabase comercial no fue contactado ni modificado.**
- **No se modificó código de la aplicación, panel ni Edge Functions.**
- **El sistema continúa funcionando normalmente.**

