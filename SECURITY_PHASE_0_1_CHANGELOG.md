# KioscoProX — CHANGELOG: Fase 0.1 de Hardening de Seguridad

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.1-fixes`  
**Commit de Respaldo Previo (Fase 0):** `8e9c85b`  
**Modo de Trabajo:** Cambio Quirúrgico (Zero Regressions)

---

## 1. Estado Inicial y Objetivos de la Intervención

Tras la auditoría e intervención inicial de Fase 0, se identificaron tres problemas críticos que requerían corrección quirúrgica inmediata:
1. **Bypass en la Activación:** `processActivation` omitía la verificación de clave si `remoteMasterKey` retornaba vacío, permitiendo activar terminales con claves arbitrarias si no había conexión o URL configurada.
2. **Tokens de Telegram en el Cliente:** Se mantenía almacenamiento en `localStorage` (`kioscoprox_remote_config`), inputs en modales y llamadas directas a `https://api.telegram.org/bot...`.
3. **Bypass de Autenticación en el Panel Administrador:** Existencia del botón `"Acceso Local / Sin Conexión"` que ocultaba el overlay de login y llamaba a `initApp()` sin una sesión Supabase válida.

---

## 2. Modificaciones Realizadas

### A. Activación Fail-Closed y Deshabilitación de Telegram en Cliente
* **`src/services/activationService.js`:**
  - `processActivation()`: Se implementó validación estricta **Fail-Closed**. Si `remoteMasterKey` es nulo, indefinido o vacío, la función rechaza la activación de inmediato con el mensaje:
    `"No fue posible validar la clave de activación. Verifique la configuración o conexión con el servicio de activación."`
  - Se valida estrictamente `masterKeyInput.trim() !== remoteMasterKey.trim()`.
  - `sendTelegramNotification()`: Deshabilitada para suprimir toda llamada externa directa a `api.telegram.org`. Devuelve `false` y no transmite datos ni requiere tokens.
  - `testTelegramNotification()`: Deshabilitada en el cliente; retorna un error indicando que las notificaciones de Telegram deben canalizarse vía backend.
  - `DEFAULT_CONFIG`: Se eliminaron `telegramBotToken`, `telegramChatId` y `defaultMasterKey`.

### B. Limpieza de Interfaz y Almacenamiento Local de Telegram
* **`src/components/ActivationGuard.jsx`:**
  - Se eliminaron los estados locales de Telegram (`botToken`, `chatId`, `testResult`, `testLoading`).
  - En `handleSaveConfig`: Se eliminó la persistencia de tokens de Telegram y se añadió la eliminación explícita de `telegramBotToken` y `telegramChatId` del objeto persistido en `kioscoprox_remote_config`.
  - En el modal de configuración de la activación: Se eliminaron los campos de entrada de Telegram Bot Token y Chat ID, así como el botón de prueba de notificación. Se conservaron la URL de configuración remota y la clave maestra de respaldo.
* **`src/screens/Configuracion.jsx`:**
  - Se eliminaron estados y manejadores huérfanos que guardaban o probaban credenciales de Telegram (`telegramToken`, `telegramChatId`, `telegramMasterKey`, `telegramTestLoading`, `telegramTestResult`, `showTelegramSuccess`, `handleSaveTelegramSettings`, `handleTestTelegramInConfig`).
  - Se removió la importación no utilizada de `testTelegramNotification` y `fetchRemoteMasterKey`.

### C. Eliminación de Bypass en Panel Administrador
* **`panel-admin/index.html`:**
  - Se eliminó el botón de bypass `"Acceso Local / Sin Conexión"` que permitía saltar la autenticación ejecutando `initApp()`.
  - Se modificó `#auth-overlay` para que su estilo inicial sea `display: flex;` (bloqueo por defecto).
  - En `initApp()`: Se agregó una guarda obligatoria al inicio:
    ```javascript
    if (!authSession || !authSession.user) {
      const authOverlay = document.getElementById('auth-overlay');
      if (authOverlay) authOverlay.style.display = 'flex';
      return;
    }
    ```
  - En `initSupabase()`: Se añadió el listener `supabaseClient.auth.onAuthStateChange` para forzar el bloqueo y mostrar el overlay si la sesión se cierra (`SIGNED_OUT`).
  - En `handleLogout()`: Se agregó la limpieza de listas DOM de comercios y campañas para evitar que queden datos residuales en pantalla tras cerrar sesión.

---

## 3. Componentes Expresamente Protegidos y NO Modificados

Conforme a las reglas de AGENTS.md, las siguientes áreas se mantuvieron 100% intactas:
* **Módulos POS:** `src/screens/PuntoDeVenta.jsx` (Ventas, Cobro, Descuentos).
* **Caja y Turnos:** `src/screens/Turnos.jsx` (Apertura, Cierre, Movimientos de caja).
* **Catálogo e Inventario:** `src/screens/Productos.jsx`, `src/screens/Inventario.jsx`.
* **Clientes y Proveedores:** `src/screens/Clientes.jsx`, `src/screens/Proveedores.jsx`.
* **Sistema de Licenciamiento PRO:** `src/hooks/useKiosco.js` (`calculateLicenseKey`, `isValidLicenseKey`, `SECRET_SALT`).
* **Identidad de Hardware:** `src/services/installationService.js` (`installationId`, `merchantId`).
* **Sincronización Offline:** `src/services/adSyncEngine.js`, `src/services/syncService.js` (Outbox y Heartbeat intactos).
* **Seguridad Electron (Fase 0):** `electron/main.js` (`isSafeExternalUrl`, deny-by-default en `setWindowOpenHandler` y canal IPC `open-external` conservados sin alteraciones).

---

## 4. Estado de Base de Datos Supabase

* **SQL Ejecutado en Fase 0.1:** Ninguno.
* **Justificación:** Las políticas de PostgreSQL endurecidas en Fase 0 se mantienen activas. Para preservar el funcionamiento offline del POS, el registro de nuevos comercios y el heartbeat continuo, no se eliminaron las políticas de `INSERT` y `UPDATE` anónimas de `merchants` ni de inserción de métricas en `campaign_events`. Dichos riesgos se documentaron detalladamente como riesgos residuales.

---

## 5. Procedimiento de Rollback

Si se requiriera revertir al estado exacto previo a Fase 0.1:
```bash
git checkout security/phase-0-hardening
# O alternativamente:
git reset --hard 8e9c85b
```
Si se desea regresar al estado original previo a Fase 0:
```bash
git reset --hard 2605667
```
