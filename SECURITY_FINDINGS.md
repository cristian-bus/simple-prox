# KioscoProX — Matriz de Hallazgos y Vulnerabilidades de Seguridad

**Fecha de Auditoría:** 23 de Septiembre de 2026  
**Proyecto:** KioscoProX / Simple ProX  
**Versión:** 1.3.9  
**Total de Hallazgos Auditados:** 13 (4 Críticos, 4 Altos, 3 Medios, 2 Bajas) + 2 Riesgos Potenciales  

---

## 1. Tabla Resumen de Vulnerabilidades y Riesgos

| ID | Vulnerabilidad / Hallazgo | Severidad | Probabilidad | Impacto | Componente | Evidencia en Código | Tipo |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- | :---: |
| **VULN-01** | Lectura y modificación pública multi-tenant de comercios | **CRÍTICO** | Alta | Crítico | Supabase RLS | `pg_policies`: `merchants_select_public` (qual: true), `merchants_update_public` (qual: true) | Confirmada |
| **VULN-02** | Clave secreta y generador de licencias PRO embebidos en el cliente | **CRÍTICO** | Alta | Crítico | Licensing | `src/services/installationService.js`: L.15-33 (`SECRET_SALT = 'KioscoProX_Secret_2026'`) | Confirmada |
| **VULN-03** | Token de Bot de Telegram y credenciales maestras en texto plano | **CRÍTICO** | Alta | Crítico | Activación Remota | `src/services/activationService.js`: L.7-10 (`telegramBotToken`, `defaultMasterKey`) | Confirmada |
| **VULN-04** | Inyección y lectura pública de eventos de métricas B2B | **CRÍTICO** | Alta | Crítico | Supabase RLS / Ads | `pg_policies`: `campaign_events_select_public` y `campaign_events_insert_public` (true) | Confirmada |
| **VULN-05** | Ejecución de esquemas arbitrarios en `open-external` y fuga en `setWindowOpenHandler` | **ALTO** | Media | Alto | Electron Main | `electron/main.js`: L.81-87 (`return { action: 'allow' }`) y L.154-158 | Confirmada |
| **VULN-06** | Omisión incondicional de pantalla de login en Panel Web | **ALTO** | Alta | Alto | Panel Admin B2B | `panel-admin/index.html`: L.2053-2055 (`authOverlay.style.display = 'none'; initApp();`) | Confirmada |
| **VULN-07** | Persistencia desprotegida de ventas, caja, deudas y PINes en `localStorage` | **ALTO** | Alta | Alto | Persistencia Local | `src/hooks/useKiosco.js`: L.4-16, L.49-55 (PIN admin "1234" en texto plano) | Confirmada |
| **VULN-08** | Actualizaciones automáticas sin firma de código Authenticode | **ALTO** | Media | Crítico | Actualizador Electron | `package.json`: L.18-51 (Falta configuración de firma en `build.win`) | Confirmada |
| **VULN-09** | Ausencia total de Content Security Policy (CSP) | **MEDIO** | Alta | Medio | Frontend / Electron | `index.html`: L.1-14 (Sin meta tag CSP ni cabecera webRequest) | Confirmada |
| **VULN-10** | Bypass local de pantalla de activación sin validación de servidor | **MEDIO** | Alta | Medio | Frontend Guard | `src/App.jsx`: L.94-96 (Depende sólo de `businessConfig.isActivated` en localStorage) | Confirmada |
| **VULN-11** | 31 vulnerabilidades reportadas en dependencias npm (ej. `xlsx`) | **MEDIO** | Media | Medio | Dependencias | `package.json`: `xlsx: ^0.18.5` (Prototype Pollution & ReDoS) | Confirmada |
| **VULN-12** | Identificador de hardware no determinista ni vinculado a hardware real | **BAJO** | Alta | Bajo | Activación | `src/services/activationService.js`: L.204 (`'PC-' + Math.random()...`) | Confirmada |
| **VULN-13** | Carga de imágenes de banners desde orígenes externos arbitrarios | **BAJO** | Media | Bajo | Ofertas B2B | `src/components/OfertaDetailModal.jsx`: L.72-78 | Confirmada |
| **RIESGO-01** | Manipulación del reloj del sistema operativo para evadir vigencias | **INFO** | Baja | Bajo | Offline Logic | Dependencia en `Date.now()` para expiración de campañas y turnos | Potencial |
| **RIESGO-02** | Saturación de conexiones en Supabase por sincronización concurrente masiva | **INFO** | Baja | Medio | Sync Engine | Polling e intervalos fijos en miles de terminales sin jitter dinámico | Potencial |

---

## 2. Detalle Exhaustivo de Hallazgos Confirmados

### [VULN-01] Lectura y Modificación Pública Multi-Tenant de Comercios
* **Severidad:** CRÍTICO
* **Componente:** Supabase Database / Row Level Security (RLS)
* **Archivo:** Base de datos PostgreSQL remota (esquema `public.merchants`)
* **Evidencia:**
  Políticas activas:
  - `merchants_select_public`: `SELECT qual: true` sobre rol `public`.
  - `merchants_update_public`: `UPDATE qual: true, with_check: true` sobre rol `public`.
* **Riesgo y Explotación:** Cualquier cliente que posea la clave anónima de Supabase puede listar toda la base de datos de comercios mediante un `GET /rest/v1/merchants`, accediendo a nombres, números de teléfono, direcciones y perfiles de todos los clientes. Adicionalmente, puede ejecutar `PATCH /rest/v1/merchants?id=eq.<ID>` y modificar información de cualquier otro comercio.
* **Impacto:** Fuga masiva de información confidencial y alteración maliciosa de datos.
* **Recomendación:** Modificar RLS de `merchants` para impedir el `SELECT` y `UPDATE` irrestricto de usuarios anónimos. Implementar Edge Functions con token específico de terminal para operaciones de registro y heartbeat.

---

### [VULN-02] Generador de Licencias PRO y Sal Secreta Embebidos en el Cliente
* **Severidad:** CRÍTICO
* **Componente:** Sistema de Licenciamiento
* **Archivo:** `src/services/installationService.js` (Líneas 15-33)
* **Evidencia:**
  ```javascript
  const SECRET_SALT = 'KioscoProX_Secret_2026';
  export function calculateLicenseKey(installationId) { ... }
  ```
* **Riesgo y Explotación:** Tanto la fórmula como la sal simétrica se distribuyen dentro del instalador final. Un usuario puede autogenerar licencias PRO para cualquier `installationId` ejecutando la función en DevTools o inspeccionando el código descompilado.
* **Impacto:** Imposibilidad de monetizar el plan PRO y pérdida de ingresos comerciales.
* **Recomendación:** Adoptar criptografía asimétrica (Ed25519 o ECDSA). La clave privada genera la firma en el servidor; el cliente únicamente valida con la clave pública embebida.

---

### [VULN-03] Token de Bot de Telegram y Credenciales Maestras en Texto Plano
* **Severidad:** CRÍTICO
* **Componente:** Servicio de Activación y Registro
* **Archivo:** `src/services/activationService.js` (Líneas 7-10, 43-79)
* **Evidencia:**
  ```javascript
  telegramBotToken: '8929069889:AAEGey****'
  telegramChatId: '1103915546'
  defaultMasterKey: 'SiMple2026'
  ```
  La función `fetchRemoteMasterKey` invoca `getUpdates` directamente contra la API de Telegram desde cada terminal instalada.
* **Riesgo y Explotación:** Cualquier usuario puede tomar control del bot de Telegram, leer los mensajes del canal privado de administración, interceptar notificaciones de nuevas instalaciones y purgar actualizaciones de la cola de Telegram.
* **Impacto:** Compromiso de la infraestructura de notificaciones y filtración de claves maestras.
* **Recomendación:** Revocar inmediatamente el bot token en `@BotFather`. Eliminar la comunicación cliente-Telegram y centralizar las notificaciones en un backend seguro.

---

### [VULN-04] Inyección y Lectura Pública de Métricas Publicitarias B2B
* **Severidad:** CRÍTICO
* **Componente:** Módulo de Métricas y Anuncios B2B
* **Archivo:** Base de datos PostgreSQL remota (esquema `public.campaign_events`)
* **Evidencia:**
  Políticas RLS en `campaign_events`:
  - `campaign_events_select_public`: `cmd: SELECT`, `qual: true`
  - `campaign_events_insert_public`: `cmd: INSERT`, `with_check: true`
* **Riesgo y Explotación:** Cualquier persona puede consultar todas las métricas de todas las campañas comerciales o inyectar eventos falsos masivos (`impression`, `whatsapp_click`) para cometer fraude publicitario.
* **Impacto:** Pérdida de credibilidad comercial frente a distribuidores y mayoristas anunciantes.
* **Recomendación:** Cerrar el acceso `SELECT` público a `campaign_events` y enrutar la recepción de métricas a través de una función con validación de tasa máxima (rate limiting) y deduplicación.

---

### [VULN-05] Fuga de Esquemas en `setWindowOpenHandler` y Validación Nula en `open-external`
* **Severidad:** ALTO
* **Componente:** Proceso Principal de Electron (`main.js`)
* **Archivo:** `electron/main.js` (Líneas 81-87 y 154-158)
* **Evidencia:**
  ```javascript
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('whatsapp:') || url.startsWith('mailto:'))) {
      shell.openExternal(url).catch(...);
      return { action: 'deny' };
    }
    return { action: 'allow' }; // Permite cualquier otro protocolo
  });

  ipcMain.on('open-external', (event, url) => {
    if (url && typeof url === 'string') {
      shell.openExternal(url).catch(...);
    }
  });
  ```
* **Riesgo y Explotación:** URLs con esquemas no esperados (por ejemplo `file:`, `javascript:` o esquemas URI personalizados de Windows) son permitidas en nuevas ventanas o ejecutadas directamente por el sistema operativo mediante `shell.openExternal`.
* **Impacto:** Potencial ejecución arbitraria de programas locales en la máquina del usuario.
* **Recomendación:** Cambiar el retorno por defecto de `setWindowOpenHandler` a `{ action: 'deny' }` y desinfectar rigurosamente las URLs antes de enviarlas a `shell.openExternal`.

---

### [VULN-06] Bypass de Sesión en Panel de Administración Web
* **Severidad:** ALTO
* **Componente:** Panel Web (`panel-admin/index.html`)
* **Archivo:** `panel-admin/index.html` (Líneas 2044-2056)
* **Evidencia:**
  En `checkSession()`, el overlay de login se oculta (`authOverlay.style.display = 'none'`) e `initApp()` se invoca incluso si no existe una sesión autenticada en Supabase.
* **Riesgo y Explotación:** Al visitar el archivo HTML del panel, cualquier persona accede a la vista de administración sin autenticarse.
* **Impacto:** Exposición no autorizada de métricas y campañas a terceros.
* **Recomendación:** Forzar que el overlay permanezca visible y bloquear la inicialización si `!authSession`.

---

### [VULN-07] Almacenamiento en Texto Plano de Datos Críticos y PINes en `localStorage`
* **Severidad:** ALTO
* **Componente:** Capa de Persistencia Local (`useKiosco.js`)
* **Archivo:** `src/hooks/useKiosco.js` (Líneas 4-16, 49-55)
* **Evidencia:**
  Todas las entidades (ventas, compras, caja, deudas de clientes y usuarios con su PIN) se guardan como cadenas JSON sin cifrar en `localStorage`. El usuario Administrador inicial tiene `pin: "1234"`.
* **Riesgo y Explotación:** Un empleado de caja o cualquier usuario con acceso físico puede abrir LevelDB o la consola de Electron y ver/modificar PINes, cancelar deudas de clientes o alterar los arqueos de caja.
* **Impacto:** Fraude interno no detectable y falta de trazabilidad.
* **Recomendación:** Aplicar hashing seguro sobre los PINes de usuario y migrar progresivamente hacia SQLite local con registros inmutables de auditoría para ventas y caja.

---

### [VULN-08] Actualizaciones Automáticas sin Firma de Código
* **Severidad:** ALTO
* **Componente:** Empaquetado y Distribución (`electron-builder`)
* **Archivo:** `package.json` (Líneas 18-51)
* **Evidencia:**
  No se define certificado Authenticode para la compilación de Windows en `build.win`.
* **Riesgo y Explotación:** Las terminales descargan instaladores de GitHub Releases sin validar la autenticidad del autor mediante certificados criptográficos reconocidos por Windows.
* **Impacto:** Posible vector de distribución de binarios maliciosos si el canal de GitHub se ve comprometido.
* **Recomendación:** Adquirir y configurar un certificado de firma de código (Authenticode) en el proceso de release.

---

## 3. Plan de Mitigación Inmediata

```text
PASO 1: Revocación de secretos expuestos (Telegram Token).
PASO 2: Restricción de permisos RLS en PostgreSQL Supabase (merchants y campaign_events).
PASO 3: Validación estricta de protocolos en Electron (main.js).
PASO 4: Bloqueo de autenticación en Panel Web.
PASO 5: Rediseño del esquema de licencias PRO a clave pública/privada (Ed25519).
```
