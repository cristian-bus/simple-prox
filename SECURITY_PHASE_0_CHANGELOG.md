# KioscoProX — Registro de Cambios: Fase 0 de Hardening de Seguridad

## 1. Estado Inicial
* **Versión del Proyecto:** 1.3.9
* **Fecha:** 23/09/2026
* **Objetivo de la Fase:** Reparación quirúrgica de vulnerabilidades críticas e inmediatas sin refactorización ni regresiones en el POS.

---

## 2. Respaldo y Reversibilidad (Backup)
* **Rama de Trabajo:** `security/phase-0-hardening`
* **Commit de Respaldo Previo:** `2605667` (`backup: estado previo a security phase 0`)
* **Rama Base:** `main`
* **Procedimiento de Rollback Inmediato:**
  ```bash
  # En caso de requerir volver al estado previo:
  git checkout security/phase-0-hardening
  git reset --hard 2605667
  ```
  *(Para las políticas de base de datos Supabase, ejecutar el script de rollback documentado en el informe final).*

---

## 3. Registro de Modificaciones Realizadas

### [CAMBIO-01] Eliminación de Credenciales de Telegram y Polling Inseguro
* **ID:** CRÍTICO 1
* **Vulnerabilidad:** Token de Bot de Telegram y credenciales maestras expuestas en el cliente.
* **Archivo:** `src/services/activationService.js` y `src/components/ActivationGuard.jsx`
* **Cambio Realizado:**
  - Se eliminaron el token de bot hardcodeado, el chat ID administrativo y la clave maestra por defecto de `DEFAULT_CONFIG`.
  - Se suprimió la llamada de polling `getUpdates` contra `api.telegram.org` que exponía comandos y claves maestras.
  - Se adaptó `fetchRemoteMasterKey()` para leer de URL remota configurada o configuración local.
  - Se ajustó `processActivation()` para validar contra clave configurada solo si existe.
  - Se retiró el fallback `'ProX2026MasterKey'` en `ActivationGuard.jsx`.
* **Motivo:** Evitar que cualquier usuario que inspeccione el código o el paquete `.exe` extraiga el token de Telegram y tome control del bot o lea las claves.
* **Riesgo de Regresión:** Nulo para comercios activos. Los instaladores pueden configurar credenciales personalizadas si desean notificaciones.
* **Prueba Realizada:** Búsqueda exhaustiva en código (`grep_search`) de tokens y claves anteriores, verificación de compilación con `npm run build`.
* **Resultado:** EXITOSO. No queda ninguna credencial sensible en los archivos ni en el bundle.

---

### [CAMBIO-02] Restricción de Lectura Pública en Supabase `merchants`
* **ID:** CRÍTICO 2
* **Vulnerabilidad:** RLS excesivamente permisivo en tabla `merchants` (`SELECT qual: true`).
* **Archivo:** Base de datos PostgreSQL Supabase (Proyecto `qtixbiikhvhzwshfgyeo`)
* **Cambio Realizado:**
  - Se eliminó la política `merchants_select_public`.
  - Se creó la política `merchants_select_auth` para que únicamente usuarios autenticados (`auth.role() = 'authenticated'`) puedan consultar los comercios.
  - Se preservaron las políticas `merchants_insert_public` y `merchants_update_public` para permitir el registro y heartbeat de las terminales offline-first.
* **Motivo:** Impedir que usuarios anónimos o competidores descarguen la base de datos de comercios (nombres, teléfonos, direcciones, versiones de terminal).
* **Riesgo de Regresión:** Nulo. El POS cliente no realiza `SELECT` sobre `merchants`, solo `POST` de registro y heartbeat. El panel administrativo accede tras autenticarse con Supabase Auth.
* **Prueba Realizada:** Consulta con cliente anónimo vía REST API de Supabase intentando `SELECT * FROM merchants`.
* **Resultado:** EXITOSO. La consulta anónima retorna 0 registros (`dataCount: 0`). Los datos de comercios están protegidos.

---

### [CAMBIO-03] Hardening de RLS e Inserción en `campaign_events`
* **ID:** CRÍTICO 3
* **Vulnerabilidad:** RLS público de lectura e inserción sin validación en `campaign_events`.
* **Archivo:** Base de datos PostgreSQL Supabase (Proyecto `qtixbiikhvhzwshfgyeo`)
* **Cambio Realizado:**
  - Se eliminó la política `campaign_events_select_public`.
  - Se mantuvo `campaign_events_select_auth` para lectura exclusiva de administradores autenticados.
  - Se reemplazó `campaign_events_insert_public` para exigir que `event_type IN ('impression', 'offer_open', 'whatsapp_click')` y `merchant_id IS NOT NULL`.
  - Se documentó la presencia de duplicados históricos de `event_id` en producción, omitiendo la restricción UNIQUE en esta fase para no borrar ni alterar datos existentes.
* **Motivo:** Evitar la fuga de métricas comerciales B2B y bloquear la inyección de eventos arbitrarios no permitidos.
* **Riesgo de Regresión:** Nulo. La sincronización de métricas legítimas del Outbox (`impression`, `offer_open`, `whatsapp_click`) continúa funcionando sin modificaciones.
* **Prueba Realizada:** Inserción de evento con tipo malicioso rechazada por RLS; inserción de evento legítimo aceptada; lectura anónima retorna 0 registros.
* **Resultado:** EXITOSO. Métricas protegidas contra lectura y alteración no autorizada.

---

### [CAMBIO-04] Validación Estricta de URLs y Deny-by-Default en Electron
* **ID:** ALTO 4
* **Vulnerabilidad:** Fuga en `setWindowOpenHandler` (`allow` para esquemas no web) y ausencia de validación en `open-external`.
* **Archivo:** `electron/main.js`
* **Cambio Realizado:**
  - Se implementó la función `isSafeExternalUrl(rawUrl)` validando mediante `new URL(url)` los esquemas `https:`, `http:` y `mailto:`.
  - En `setWindowOpenHandler`: si la URL es segura se abre en navegador externo; en todos los casos retorna `{ action: 'deny' }` (Deny-by-Default).
  - En `ipcMain.on('open-external')`: se valida `isSafeExternalUrl(url)` antes de llamar a `shell.openExternal()`.
* **Motivo:** Neutralizar la ejecución de esquemas peligrosos como `file:`, `javascript:`, `data:`, `vbscript:` o comandos locales de Windows.
* **Riesgo de Regresión:** Nulo. Los enlaces legítimos de WhatsApp (`https://api.whatsapp.com/...`), enlaces externos y correo continúan funcionando con normalidad.
* **Prueba Realizada:** Suite de pruebas con 10 casos de prueba (URLs legítimas de WhatsApp, http/https/mailto aceptadas; esquemas file, javascript, data, vbscript y ms-msdt rechazados).
* **Resultado:** EXITOSO. Aprobados el 100% de los casos de prueba.

---

### [CAMBIO-05] Bloqueo de Bypass de Autenticación en Panel Administrador
* **ID:** ALTO 5
* **Vulnerabilidad:** Ocultamiento incondicional de la pantalla de login en `panel-admin/index.html`.
* **Archivo:** `panel-admin/index.html`
* **Cambio Realizado:**
  - En `checkSession()`: se verifica `authSession && authSession.user`. Si existe, se oculta el overlay y se llama a `initApp()`. Si es nula o inválida, se mantiene el overlay visible (`display: flex`) y NO se ejecuta `initApp()`.
  - En `handleLogout()`: se asegura la llamada a `signOut()`, se anula `authSession` y se restablece la visibilidad del overlay.
* **Motivo:** Evitar que cualquier usuario que cargue el HTML del panel acceda a los datos administrativos sin iniciar sesión.
* **Riesgo de Regresión:** Nulo. Los administradores con credenciales válidas en Supabase Auth inician sesión normalmente.
* **Prueba Realizada:** Verificación del flujo de código estático y coherencia con las políticas RLS autenticadas.
* **Resultado:** EXITOSO.

---

## 4. Componentes y Áreas Expresamente NO Modificados
En estricto cumplimiento de las reglas del proyecto y de la Fase 0, los siguientes módulos **permanecen intactos**:
* **Ventas y Punto de Venta (POS):** Sin cambios en cálculo de totales, flujo de cobro, tickets ni pantalla.
* **Caja y Turnos:** Sin cambios en aperturas, cierres, arqueos ni persistencia.
* **Stock e Inventario:** Sin cambios en existencias, márgenes ni alertas.
* **Productos, Clientes y Proveedores:** Sin cambios en estructuras de datos ni cuentas corrientes.
* **Sistema de Licenciamiento:** Se preservó `calculateLicenseKey()`, `SECRET_SALT`, validación PRO y compatibilidad con licencias existentes (postergado para Fase 1).
* **Identificadores:** `installationId` y `merchantId` se mantuvieron 100% intactos.
* **Persistencia Local (`localStorage`):** Sin cambios de esquema ni migraciones forzadas.
* **Funcionamiento Offline:** El POS y la cola Outbox continúan operando de forma autónoma sin Internet.
* **Actualizaciones:** `electron-updater` y configuración de GitHub Releases no fueron alterados.
