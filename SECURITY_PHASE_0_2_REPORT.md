# KioscoProX / Simple ProX — Informe de Seguridad Fase 0.2
## Identidad Segura de Terminal y Protección de Supabase

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2-terminal-identity`  
**Commit de Respaldo Previo (Fase 0.1):** `772c9b4`  
**Punto de Restauración Fase 0:** `8e9c85b`  
**Punto de Restauración Pre-Fase 0:** `2605667`

---

## 1. Clasificación del Estado de Seguridad

### CORREGIDO

#### 1. Eliminación de Confianza en Anon Key para Modificación de Comercios (`merchants`)
* **Estado:** Corregido.
* **Detalle:** Se revocaron las políticas públicas permisivas de PostgREST `merchants_insert_public` y `merchants_update_public`. Los usuarios anónimos que posean la clave pública `anon key` ya no pueden crear comercios arbitrarios ni emitir peticiones `PATCH` sobre registros de otros comercios. Todas las operaciones de registro y heartbeat se canalizan a través de la Edge Function `terminal-sync`, la cual exige autenticación mediante token de terminal y restringe las mutaciones al `installation_id` verificado.

#### 2. Atribución Forzada de Métricas de Campaña (`campaign_events`)
* **Estado:** Corregido.
* **Detalle:** Se revocó la política `campaign_events_insert_public` en PostgREST. La inserción de eventos de campaña ahora se realiza exclusivamente a través de la ruta `/events` de la Edge Function `terminal-sync`. El servidor fuerza que `merchant_id` sea exactamente el `installation_id` de la terminal autenticada, imposibilitando que una terminal o atacante fabrique eventos a nombre de otro comercio. Adicionalmente, se valida que `event_type IN ('impression', 'offer_open', 'whatsapp_click')` y se descartan tipos no autorizados.

#### 3. Identidad Criptográfica Individual por Terminal (Sin Secretos Globales)
* **Estado:** Corregido.
* **Detalle:** Cada terminal genera y recibe un token criptográfico individual de 256 bits (`spx_term_...`), cuyo hash SHA-256 se almacena de forma privada e irreversible en la tabla `terminal_identities`. No existen secretos compartidos globales (`TERMINAL_SECRET`) ni se expuso la clave `service_role` en el cliente.

#### 4. Almacenamiento Seguro del Token con Windows DPAPI
* **Estado:** Corregido.
* **Detalle:** En Electron, el token de terminal se cifra utilizando el servicio nativo de protección de datos del sistema operativo (**Windows DPAPI** a través de `safeStorage` de Electron) antes de persistirse en disco (`kioscoprox_terminal_cred_enc`).

---

### PARCIALMENTE MITIGADO

#### 1. Rate Limiting de Métricas en Edge Function
* **Estado:** Parcialmente Mitigado.
* **Detalle:** La Edge Function impone un límite defensivo de hasta 50 eventos por lote y procesa únicamente tipos de eventos válidos. Sin embargo, no se implementó aún un almacén distribuido tipo Redis para conteo por ventana temporal de milisegundos, para evitar costos y complejidad de infraestructura en esta fase.

---

### RIESGO RESIDUAL

> [!NOTE]
> Conforme al principio de transparencia de AGENTS.md, se detallan los riesgos residuales controlados que permanecen:

#### 1. RIESGO RESIDUAL: Enrolamiento Inicial de Terminales Existentes (Ventana de Primer Contacto)
* **Vía Residual:** Para permitir que los comercios ya instalados en el campo migren de manera transparente y sin interrumpir sus ventas ni exigirles reactivación, el endpoint `/enroll` permite el enrolamiento inicial de cualquier `installation_id` que ya figure previamente en la tabla `merchants` y no posea aún un token registrado.
* **Mitigación Implementada:** El enrolamiento es estrictamente de una sola vez ("First-Claim"): en el instante en que la terminal legítima se conecta por primera vez, la identidad queda registrada y bloqueada permanentemente. A partir de ese momento, cualquier intento posterior de re-enrolar ese `installation_id` es rechazado con error HTTP 409.

#### 2. RIESGO RESIDUAL: Restricción UNIQUE en `event_id` Postergada por Datos Históricos
* **Vía Residual:** La base de datos de producción aún contiene duplicados históricos generados en versiones anteriores a Fase 0.
* **Mitigación Implementada:** Conforme a la regla de no destruir métricas históricas, la Edge Function genera IDs de evento únicos por lote y el Outbox cliente deduplica localmente. La restricción `UNIQUE (event_id)` en PostgreSQL se aplicará formalmente en una fase dedicada de saneamiento de datos.

---

### POSTERGADO (Fuera de Alcance de Fase 0.2)

1. **Firmas Asimétricas (Ed25519) para Licencias PRO:** Programado para Fase 1 (no se alteró el algoritmo actual de licencias).
2. **Cifrado de Base de Datos Local Completa (SQLite / SQLCipher):** Programado para Fase 2.
3. **Firma Authenticode en Binarios Windows:** Programado para CI/CD y empaquetado.
4. **Content Security Policy (CSP):** Programado para Fase 2.

---

## 2. Resumen Técnico de la Intervención

```text
Rama utilizada:            security/phase-0.2-terminal-identity
Commit backup previo:      772c9b4 (backup: estado previo a security phase 0.2)
Punto de restauración:     8e9c85b (Fase 0) / 2605667 (Pre-Fase 0)
Archivos modificados:      electron/main.js, electron/preload.cjs, electron/preload.js,
                           src/services/syncService.js, src/services/adSyncEngine.js
Archivos nuevos:           src/services/terminalIdentityService.js,
                           SECURITY_PHASE_0_2_ARCHITECTURE.md,
                           SECURITY_PHASE_0_2_SUPABASE.sql,
                           SECURITY_PHASE_0_2_SUPABASE_BEFORE.sql,
                           SECURITY_PHASE_0_2_SUPABASE_AFTER.sql,
                           SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql
Edge Functions creadas:    terminal-sync (v1, ACTIVE, verify_jwt: false)
Tablas creadas:            public.terminal_identities (RLS habilitada, 100% privada)
Políticas RLS revocadas:   merchants_insert_public, merchants_update_public,
                           campaign_events_insert_public
Secrets servidor usados:   SUPABASE_SERVICE_ROLE_KEY (inyección nativa interna de Supabase)
Pruebas ejecutadas:        11 pruebas de seguridad y compatibilidad automatizadas
Pruebas fallidas:          0
```

---

## 3. Matriz de Pruebas de Seguridad Ejecutadas

| Test | Escenario Probado | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **TEST 1** | Enrolamiento Terminal A | Emisión de Token de 256 bits | Token emitido y persistido | **PASS** |
| **TEST 2** | Enrolamiento Terminal B | Emisión de Token independiente | Token independiente emitido | **PASS** |
| **TEST A** | Terminal A envía Heartbeat como A | Aceptado y actualizado | HTTP 200 `{ updated: true }` | **PASS** |
| **TEST B** | Terminal A intenta Heartbeat como B con token de A | Rechazo de autenticación | HTTP 401 `{ error: 'Credencial...' }` | **PASS** |
| **TEST C** | Anon key intenta PATCH directo a `merchants` | Denegado por RLS | HTTP 204 con 0 filas modificadas | **PASS** |
| **TEST D** | Anon key intenta POST directo a `merchants` | Denegado por RLS | HTTP 401 RLS Policy Violation | **PASS** |
| **TEST E** | Terminal autenticada registra/actualiza comercio | Permitido para su propio ID | HTTP 200 `{ success: true }` | **PASS** |
| **TEST F** | Terminal A envía eventos de campaña para sí misma | Inserción con `merchant_id = termA` | HTTP 200 `{ processedCount: 1 }` | **PASS** |
| **TEST G** | Terminal A intenta enviar evento atribuido a Terminal B | Servidor fuerza `merchant_id = termA` | Atribución forzada a Terminal A | **PASS** |
| **TEST H** | Anon key intenta POST directo a `campaign_events` | Denegado por RLS | HTTP 401 RLS Policy Violation | **PASS** |
| **TEST I** | Envío de evento con `event_type` inválido (`HACK_CLICK`) | Descartado por allowlist | 0 eventos procesados | **PASS** |
| **TEST J** | Token inválido presentado | Rechazo de autenticación | HTTP 401 | **PASS** |
| **TEST K** | Petición sin credenciales de terminal | Rechazo de autenticación | HTTP 401 | **PASS** |

---

## 4. Pruebas de Regresión del POS y Compatibilidad

1. **Preservación de Identidad:** `installationId`, `merchantId` y `commerceId` existentes no fueron alterados ni regenerados.
2. **Licenciamiento PRO:** `calculateLicenseKey()` y `isValidLicenseKey()` se mantienen intactos.
3. **Flujo Offline-First:** Las ventas, stock y caja operan sin conexión; las operaciones de red se encolan en el Outbox y se procesan automáticamente al recuperar conectividad.
4. **Panel Administrador:** La sesión de Supabase Auth se mantiene intacta; la consulta de comercios y campañas desde el panel continúa funcionando normalmente mediante `merchants_select_auth` y `campaign_events_select_auth`.
5. **Build de Producción:** `npm run build` ejecutado exitosamente con 0 errores (Vite v7.3.1 en 6.66s).

---

## 5. Instrucciones de Rollback

### Rollback de Código Cliente:
```bash
git checkout security/phase-0.1-fixes
# O forzado al estado exacto previo:
git reset --hard 772c9b4
```

### Rollback de Supabase:
Ejecutar en el SQL Editor de Supabase el archivo [`SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql`](file:///c:/Users/Pininas/KioscoProX/SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql):
```sql
-- 1. Restaurar inserción anónima pública en merchants
DROP POLICY IF EXISTS "merchants_insert_public" ON public.merchants;
CREATE POLICY "merchants_insert_public" ON public.merchants
FOR INSERT TO public WITH CHECK (true);

-- 2. Restaurar actualización anónima pública en merchants
DROP POLICY IF EXISTS "merchants_update_public" ON public.merchants;
CREATE POLICY "merchants_update_public" ON public.merchants
FOR UPDATE TO public USING (true) WITH CHECK (true);

-- 3. Restaurar inserción pública en campaign_events
DROP POLICY IF EXISTS "campaign_events_insert_public" ON public.campaign_events;
CREATE POLICY "campaign_events_insert_public" ON public.campaign_events
FOR INSERT TO public WITH CHECK (
  (event_type = ANY (ARRAY['impression'::text, 'offer_open'::text, 'whatsapp_click'::text]))
  AND (merchant_id IS NOT NULL)
  AND (length(merchant_id) > 0)
);
```

### Rollback Total a Pre-Fase 0:
```bash
git reset --hard 2605667
```
