# SIMPLE PROX v1.3.10 — FASE 4B.0.1
# INFORME DE CORRECCIÓN PREVENTIVA DE COMPATIBILIDAD RLS EN SUPABASE

**Fecha:** 6 de Noviembre de 2026  
**Entorno Evaluado:** PostgreSQL 17.11 (`pg_isolated_fase3b`) con simulación del estado real de Supabase (`qtixbiikhvhzwshfgyeo`)  
**Modo:** CAMBIO QUIRÚRGICO PREVENTIVO — PRODUCCIÓN INTACTA  
**Resultado de Validación:** **100% PRUEBAS APROBADAS (Matriz 4x4 + Suite Integral de 18 Pruebas)**  
**Estado de Producción:** **100% INTACTO. CERO ESCRITURAS O CAMBIOS EN SUPABASE COMERCIAL.**  

---

## 1. RESUMEN DEL PROBLEMA Y HALLAZGOS TÉCNICOS

### A. Estado Real de Producción Detectado en `public.campaign_events`
- **Volumen:** 9.787 eventos reales almacenados.
- **Seguridad RLS:** Habilitada (`relrowsecurity = true`).
- **Concesiones SQL de Tabla (Grants):**
  - `anon`: `SELECT, INSERT, UPDATE, DELETE`
  - `authenticated`: `SELECT, INSERT, UPDATE, DELETE`
  - `service_role`: `SELECT, INSERT, UPDATE, DELETE`
- **Políticas RLS Heredadas Activas:**
  1. `campaign_events_select_auth`: `FOR SELECT TO public USING (auth.role() = 'authenticated')`
  2. `campaign_events_update_auth`: `FOR UPDATE TO public USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated')`
  3. `campaign_events_delete_auth`: `FOR DELETE TO public USING (auth.role() = 'authenticated')`

### B. Análisis del Fallo de Seguridad por Combinación `OR`
En PostgreSQL, múltiples políticas RLS permisivas para el mismo comando y rol se evalúan mediante el operador lógico disyuntivo (`OR`).  
Si la nueva migración simplemente añadía:
```sql
CREATE POLICY "campaign_events_admin_select" 
ON public.campaign_events FOR SELECT TO authenticated 
USING (public.is_active_admin());
```
sin gestionar las políticas anteriores, el motor PostgreSQL evaluaba:
$$\text{Acceso} = (\text{auth.role}() = \text{'authenticated'}) \lor \text{public.is\_active\_admin}()$$
Dado que para cualquier usuario autenticado común $(\text{auth.role}() = \text{'authenticated'})$ es verdadero (`true`), **la restricción a administradores quedaba completamente anulada (bypass total de RLS)**.

Adicionalmente, las políticas heredadas `campaign_events_update_auth` y `campaign_events_delete_auth` permitían que cualquier cliente o usuario con token autenticado pudiera mutar o borrar eventos de telemetría publicitaria directamente mediante PostgREST (`PATCH /rest/v1/campaign_events` o `DELETE /rest/v1/campaign_events`).

---

## 2. CAMBIOS SQL QUIRÚRGICOS IMPLEMENTADOS

En el archivo `supabase/migrations/20261106_campaign_statistics_aggregates.sql` se incorporaron tres niveles de defensa en profundidad:

### Nivel 1: Revocación de Privilegios Destructivos a Nivel SQL
Se anularon todos los permisos de mutación directa para usuarios no privilegiados:
```sql
REVOKE ALL ON TABLE public.campaign_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.campaign_events FROM authenticated;
GRANT SELECT ON TABLE public.campaign_events TO authenticated;
GRANT ALL ON TABLE public.campaign_events TO service_role;
```

### Nivel 2: Limpieza Exhaustiva de Políticas RLS Heredadas
Se eliminaron explícitamente las políticas permisivas anteriores para impedir la disyunción (`OR`):
```sql
DROP POLICY IF EXISTS "campaign_events_select_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_update_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_delete_auth" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_admin_select" ON public.campaign_events;
DROP POLICY IF EXISTS "campaign_events_service_role" ON public.campaign_events;
```

### Nivel 3: Políticas RLS Definitivas y Estrictas
Se establecieron las dos únicas reglas de acceso autorizadas:
```sql
-- 1. Lectura exclusiva para administradores activos (auditoría y panel administrativo)
CREATE POLICY "campaign_events_admin_select" 
ON public.campaign_events FOR SELECT TO authenticated 
USING (public.is_active_admin());

-- 2. Acceso total exclusivo para service_role (Edge Function terminal-sync y rutinas del sistema)
CREATE POLICY "campaign_events_service_role" 
ON public.campaign_events FOR ALL TO service_role 
USING (true) WITH CHECK (true);
```

---

## 3. IMPACTO EN COMPONENTES DEL SISTEMA

| Componente | Mecanismo de Acceso | Impacto / Validación |
| :--- | :--- | :--- |
| **Edge Function `terminal-sync`** | `adminClient` con clave `service_role` | **100% Operativo.** Conserva `GRANT ALL` y política RLS `USING (true) WITH CHECK (true)`. Ingesta masiva inalterada. |
| **Panel Admin (`panel-admin`)** | Token JWT de sesión autenticada en `admin_users` | **100% Operativo.** Cumple `public.is_active_admin() = true`, leyendo tanto eventos crudos como las vistas agregadas `v_campaign_totals`. |
| **POS Offline / Simple ProX** | Envío de eventos vía HTTP POST hacia `/functions/v1/terminal-sync` | **100% Operativo.** El POS nunca realiza escrituras SQL directas en `campaign_events`; toda la ingesta viaja autenticada por la Edge Function. |
| **Usuarios Autenticados Comunes** | Token JWT sin registro activo en `admin_users` | **Bloqueados.** RLS retorna 0 filas en consultas `SELECT` y PostgREST retorna `42501 (Permission Denied)` ante cualquier intento de `INSERT`, `UPDATE` o `DELETE`. |
| **Usuarios Anónimos (`anon`)** | Sin autenticación | **Bloqueados.** Rechazados inmediatamente a nivel de motor SQL con error `42501 (Permission Denied)`. |

---

## 4. RESULTADOS DE PRUEBAS EXPERIMENTALES (POSTGRESQL 17 AISLADO)

Se desarrollaron dos baterías de pruebas automatizadas sobre el contenedor Docker local `pg_isolated_fase3b`:

### A. Matriz de Seguridad 4x4 (`tests/fase4b01_rls_compatibility_runner.mjs`)
Se recreó el esquema histórico exacto de Supabase con los permisos y políticas heredadas, demostrando primero la vulnerabilidad previa y luego validando la corrección:

| Rol Evaluado | Operación SELECT | Operación INSERT | Operación UPDATE | Operación DELETE |
| :--- | :---: | :---: | :---: | :---: |
| **`anon`** | **PASS** (42501 Denied) | **PASS** (42501 Denied) | **PASS** (42501 Denied) | **PASS** (42501 Denied) |
| **`authenticated` (No Admin)** | **PASS** (RLS = 0 filas) | **PASS** (42501 Denied) | **PASS** (42501 Denied) | **PASS** (42501 Denied) |
| **`authenticated` (Admin Activo)** | **PASS** (Filas visibles) | **PASS** (42501 Inmutable) | **PASS** (42501 Inmutable) | **PASS** (42501 Inmutable) |
| **`service_role`** | **PASS** (Acceso Total) | **PASS** (Ingesta permitida) | **PASS** (Consolidación) | **PASS** (Purga rotativa) |

- **Vulnerabilidad histórica comprobada:** Bajo las políticas antiguas, el usuario no-admin podía alterar registros (`UPDATE`). Tras la migración, la operación arrojó error `42501`.
- **Eliminación de solapamiento por OR:** Verificado que `campaign_events_select_auth`, `campaign_events_update_auth` y `campaign_events_delete_auth` ya no existen en `pg_policy`.
- **Acceso del Panel Administrativo:** Verificado que el administrador activo consulta satisfactoriamente `v_campaign_combined_metrics` y `v_campaign_totals`.

### B. Suite Integral de Regresión (`tests/fase4a_migrations_runner.mjs`)
Se reejecutó la suite completa de 18 pruebas (DDL, Idempotencia, Backfill de 10k eventos, Conciliación 4D, Advisory Locks, Purga Dry-Run, Purga Real, Auditoría Ledger, Permisos y Rollback):
- **Resultado:** **18/18 PRUEBAS APROBADAS (100% PASS)**.
- **Cero regresiones** detectadas en la lógica matemática o en la reversibilidad del sistema.

---

## 5. ARCHIVOS MODIFICADOS EN EL REPOSITORIO

1. `supabase/migrations/20261106_campaign_statistics_aggregates.sql`:
   - Incorporada revocación SQL `REVOKE ALL ON TABLE public.campaign_events FROM PUBLIC, anon;`.
   - Incorporada revocación `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.campaign_events FROM authenticated;`.
   - Incorporadas cláusulas `DROP POLICY IF EXISTS` para las tres políticas heredadas (`select_auth`, `update_auth`, `delete_auth`).
2. `supabase/manual-scripts/20261106_campaign_statistics_aggregates_ROLLBACK.sql`:
   - Añadida sección comentada con el procedimiento explícito para restaurar el esquema heredado si el operador lo requiriese.
3. `tests/fase4b01_rls_compatibility_runner.mjs`:
   - Suite de prueba de la matriz 4x4 y reproducción de estado histórico.
4. `tests/fase4b01_rls_evidence.json`:
   - Evidencia cruda generada por la suite de seguridad RLS.
5. `docs/fase4b01_compatibilidad_rls.md`:
   - El presente informe técnico.

---

## 6. RIESGOS RESIDUALES EVALUADOS

1. **Riesgo de Bloqueo a la Ingesta de Eventos:**
   - *Evaluación:* **NULO.** La ingesta se realiza exclusivamente a través de la Edge Function `terminal-sync`, la cual utiliza `service_role`. `service_role` mantiene privilegios totales e irrestrictos tanto a nivel SQL como a nivel de política RLS (`USING (true) WITH CHECK (true)`).
2. **Riesgo de Pérdida de Acceso en el Panel Administrativo:**
   - *Evaluación:* **NULO.** El panel administrativo envía el token JWT del usuario que inicia sesión. Dado que dicho usuario está registrado como activo en `public.admin_users`, la función `public.is_active_admin()` retorna `true`, otorgando acceso inmediato de lectura.
3. **Riesgo en Reversión (Rollback):**
   - *Evaluación:* **BAJO / CONTROLADO.** Si se ejecuta el rollback del Escenario A, los eventos crudos permanecen 100% intactos en `campaign_events`. El script de rollback incluye las sentencias comentadas para restaurar el esquema heredado en caso necesario.

---

## 7. CONFIRMACIÓN DE ESTADO Y DICTAMEN

- **Supabase Comercial (`qtixbiikhvhzwshfgyeo`):** **100% INTACTO.** Cero ejecuciones de SQL, migraciones, escrituras o purgas en producción.
- **Dictamen:** **LISTO PARA FASE 4B CON BLINDAJE RLS PREVENTIVO APROBADO.**

