# SIMPLE PROX v1.3.10 — FASE 4B.3
## INFORME DE VALIDACIÓN AISLADA DE MIGRACIONES SOBRE EL BACKUP COMERCIAL REAL
### DETECCIÓN DE INCOMPATIBILIDAD DE TIPOS (UUID vs TEXT / BIGINT) Y PROTOCOLO DE PARADA

**Fecha:** 2026-11-09  
**Proyecto:** Simple ProX v1.3.10  
**Archivo de Backup Evaluado:** `backups/supabase_backup_20261109_215247.dump` (1.057.466 bytes)  
**SHA-256:** `F023A5B00D3BFFAC4DAC1FA212B4D91BE7C5993D7665738F35A3B2EAF1DFAFC3`  
**Entorno de Validación:** PostgreSQL 17.11 en contenedor Docker aislado (`pg_isolated_fase3b`)  
**Base de Datos Comercial Supabase:** **100% INTACTA (CERO CONEXIONES, CERO MIGRACIONES)**  
**Dictamen Oficial:** **STOP / NO-GO PARA MIGRACIÓN PRODUCTIVA — INCOMPATIBILIDAD DETECTADA EN MODO SEGURO**

---

## 1. RESUMEN EJECUTIVO Y APLICACIÓN DE LA REGLA DE STOP

En cumplimiento de las instrucciones de la FASE 4B.3 y de las directivas maestras de `AGENTS.md` (Reglas 1, 6, 40 "Regla de STOP — Detenerse antes de hacer daño" y Requisito Operativo 6: *"Si se detecta una incompatibilidad, detenerse e informar. No modificar automáticamente las migraciones"*):

1. **Restauración en Entorno Aislado:** El backup comercial `supabase_backup_20261109_215247.dump` fue restaurado exitosamente al 100% (exit code 0) en una base de datos efímera (`tmp_fase4b3_commercial_val`), verificando los **9.787 eventos comerciales originales**.
2. **Detección Previa de Incompatibilidad Crítica:** Al intentar aplicar la migración DDL `20261106_campaign_statistics_aggregates.sql` sobre el esquema comercial restaurado, PostgreSQL abortó la transacción con el siguiente error:
   ```text
   ERROR: UNION types text and uuid cannot be matched
   LINE 21: ce.campaign_id,
   ```
3. **Causa Raíz:** Discrepancia fundamental de tipos de datos entre el esquema sintético de laboratorio (`test_db`) y el esquema comercial real de producción:
   - En la base comercial real, `campaign_events.campaign_id` y `campaigns.id` son de tipo **`UUID`** (y `campaign_events.id` es **`UUID`**).
   - En las migraciones redactadas en Fases 3 y 4A, se asumió erróneamente que `campaign_id` era **`TEXT`** y que `id` era **`BIGINT`**.
4. **Activación de la Regla de Parada:** En cumplimiento estricto de la directiva *"No modificar automáticamente las migraciones"*, **el proceso se detuvo de inmediato sin tocar ningún archivo SQL productivo**, preservando la integridad de producción al 100%.

---

## 2. RESULTADO DE RESTAURACIÓN Y LÍNEA BASE COMERCIAL

El backup comercial fue restaurado íntegramente en la base temporal con los siguientes resultados:
- **Código de salida de `pg_restore`:** `0`.
- **Total de eventos recuperados en `campaign_events`:** **9.787 registros**.
- **Distribución de eventos comerciales reales por tipo:**
  - `impression`: **8.790** eventos.
  - `click`: **997** eventos.
  - **Suma Total:** **9.787** eventos.
- **Dimensiones activas en el histórico:**
  - Campañas distintas (`campaign_id` UUID): **13**.
  - Comercios distintos (`merchant_id` text): **3**.
  - Fechas distintas (`event_date`): **12**.

---

## 3. AUDITORÍA DETALLADA DE LAS INCOMPATIBILIDADES DETECTADAS

### Incompatibilidad 1 (CRÍTICA DDL): `campaign_id` (UUID vs TEXT)
* **Definición Real en Producción (`campaign_events` y `campaigns`):**
  ```sql
  CREATE TABLE public.campaign_events (
      id uuid DEFAULT gen_random_uuid() NOT NULL,
      event_id text,
      merchant_id text NOT NULL,
      campaign_id uuid, -- << TIPO REAL: UUID
      event_type text NOT NULL,
      "timestamp" timestamp with time zone DEFAULT now(),
      synced_at timestamp with time zone DEFAULT now()
  );
  ```
* **Definición Errónea en Migración DDL (`20261106_campaign_statistics_aggregates.sql`):**
  ```sql
  CREATE TABLE IF NOT EXISTS public.campaign_daily_aggregates (
      campaign_id text NOT NULL, -- << DEFINIDO COMO TEXT
      ...
  );

  CREATE TABLE IF NOT EXISTS public.purge_ledger (
      ...
      campaign_id text NOT NULL, -- << DEFINIDO COMO TEXT
      ...
  );
  ```
* **Impacto Inmediato:** Al crear la vista `public.v_campaign_combined_metrics`:
  ```sql
  SELECT cda.campaign_id, ... FROM campaign_daily_aggregates cda -- TEXT
  UNION ALL
  SELECT ce.campaign_id, ... FROM campaign_events ce -- UUID
  ```
  PostgreSQL rechaza el `UNION ALL` porque `text` y `uuid` no son compatibles de manera implícita. La transacción hace `ROLLBACK` y la migración fracasa.

---

### Incompatibilidad 2 (CRÍTICA PL/pgSQL): `campaign_events.id` (UUID vs BIGINT)
* **Definición Real en Producción:**
  `campaign_events.id` es de tipo **`UUID`** generado por `gen_random_uuid()`.
* **Definición Errónea en Funciones (`20261106_campaign_statistics_functions.sql`):**
  1. En `consolidate_campaign_events_batch`:
     ```sql
     DECLARE
         v_batch_ids bigint[]; -- << ASUME BIGINT
     ...
     WHERE ce.id = ANY(v_batch_ids); -- << FALLA: operator does not exist: uuid = bigint
     ```
  2. En `backfill_campaign_daily_aggregates`:
     ```sql
     DECLARE
         v_batch_ids bigint[]; -- << ASUME BIGINT
     ```
  3. En `purge_consolidated_campaign_events`:
     ```sql
     DECLARE
         v_purged_ids bigint[]; -- << ASUME BIGINT
     ```
  4. En `get_campaign_event_continuity_status`:
     ```sql
     min_event_id bigint,
     max_event_id bigint
     ```
* **Impacto Inmediato:** Si se ejecutara la función de consolidación sobre la tabla comercial, fallaría inmediatamente con error de operador incompatible `uuid = bigint`.

---

## 4. CONTEOS Y ESTADO DE CONCILIACIÓN

- **Conteos Pre-Migración:** **9.787 eventos** comerciales íntegros.
- **Conteos Post-Migración:** No se modificaron registros debido al aborto seguro de la transacción.
- **Conciliación FULL OUTER JOIN:** La prueba fue abortada en el Paso 6 por la falta de creación de las tablas de agregados (transacción revertida por PostgreSQL).
- **Preservación de Datos:** Ningún dato fue alterado. `test_db` permanece intacta con sus 50 eventos sintéticos. La base temporal fue destruida limpiamente.

---

## 5. DOCUMENTACIÓN DE RIESGOS RESIDUALES NO RESUELTOS

Tal como requiere el procedimiento técnico de la Fase 4B.3, se documentan los tres riesgos arquitectónicos latentes:

### 1. Reenvío Duplicado Después de una Purga (Edge Case de Outbox Desconectado)
* **Escenario:** Un comercio desconectado durante más de 30 días acumula eventos en su base SQLite local. Si en Supabase se ejecuta una purga de eventos anteriores a 30 días, el buffer crudo ya no contendrá los `event_id` correspondientes a ese período.
* **Riesgo:** Si el comercio se reconecta y reenvía los eventos que ya habían sido consolidados y purgados previamente, el `INSERT ON CONFLICT (event_id) DO NOTHING` no los detectará como duplicados (porque ya fueron borrados del buffer).
* **Mitigación Arquitectónica Pendiente:** Se debe definir si la purga requiere una tabla histórica de hashes de deduplicación (tombstones de `event_id`) o si se restringe el replay de terminales a la ventana viva de consolidación.

### 2. Eventos Tardíos (Arrival Skew)
* **Escenario:** Eventos que llegan con días o semanas de atraso debido a terminales desconectadas.
* **Comportamiento Actual:** El diseño actual agrupa por `(timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`, lo cual acumula correctamente en la fecha del evento (`event_date`) y no en la fecha de llegada.
* **Riesgo:** Si el evento tardío llega después de que su fecha ya fue purgada, el evento quedará en el buffer crudo pero los agregados históricos no podrán conciliarse contra el libro de purga sin un ajuste retroactivo.

### 3. Crecimiento del Almacenamiento en Plan Free de Supabase
* **Métricas Reales Obtenidas:** 9.787 eventos comerciales ocupan aproximadamente 1,5 MB de datos más 1,2 MB de índices (~2,7 MB en total).
* **Proyección:** A un ritmo de ~1.000 eventos diarios por cada 10 kioscos, el límite de 500 MB del Plan Free de Supabase se alcanzaría en aproximadamente 4 a 6 meses sin purga.
* **Conclusión:** La consolidación y purga son indispensables, pero **la corrección de tipos a `UUID` es un prerrequisito obligatorio antes de cualquier despliegue**.

---

## 6. MATRIZ DE PRUEBAS DE LA FASE 4B.3

| Control Evaluado | Resultado | Observación Técnica |
|---|:---:|---|
| Presencia e Integridad del Backup Comercial | **PASS** | Archivo `.dump` de 1.05 MB con SHA-256 verificado. |
| Restauración en Base Temporal Aislada | **PASS** | `pg_restore` código 0; 9.787 eventos recuperados. |
| Línea Base de Eventos Comerciales | **PASS** | 8.790 impresiones + 997 clics = 9.787 eventos. |
| Detección de Incompatibilidad DDL | **FAIL ESPERADO** | Aborto seguro: `UNION types text and uuid cannot be matched`. |
| Preservación de Producción Supabase | **PASS** | Cero conexiones a Supabase comercial; 100% intacta. |
| Preservación de `test_db` | **PASS** | 50 eventos sintéticos intactos. |
| Limpieza de Bases Temporales | **PASS** | `tmp_fase4b3_commercial_val` eliminada sin residuos. |

---

## 7. DICTAMEN FINAL Y PROPUESTA DE ACCIÓN

> **DICTAMEN OFICIAL FASE 4B.3:**  
> **STOP / NO-GO PARA MIGRACIÓN EN PRODUCCIÓN**  
>
> **MOTIVO:** Las migraciones SQL actuales contienen tipos incompatibles (`text` y `bigint`) con el esquema real de producción (`uuid`).  
> **GARANTÍA:** Ningún dato productivo fue alterado. El mecanismo de validación aislada cumplió exactamente su función protectora: **descubrir el fallo en Docker antes de que afectara a Supabase.**

### Próximo Paso Recomendado (Fase 4B.4):
Autorizar la corrección quirúrgica de las migraciones SQL:
1. Cambiar `campaign_id text` por `campaign_id uuid` en `campaign_daily_aggregates` y `purge_ledger`.
2. Cambiar `v_batch_ids bigint[]` por `v_batch_ids uuid[]` y tipos de ID en las funciones PL/pgSQL.
3. Re-ejecutar la suite completa de validación sobre el backup comercial en Docker aislado hasta lograr 100% PASS y conciliación matemática sin discrepancias.

