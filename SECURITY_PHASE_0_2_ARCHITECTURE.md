# KioscoProX / Simple ProX — Arquitectura de Seguridad Fase 0.2
## Identidad Segura de Terminal y Protección de Supabase

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2-terminal-identity`  
**Commit de Respaldo Previo:** `772c9b4`  
**Punto de Restauración Fase 0:** `8e9c85b`  
**Punto de Restauración Pre-Fase 0:** `2605667`

---

## 1. Diagnóstico y Flujo Actual

### 1.1 Flujo Actual del POS y Sincronización
Actualmente, las terminales de venta distribuidas operan en un esquema Offline-First donde los eventos y registros se guardan localmente y se despachan periódicamente a través de [`syncService.js`](file:///c:/Users/Pininas/KioscoProX/src/services/syncService.js) y [`adSyncEngine.js`](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js):

```text
[ POS / Caja / Ventas ]
         ↓ (eventos locales)
   [ Outbox Local ] (localStorage)
         ↓ (flush con conexión)
 [ Supabase PostgREST ] (con clave pública anon_key)
   ├── POST /rest/v1/merchants (Upsert con resolución=merge-duplicates)
   ├── PATCH /rest/v1/merchants?id=eq.X
   └── POST /rest/v1/campaign_events (Lote de métricas publicitarias)
```

### 1.2 Riesgos Identificados

#### Riesgo A — `merchants` (Falsificación y Manipulación Multi-Tenant)
* **Condición Actual:** La tabla `merchants` tiene políticas RLS públicas para `INSERT` y `UPDATE` (`WITH CHECK (true)` y `USING (true)`).
* **Vectores de Ataque:**
  1. Un atacante con la `anon_key` pública puede emitir peticiones `PATCH` modificando nombres, teléfonos, planes o datos de otros comercios cambiando el parámetro de consulta `id=eq.<installationId_de_otro>`.
  2. Puede saturar la base de datos con comercios ficticios mediante peticiones `POST`.
  3. Puede manipular el estado o fecha de heartbeat de terminales arbitrarias.

#### Riesgo B — `campaign_events` (Fraude de Métricas no Atribuibles)
* **Condición Actual:** La RLS valida que `event_type IN ('impression', 'offer_open', 'whatsapp_click')` y que `merchant_id IS NOT NULL`.
* **Vectores de Ataque:**
  1. Cualquier usuario con la `anon_key` puede fabricar millones de eventos de `whatsapp_click` o `impression` atribuidos a cualquier comercio o campaña, alterando las estadísticas de facturación y efectividad B2B.
  2. No existe validación de que el `merchant_id` provisto pertenezca a la terminal que emite la petición.

---

## 2. Flujo Propuesto: Arquitectura de Identidad de Terminal

Para desacoplar la confianza del cliente y eliminar el acceso directo anónimo a PostgREST sin romper el funcionamiento offline, se establece una capa de intermediación segura con identidad criptográfica individual por terminal.

```text
                               ┌────────────────────────────────────────────────────────┐
                               │                    SUPABASE CLOUD                      │
                               │                                                        │
[ Terminal POS ]               │   [ Edge Function: terminal-sync ]                     │
  ├── installationId           │     ├── 1. Valida x-terminal-id + x-terminal-token     │
  └── terminalToken (DPAPI) ───┼───► │   2. Consulta tabla privada terminal_identities  │
                               │     ├── 3. Enrolamiento / Heartbeat / Events           │
                               │     └── 4. Opera contra DB con privilegios controlados │
                               │                                                        │
                               │   [ Base de Datos PostgreSQL ]                         │
                               │     ├── public.terminal_identities (RLS: Privada)      │
                               │     ├── public.merchants (RLS: Solo Edge/Auth)         │
                               │     └── public.campaign_events (RLS: Solo Edge/Auth)   │
                               └────────────────────────────────────────────────────────┘
```

### 2.1 Componentes de la Solución

1. **Tabla de Identidades de Terminal (`public.terminal_identities`):**
   - Almacena la relación entre `installation_id` y el hash criptográfico del token de terminal:
     ```sql
     CREATE TABLE public.terminal_identities (
       installation_id TEXT PRIMARY KEY,
       token_hash TEXT NOT NULL,
       commerce_id TEXT,
       created_at TIMESTAMPTZ DEFAULT now(),
       last_used_at TIMESTAMPTZ DEFAULT now(),
       status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended'))
     );
     ALTER TABLE public.terminal_identities ENABLE ROW LEVEL SECURITY;
     -- RLS: Ningún acceso para rol anónimo (solo accesible por service_role / security definer)
     ```
   - El token original nunca se almacena en texto plano en el servidor; solo se almacena su hash SHA-256 (`encode(digest(token, 'sha256'), 'hex')`).

2. **Almacenamiento Seguro del Token en el Cliente:**
   - En Electron (entorno de producción Windows), el `terminalToken` se almacena cifrado mediante **Windows DPAPI** utilizando `safeStorage` de Electron (`safeStorage.encryptString()` / `safeStorage.decryptString()`), gestionado a través de IPC en `electron/main.js` y expuesto vía `electron/preload.js`.
   - En navegadores o entornos de desarrollo donde `safeStorage` no esté disponible, se utiliza un almacén de reserva local documentado, asegurando continuidad en cualquier entorno.

3. **Mecanismo de Enrolamiento Progresivo (Migración Sin Fricción):**
   - **Terminales Existentes:** Cuando una terminal existente (que ya cuenta con su registro en `merchants`) se conecta por primera vez, el endpoint de enrolamiento verifica que el `installation_id` ya existe en `merchants` y no tiene identidad registrada en `terminal_identities`. Genera el `terminalToken`, guarda su hash de forma única e irreversible, y se lo entrega a la terminal. A partir de ese momento, la identidad queda blindada: nadie más puede volver a enrolar ese `installation_id`.
   - **Terminales Nuevas:** Requieren validar la clave de activación o el flujo de activación autorizado (`processActivation` Fail-Closed) antes de emitir la identidad de terminal.
   - En ningún caso se regenera ni se modifica el `installation_id`, `commerce_id` ni las licencias PRO existentes.

4. **Endpoint Seguro de Terminal (`terminal-sync`):**
   - **Ruta de Heartbeat (`/heartbeat`):**
     - Recibe `x-terminal-id` y `x-terminal-token`.
     - Valida el token contra `terminal_identities`.
     - Aplica una **Allowlist Estricta** de campos técnicos: `app_version`, `config_version`, `status`, `last_seen_at`, `last_active`.
     - Actualiza **exclusivamente** el registro de `merchants` correspondiente al `installation_id` autenticado.
     - Es imposible que una terminal modifique a otra.
   - **Ruta de Registro / Actualización de Comercio (`/register`):**
     - Permite actualizar datos del comercio (`name`, `address`, `phone`, `city`, `province`, `business_type`) asociados al `installation_id` autenticado.
     - Valida tipos de datos, longitudes y descarta campos administrativos sensibles.
   - **Ruta de Métricas de Campaña (`/events`):**
     - Recibe lotes de eventos del Outbox.
     - Valida la identidad de la terminal.
     - Fuerza que el `merchant_id` de cada evento sea **exactamente** el `installation_id` autenticado, impidiendo cualquier suplantación.
     - Valida que `event_type IN ('impression', 'offer_open', 'whatsapp_click')`.
     - Valida que `campaign_id` exista.
     - Registra los eventos con `synced_at = now()`.
     - Maneja duplicados de forma idempotente.

---

## 3. Estrategia de Migración en Dos Etapas (Cero Regresiones)

Para cumplir con la directiva fundamental de **NO ROMPER LO QUE YA FUNCIONA**:

### ETAPA A: Implementación y Validación del Nuevo Camino
1. Se crea la tabla `terminal_identities` en Supabase con RLS privada.
2. Se implementa y despliega la Edge Function `terminal-sync` (o funciones PostgreSQL SECURITY DEFINER con API endpoint equivalente).
3. Se implementa en el cliente el gestor de credenciales de terminal (`terminalIdentityService.js`) con soporte de cifrado Windows DPAPI (`safeStorage`).
4. Se actualiza [`syncService.js`](file:///c:/Users/Pininas/KioscoProX/src/services/syncService.js) y [`adSyncEngine.js`](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js) para dirigir el tráfico hacia el nuevo endpoint.
5. **LAS POLÍTICAS ANTIGUAS SE MANTIENEN TEMPORALMENTE ACTIVAS.** Si el nuevo endpoint tuviera alguna falla temporal, el sistema no se interrumpe.
6. Se ejecutan las pruebas de seguridad y regresión: enrolamiento, heartbeat, eventos, offline, reconexión.

### ETAPA B: Cierre Defensivo de Políticas Públicas
Únicamente tras verificar con éxito todas las pruebas de la Etapa A:
1. Se revoca la política `merchants_update_public` y `merchants_insert_public` en PostgREST directo para el rol anónimo.
2. Se revoca la política `campaign_events_insert_public` en PostgREST directo para el rol anónimo.
3. El rol anónimo queda restringido:
   - `merchants`: Lectura solo para administradores autenticados (`merchants_select_auth`). Mutaciones solo a través de la identidad de terminal en el backend.
   - `campaign_events`: Lectura solo para administradores autenticados. Inserciones solo a través de la identidad de terminal en el backend.
   - `campaigns`: Lectura pública de campañas activas preservada para que el catálogo de ofertas siga descargándose normalmente.

---

## 4. Matriz de Compatibilidad y Preservación

| Componente | Estado | Garantía de Compatibilidad |
| :--- | :--- | :--- |
| **`installationId`** | **INTACTO** | Se preserva el identificador existente sin modificaciones ni regeneraciones. |
| **`commerceId`** | **INTACTO** | Se mantiene la asignación actual del comercio. |
| **Licencias PRO** | **INTACTO** | `calculateLicenseKey()`, `isValidLicenseKey()` y `SECRET_SALT` sin cambios. |
| **POS (Caja, Ventas, Stock)** | **INTACTO** | 100% desacoplado de las operaciones de red; funciona offline sin conexión. |
| **Outbox y Reintentos** | **INTACTO** | Cola persistente en `localStorage`, backoff exponencial y vaciado automático tras reconexión. |
| **Panel Administrador** | **INTACTO** | Hardening de Fase 0.1 (`authSession && authSession.user`) preservado. |
| **Electron Hardening** | **INTACTO** | `isSafeExternalUrl` y deny-by-default preservados. |

---

## 5. Procedimiento de Rollback

Se definen tres niveles de rollback independientes:

1. **Rollback de Código Cliente:**
   ```bash
   git checkout security/phase-0.1-fixes
   # O forzado:
   git reset --hard 772c9b4
   ```
2. **Rollback de Base de Datos Supabase:**
   - Se ejecutará el archivo generado `SECURITY_PHASE_0_2_SUPABASE_ROLLBACK.sql`, el cual restaura con precisión las políticas de PostgREST activas antes de Fase 0.2 (`merchants_update_public`, `merchants_insert_public`, `campaign_events_insert_public`).
   - La tabla `terminal_identities` puede conservarse o descartarse sin afectar datos de ventas ni comercios.
3. **Rollback Total a Estado Pre-Fase 0:**
   ```bash
   git reset --hard 2605667
   ```
