-- ==============================================================================
-- SIMPLE PROX — FASE 5D.10: CONSULTAS DE SOLO LECTURA PARA AUDITORÍA POST-VINCULACIÓN
-- Archivo: tests/sql/verificar_vinculacion_fase5d10.sql
-- Modo: ESTRICTAMENTE SOLO LECTURA (CERO ESCRITURAS)
-- ==============================================================================

-- 1. Cantidad de campañas vinculadas por distribuidor
SELECT 
  d.id AS distributor_id,
  d.name AS distributor_name,
  d.category,
  d.record_type,
  count(c.id) AS active_campaigns_count
FROM public.distributors d
LEFT JOIN public.campaigns c ON c.distributor_id = d.id AND c.status = 'active'
GROUP BY d.id, d.name, d.category, d.record_type
ORDER BY active_campaigns_count DESC, d.name ASC;

-- 2. Verificación de correspondencia exacta entre supplier_name y distributor_name
SELECT 
  c.id AS campaign_id,
  c.title AS campaign_title,
  c.supplier_name,
  c.distributor_id,
  d.name AS distributor_name,
  CASE 
    WHEN c.supplier_name = d.name THEN '✅ EXACTA'
    ELSE '❌ DISCREPANCIA'
  END AS status_coincidencia
FROM public.campaigns c
INNER JOIN public.distributors d ON d.id = c.distributor_id
WHERE c.status = 'active'
ORDER BY d.name, c.title;

-- 3. Confirmar que Mayorista Andino QA tiene CERO campañas
SELECT 
  d.id,
  d.name,
  d.category,
  count(c.id) AS campaigns_associated
FROM public.distributors d
LEFT JOIN public.campaigns c ON c.distributor_id = d.id
WHERE d.id = 'dist-1793748205220' OR d.category = 'QA_TEST'
GROUP BY d.id, d.name, d.category;

-- 4. Confirmar que contratos, cuotas y pagos permanecen intactos
SELECT 'distributor_contracts' AS tabla, count(*) AS total_registros FROM public.distributor_contracts
UNION ALL
SELECT 'distributor_invoices' AS tabla, count(*) AS total_registros FROM public.distributor_invoices
UNION ALL
SELECT 'distributor_payments' AS tabla, count(*) AS total_registros FROM public.distributor_payments;

