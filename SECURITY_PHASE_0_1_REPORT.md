# KioscoProX / Simple ProX — Informe de Seguridad Fase 0.1

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.1-fixes`  
**Commit de Respaldo Previo (Fase 0):** `8e9c85b`  
**Punto de Restauración Original (Pre-Fase 0):** `2605667`

---

## 1. Clasificación del Estado de Seguridad

### CORREGIDO

#### 1. Bypass en Validación de Activación (Fail-Closed)
* **Archivo:** `src/services/activationService.js`
* **Función:** `processActivation`
* **Motivo:** Si no existía una URL de configuración remota ni una clave configurada localmente, `fetchRemoteMasterKey()` retornaba una cadena vacía. La condición anterior `if (remoteMasterKey && masterKeyInput !== remoteMasterKey)` no se evaluaba, permitiendo la activación con cualquier texto ingresado.
* **Comportamiento Anterior:** Activación permitida con cualquier clave si `remoteMasterKey` estaba vacío.
* **Comportamiento Nuevo:** Comportamiento estricto **Fail-Closed**. Si no se obtiene una clave maestra remota o local válida y no vacía, la activación se bloquea inmediatamente y devuelve:
  `"No fue posible validar la clave de activación. Verifique la configuración o conexión con el servicio de activación."`
* **Pruebas Realizadas:**
  - Caso sin clave remota ni local: Rechazado con mensaje Fail-Closed (PASS).
  - Caso con clave configurada y clave errónea: Rechazado (PASS).
  - Caso con clave configurada y clave correcta: Aprobado (PASS).
* **Posible Regresión:** Ninguna en terminales activadas previamente (dado que `ActivationGuard` verifica `isActivated === true` y salta la verificación). En terminales nuevas se requiere explícitamente configurar la clave maestra o URL remota antes de activar.
* **Procedimiento de Rollback:** Revertir `src/services/activationService.js` al commit `8e9c85b`.

#### 2. Eliminación de Tokens de Telegram en Terminales Cliente
* **Archivos:** `src/services/activationService.js`, `src/components/ActivationGuard.jsx`, `src/screens/Configuracion.jsx`
* **Funciones:** `sendTelegramNotification`, `testTelegramNotification`, `handleSaveConfig`, estados locales en React.
* **Motivo:** Las terminales cliente no deben poseer ni almacenar el token privado del bot de Telegram en `localStorage`, ni realizar peticiones HTTP directas a `https://api.telegram.org`.
* **Comportamiento Anterior:** Las terminales guardaban `telegramBotToken` y `telegramChatId` en `kioscoprox_remote_config` y llamaban a la API de Telegram al activarse.
* **Comportamiento Nuevo:** 
  - `sendTelegramNotification()` y `testTelegramNotification()` deshabilitadas en el cliente (retornan `false` / mensaje seguro sin contactar Telegram).
  - El modal de configuración de `ActivationGuard` ya no solicita ni guarda tokens de Telegram.
  - Se eliminó el código huérfano en `Configuracion.jsx`.
  - Al guardar la configuración se purgan activamente las claves `telegramBotToken` y `telegramChatId` de `localStorage`.
* **Pruebas Realizadas:** Búsqueda en todo el código (`grep`) confirmando cero llamadas activas a `api.telegram.org` en `src/`. Compilación limpia con Vite.
* **Posible Regresión:** La notificación inmediata a Telegram de nuevas instalaciones queda suspendida hasta su implementación en un servicio backend o Edge Function. El flujo principal de activación del POS no se ve afectado.
* **Procedimiento de Rollback:** Revertir los archivos mencionados al commit `8e9c85b`.

#### 3. Bypass de Autenticación en el Panel Administrador
* **Archivo:** `panel-admin/index.html`
* **Funciones:** `initApp`, `handleLogout`, estructura HTML de `#auth-overlay`.
* **Motivo:** El formulario de inicio de sesión incluía un botón `"Acceso Local / Sin Conexión"` que forzaba `display='none'` en el overlay y ejecutaba `initApp()`, permitiendo visualizar la interfaz administrativa sin credenciales válidas.
* **Comportamiento Anterior:** Cualquier usuario podía presionar el botón y acceder a la interfaz del panel.
* **Comportamiento Nuevo:**
  - El botón `"Acceso Local / Sin Conexión"` fue eliminado por completo.
  - `#auth-overlay` tiene `display: flex;` por defecto (pantalla bloqueada desde el inicio).
  - `initApp()` tiene una guarda estricta: si `!authSession || !authSession.user`, aborta la ejecución y asegura que `#auth-overlay` permanezca visible.
  - `handleLogout()` purga los contenedores de listas de comercios y campañas en el DOM.
  - Se escucha `onAuthStateChange` para bloquear inmediatamente si la sesión finaliza.
* **Pruebas Realizadas:** Verificación de flujo con credenciales válidas e inválidas, y validación estática de todas las rutas hacia `initApp()`.
* **Posible Regresión:** Ninguna para usuarios administradores legítimos con credenciales de Supabase Auth.
* **Procedimiento de Rollback:** Revertir `panel-admin/index.html` al commit `8e9c85b`.

---

### PARCIALMENTE MITIGADO

#### 1. Inserción de Métricas en `campaign_events`
* **Estado:** Parcialmente Mitigado.
* **Detalle:** La política de RLS en Supabase restringe la inserción de eventos únicamente a tipos autorizados (`impression`, `offer_open`, `whatsapp_click`) y exige la presencia de `merchant_id`. Sin embargo, las terminales anónimas aún pueden enviar peticiones directas.
* **Mitigación Actual:** El esquema impide inyectar tipos de eventos arbitrarios o strings nulos/vacíos en `merchant_id`. La lectura de eventos continúa 100% protegida y restringida a administradores autenticados.

---

### RIESGO RESIDUAL

> [!WARNING]
> Los siguientes riesgos residuales han sido identificados y documentados formalmente. No fueron eliminados en esta fase para no provocar regresiones operativas en el POS (ventas, sincronización y funcionamiento offline).

#### 1. RIESGO RESIDUAL ALTO: Actualización y Registro Anónimo en `merchants`
* **Vía Residual:** Para permitir que los comercios se registren automáticamente al instalarse y envíen su "heartbeat" periódico sin requerir un login previo de usuario, existen dos políticas públicas en Supabase:
  - `INSERT`: Permite crear nuevos registros de comercios.
  - `UPDATE`: Permite actualizar el estado y fecha de último contacto (`last_seen_at`, `config`, etc.).
* **Impacto:** Cualquier actor que extraiga la clave pública anónima de Supabase (`anon key`) puede realizar peticiones directas vía HTTP PATCH a `/rest/v1/merchants` para alterar campos de registros existentes correspondientes a otros comercios (otros `installationId`), o registrar comercios ficticios.
* **Razón de Conservación en Fase 0.1:** Restringir esta política a `authenticated` rompería de inmediato el registro inicial de terminales y el envío del heartbeat de los comercios existentes que operan como clientes anónimos.
* **Solución Definitiva Pendiente (Próxima Fase):** Implementar una función intermediaria segura (Supabase Edge Function o API Backend) que valide la identidad del dispositivo mediante firma criptográfica de hardware o token de dispositivo emitido al momento de la activación.

#### 2. RIESGO RESIDUAL MEDIO/ALTO: Eventos de Campaña No Autenticados (Fraude de Métricas)
* **Vía Residual:** Cualquier persona con la `anon key` puede generar registros sintéticos de impresiones, aperturas o clics de WhatsApp atribuidos a cualquier `merchant_id` o `campaign_id`.
* **Impacto:** Alteración o inflado artificial de estadísticas de rendimiento de campañas publicitarias.
* **Razón de Conservación en Fase 0.1:** Los terminales POS operan offline-first y envían eventos en lotes sin credenciales de usuario.
* **Solución Definitiva Pendiente (Próxima Fase):** Firma digital de eventos generada por el POS con clave privada de terminal y validación en backend antes de consolidar métricas, sumado a rate-limiting e idempotencia con clave `UNIQUE (event_id)`.

#### 3. RIESGO RESIDUAL: Almacenamiento Local de `masterKey` de Respaldo
* **Vía Residual:** En `localStorage`, la clave `kioscoprox_remote_config.masterKey` se almacena en texto plano en la máquina cliente si fue configurada localmente.
* **Mitigación:** Al menos ahora se aplica Fail-Closed: si no existe clave, la terminal no se activa. La solución definitiva requerirá cifrado local (SQLCipher) y validación contra servidor central.

---

### POSTERGADO (Fuera de Alcance Fase 0 / 0.1)

1. **Migración a Firmas Asimétricas (Ed25519) para Licencias PRO:** Preservado para no romper licencias existentes activas.
2. **Cifrado de Base de Datos Local (SQLite / SQLCipher):** Sustitución progresiva de `localStorage` planificada para Fase 2.
3. **Firma Authenticode del Instalador Windows:** Para el proceso de packaging/distribución.
4. **Content Security Policy (CSP):** Endurecimiento global planificado para Fase 2.
5. **Rotación Obligatoria del Token de Telegram:** Dado que el token del bot de Telegram estuvo expuesto en versiones anteriores en el repositorio/código, **se debe revocar manualmente desde BotFather de Telegram y generar un nuevo bot/token exclusivamente para el backend.**

---

## 2. Pruebas de Regresión del POS y Sistema Comercial

Se ejecutaron pruebas estáticas y dinámicas sobre los flujos críticos:
1. **Compilación de Producción:** `npm run build` ejecutado exitosamente con 0 errores (Vite v7.3.1).
2. **Módulo de Activación:** Verificado comportamiento Fail-Closed, rechazo de clave errónea y aceptación de clave válida.
3. **Terminales Previamente Activadas:** Verificado que `businessConfig.isActivated === true` preserva la entrada directa sin solicitar reactivación.
4. **Licenciamiento PRO:** Algoritmo y claves de licencia existentes intactos.
5. **Módulos POS:** Sin modificaciones en ventas, caja, turnos, stock, precios ni sincronización Outbox.

---

## 3. Matriz de Cambios por Archivo

| Archivo | Naturaleza del Cambio | Impacto |
| :--- | :--- | :--- |
| `src/services/activationService.js` | Validación Fail-Closed en `processActivation()`; deshabilitación de llamadas a Telegram en cliente. | Seguridad Alta / Sin Regresión en activaciones existentes. |
| `src/components/ActivationGuard.jsx` | Eliminación de inputs de Telegram en modal; purga de tokens de `localStorage`. | Limpieza de secretos en frontend. |
| `src/screens/Configuracion.jsx` | Eliminación de estados huérfanos y funciones que guardaban credenciales de Telegram. | Limpieza de código muerto. |
| `panel-admin/index.html` | Eliminación del botón de bypass unauthenticated; guarda estricta en `initApp()`. | Bloqueo total de accesos sin sesión válida. |

---

## 4. Instrucciones de Rollback

Si se requiriera deshacer esta intervención y regresar al estado inmediato de Fase 0:
```bash
git checkout security/phase-0-hardening
# O si se desea forzar el estado exacto:
git reset --hard 8e9c85b
```

Para regresar al estado anterior a toda intervención de seguridad (estado inicial de Fase 0):
```bash
git reset --hard 2605667
```
