# SIMPLE PROX v1.3.10 — FASE 4B.4
## CORRECCIÓN QUIRÚRGICA DE TIPOS UUID Y VALIDACIÓN MATEMÁTICA DEFINITIVA SOBRE EL BACKUP COMERCIAL REAL

**Fecha:** 2026-11-09  
**Proyecto:** Simple ProX v1.3.10  
**Archivo de Backup Evaluado:** `backups/supabase_backup_20261109_215247.dump` (1.057.466 bytes)  
**SHA-256:** `F023A5B00D3BFFAC4DAC1FA212B4D91BE7C5993D7665738F35A3B2EAF1DFAFC3`  
**Entorno de Validación:** PostgreSQL 17.11 en contenedor Docker aislado (`pg_isolated_fase3b`)  
**Base de Datos Productiva Supabase:** **100% INTACTA (CERO CONEXIONES, CERO ESCRITURAS PRODUCTIVAS)**  
**Dictamen Oficial:** **GO (APTO PARA PREPARAR EL DESPLIEGUE CONTROLADO EN SUPABASE)**

---

## 1. RESUMEN EJECUTIVO

En cumplimiento de las instrucciones de la FASE 4B.4 bajo estricto **MODO CAMBIO QUIRÚRGICO**, se corrigieron las incompatibilidades de tipos de datos detectadas durante la Fase 4B.3 entre las migraciones y el esquema comercial real de producción.

1. **Corrección Quirúrgica de Tipos:**
   - En `supabase/migrations/20261106_campaign_statistics_aggregates.sql`:
     - Se ajustó `campaign_daily_aggregates.campaign_id` de `text` a **`uuid`**.
     - Se ajustó `purge_ledger.campaign_id` de `text` a **`uuid`**.
     - La vista `v_campaign_combined_metrics` compila ahora un `UNION ALL` homogéneo entre dos columnas `uuid` (`cda.campaign_id` y `ce.campaign_id`).
   - En `supabase/migrations/20261106_campaign_statistics_functions.sql`:
     - En `consolidate_campaign_events_batch`: se ajustó la variable de lote `v_batch_ids` de `bigint[]` a **`uuid[]`**, compatibilizándola con la clave primaria `campaign_events.id uuid`.
     - En `reconcile_campaign_metrics_4d`: se ajustó el parámetro de filtrado `p_campaign_id` de `text` a **`uuid`**.
2. **Revisión de Continuidad Numérica:**
   - Se confirmó que no existe ninguna función que dependa de secuencias numéricas consecutivas sobre los eventos (la supuesta función `get_campaign_event_continuity_status` no forma parte de las migraciones). La integridad temporal se rige estrictamente por `(timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.
3. **Validación Exhaustiva con 9.787 Eventos Reales:**
   - Se ejecutó la suite `tests/fase4b4_commercial_consolidation_runner.mjs` en una base efímera Docker.
   - **Resultado:** **10/10 CHECKS APROBADOS (100% PASS)** con conciliación matemática estricta por `FULL OUTER JOIN` (cero discrepancias).

---

## 2. DETALLE DE ARCHIVOS Y LÍNEAS MODIFICADAS

### A. `supabase/migrations/20261106_campaign_statistics_aggregates.sql`
* **Línea 34:**
  - *Antes:* `campaign_id text NOT NULL,`
  - *Ahora:* `campaign_id uuid NOT NULL,`
* **Línea 65:**
  - *Antes:* `campaign_id text NOT NULL,`
  - *Ahora:* `campaign_id uuid NOT NULL,`

### B. `supabase/migrations/20261106_campaign_statistics_functions.sql`
* **Línea 28:**
  - *Antes:* `v_batch_ids bigint[];`
  - *Ahora:* `v_batch_ids uuid[];`
* **Línea 127:**
  - *Antes:* `p_campaign_id text DEFAULT NULL`
  - *Ahora:* `p_campaign_id uuid DEFAULT NULL`

---

## 3. LÍNEA BASE REAL Y CONTEOS ANTES Y DESPUÉS

Al auditar los 9.787 eventos comerciales reales descargados en el backup, se identificó la taxonomía auténtica de eventos emitidos por Simple ProX:

| Tipo de Evento (`event_type`) | Conteos Línea Base (Pre-Migración) | Conteos en Agregados (Post-Backfill) | Estado de Conservación |
|---|:---:|:---:|:---:|
| `impression` | **9.544** | **9.544** | **100% CONSERVADO (0 pérdida)** |
| `offer_open` | **149** | **149** | **100% CONSERVADO (0 pérdida)** |
| `whatsapp_click` | **94** | **94** | **100% CONSERVADO (0 pérdida)** |
| **TOTAL** | **9.787** | **9.787** | **100% EQUIVALENCIA EXACTA** |

- **Eventos con `campaign_id IS NULL`:** **0** (todos los eventos comerciales tienen campaña asociada).
- **Eventos eliminados durante el backfill:** **0** (todos los 9.787 eventos crudos permanecen intactos en `campaign_events`).
- **Estado de consolidación:** 9.787 eventos con `aggregated_at IS NOT NULL`, 0 pendientes.

---

## 4. RESULTADO DE LA CONCILIACIÓN MATEMÁTICA (FULL OUTER JOIN)

Se ejecutó la consulta de conciliación por clave 4D (`campaign_id`, `event_date`, `merchant_id`, `event_type`):

```sql
WITH raw AS (
  SELECT campaign_id, (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS event_date, event_type, merchant_id, count(*)::bigint AS raw_count
  FROM public.campaign_events WHERE campaign_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
agg AS (
  SELECT campaign_id, event_date, event_type, merchant_id, event_count::bigint AS agg_count
  FROM public.campaign_daily_aggregates
)
SELECT ...
FROM raw FULL OUTER JOIN agg ON (...)
WHERE raw.raw_count IS NULL OR agg.agg_count IS NULL OR raw.raw_count != agg.agg_count;
```

### Resultados de la Conciliación:
- **Grupos/Particiones verificadas:** **47 particiones 4D**.
- **Particiones con discrepancia:** **0**.
- **Grupos faltantes en agregados (`MISSING_IN_AGG`):** **0**.
- **Grupos huérfanos en agregados (`MISSING_IN_RAW`):** **0**.
- **Diferencias de conteo (`COUNT_MISMATCH`):** **0**.
- **Vistas Unificadas (`v_campaign_totals`):** Coincidencia bit a bit con los totales de la base cruda.

---

## 5. MATRIZ DE PRUEBAS EJECUTADAS (10/10 PASS)

| Paso | Prueba Verificada | Resultado | Evidencia Técnica |
|---|---|:---:|---|
| **1** | Conservación de eventos tras aplicar DDL | **PASS** | 9.787 eventos presentes tras `CREATE TABLE` e índices. |
| **2** | Backfill de 9.787 eventos en 1 solo lote | **PASS** | `processed: 9787`, `duration_ms: 228`, 0 pendientes. |
| **3** | Total de impresiones conservado | **PASS** | 9.544 impresiones en agregados == 9.544 crudas. |
| **4** | Total de clics y aperturas conservado | **PASS** | 149 aperturas + 94 clics WhatsApp == 243 interacciones. |
| **5** | Conciliación 4D FULL OUTER JOIN | **PASS** | 0 discrepancias sobre 47 particiones (Suma: 9.787). |
| **6** | Idempotencia en ejecución repetida | **PASS** | Segunda corrida: `processed: 0`, total en agregados = 9.787. |
| **7** | Comprobación de `campaign_id NULL` | **PASS** | Cero registros anómalos detectados en el backup real. |
| **8** | Eventos tardíos y vistas unificadas | **PASS** | Evento tardío insertado computa en vista y consolida sin duplicar. |
| **9** | Compatibilidad con cuotas diarias | **PASS** | `v_campaign_daily_quotas` operativa y sin conflictos. |
| **10** | Integridad de Índices, RLS y Políticas | **PASS** | RLS activo en las 4 tablas, permisos mínimos concedidos. |

*Regresiones de seguridad y backup:*  
- `tests/fase4b05_adversarial_backup_runner.mjs`: **16/16 PASS (100%)**.  
- `tests/fase4b03_backup_runner.mjs`: **4/4 PASS (100%)**.

---

## 6. DOCUMENTACIÓN DE RIESGOS RESIDUALES PENDIENTES ANTES DE LA PURGA

> [!WARNING]
> **ESTADO DE LA PURGA: DESACTIVADA POR DEFECTO (`dry_run = true`).**  
> Las migraciones NO ejecutan ninguna purga ni borran registros comerciales. Los siguientes 4 riesgos deben ser considerados antes de activar purgas futuras:

1. **Reenvío de Eventos Purgados por Terminales Desconectadas:**
   - *Escenario:* Un comercio offline por más de 30 días reenvía eventos que ya fueron agregados y posteriormente eliminados del buffer crudo.
   - *Riesgo:* Al no existir en el buffer, el `ON CONFLICT (event_id) DO NOTHING` de la ingesta no los frenará, provocando una doble consolidación histórica.
   - *Mitigación Requerida para Fase 5:* Implementar un filtro en la Edge Function `terminal-sync` o una tabla histórica de tombstones (`event_id` purgados) antes de habilitar purgas reales.
2. **Eventos Tardíos (Arrival Skew):**
   - *Escenario:* Eventos legítimos con timestamp de hace 40 días que llegan cuando su fecha ya fue purgada.
   - *Comportamiento:* Se agregan en la fecha retroactiva correcta, pero alteran la ecuación de reconciliación respecto al `purge_ledger` cerrado.
3. **Crecimiento de Almacenamiento en Plan Free:**
   - *Diagnóstico Real:* Los 9.787 eventos comerciales ocupan 2,7 MB. El buffer crudo puede crecer de forma segura hasta ~500.000 eventos antes de rozar los 300 MB del límite de 500 MB de Supabase Free. No hay urgencia inmediata de purga durante el lanzamiento inicial.
4. **Concurrencia entre Ingesta y Consolidación:**
   - *Protección Implementada:* `FOR UPDATE SKIP LOCKED` y Advisory Locks transaccionales aíslan completamente el procesamiento por lotes frente a la ingesta continua de terminales.

---

## 7. DICTAMEN FINAL

> **DICTAMEN OFICIAL FASE 4B.4:**  
> **GO (APTO PARA PREPARAR EL DESPLIEGUE CONTROLADO EN SUPABASE)**  
>
> 1. Las incompatibilidades de tipos `uuid` han sido subsanadas con precisión quirúrgica.
> 2. Se ha demostrado empíricamente que las migraciones compilan con código 0 y consolidan los **9.787 eventos comerciales reales con cero pérdidas y cero duplicaciones**.
> 3. La base comercial de Supabase permanece **100% intacta**.
>
> **PRÓXIMO PASO:** Proceder a la FASE 4B.5 (Plan de Despliegue Supervisado en Supabase Comercial).

