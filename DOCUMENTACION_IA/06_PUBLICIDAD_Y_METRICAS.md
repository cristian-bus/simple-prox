# PUBLICIDAD B2B, TELEMETRÍA Y MÉTRICAS (SIMPLE PROX v1.3.12)

> **Documento:** `DOCUMENTACION_IA/06_PUBLICIDAD_Y_METRICAS.md`  
> **Estado:** `[IMPLEMENTADO]` / `[INSPECCIONADO]` / `[TEST_AUTOMATIZADO]`  
> **Referencia de Código:** Commit `4e145bba6b4553c289727a90c569124bef8ed24b` + rama `security/phase-0.2.2-event-idempotency`  
> **Archivos Principales:** [src/services/adSyncEngine.js](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js), [src/services/syncService.js](file:///c:/Users/Pininas/KioscoProX/src/services/syncService.js), [src/hooks/useOfertas.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useOfertas.js), [src/utils/stockOfferMatcher.js](file:///c:/Users/Pininas/KioscoProX/src/utils/stockOfferMatcher.js)  
> **Regla de oro:** El sistema publicitario es 100% auxiliar; bajo ningún concepto una falla en la red, en Supabase o en la cola de métricas puede congelar el hilo principal o bloquear una venta en el POS.

---

## 1. ARQUITECTURA DE CAMPAÑAS B2B Y FLUJO DE DATOS

Simple ProX incorpora un canal de comunicación directo entre distribuidores mayoristas y comercios minoristas (kioscos). El sistema descarga ofertas promocionales y reporta telemetría de interacción (impresiones y clics).

```mermaid
flowchart TD
    subgraph Cloud ["Supabase Cloud"]
        DB[(campaigns / metrics)]
        SYNC_FN["Edge Function /terminal-sync"]
    end

    subgraph Client ["Terminal POS (Proceso Renderer)"]
        ENGINE["adSyncEngine.js (Descarga y Caché)"]
        HOOK["useOfertas.js (Rotación y Dwell Time)"]
        UI_BANNER["OfertasBannerWidget.jsx (POS)"]
        UI_SCREEN["Ofertas.jsx (Catálogo Completo)"]
        OUTBOX["syncService.js (Cola Outbox Local)"]
        STOCK["stockOfferMatcher.js (Prioridad Contextual)"]
    end

    SYNC_FN -->|GET /campaigns (Filtradas por cupo y provincia)| ENGINE
    ENGINE -->|kioscoprox_offers_cache| HOOK
    STOCK -->|Detecta faltantes de stock| HOOK
    HOOK --> UI_BANNER
    HOOK --> UI_SCREEN
    UI_BANNER -->|Evento Impresión / Clic| OUTBOX
    UI_SCREEN -->|Clic CTA WhatsApp| OUTBOX
    OUTBOX -->|POST /events (Lote Idempotente con UUIDs)| SYNC_FN
    SYNC_FN --> DB
```

---

## 2. EL MOTOR DE SINCRONIZACIÓN (`adSyncEngine.js`)

Ubicado en [src/services/adSyncEngine.js](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js). Gestiona la configuración, caché local y peticiones HTTP de publicidad.

### A. Claves de Almacenamiento Local Utilizadas
- `kioscoprox_offers_cache`: Array JSON con las campañas activas descargadas del servidor.
- `kioscoprox_ad_config`: Configuración de conexión (`enabled`, `supabaseUrl`, `syncIntervalMinutes`, `useTerminalSyncCampaigns`).
- `kioscoprox_daily_impressions`: Contador de impresiones locales para evitar saturación.
- `kioscoprox_merchant_registration`: Datos del comercio reportados al servidor.

### B. Ciclo de Descarga y Espejo Local (`syncCampaignsRemotely`)
1. **Comprobación de Estado:** Si `config.enabled === false` o el equipo no tiene red (`!navigator.onLine`), devuelve inmediatamente `getCachedCampaigns()`.
2. **Autenticación de Terminal:**
   - Si `useTerminalSyncCampaigns === true`, se comunica con `${terminalSyncUrl}/campaigns`.
   - Adjunta las cabeceras seguras `x-terminal-id` y `x-terminal-token` (credencial provista en la activación y custodiada en Windows DPAPI mediante `terminalIdentityService.js`).
3. **Persistencia en Caché:** Las campañas recibidas reemplazan el contenido de `kioscoprox_offers_cache`, permitiendo que la terminal muestre publicidad incluso si pasa semanas sin Internet.

---

## 3. EL HOOK DE CONSUMO Y ROTACIÓN (`useOfertas.js`)

Ubicado en [src/hooks/useOfertas.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useOfertas.js). Conecta los datos brutos con los componentes visuales del POS.

### A. Constantes de Exposición y Telemetría
- `IMPRESSION_COOLDOWN_MS = 5 * 60 * 1000` (5 minutos): Tiempo mínimo que debe transcurrir para volver a contabilizar una impresión de la misma campaña en la misma terminal.
- `DWELL_TIME_MS = 2000` (2 segundos): Tiempo mínimo que el banner debe permanecer visible en pantalla para que el evento se considere válido. Si el cajero cambia de pestaña antes de 2 segundos, la impresión se descarta.
- `CAMPAIGN_SYNC_INTERVAL_MS = 10 * 60 * 1000` (10 minutos): Intervalo periódico de sondeo en segundo plano para actualizar campañas.

### B. Algoritmo de Rotación Prioritaria Determinista (`buildPriorityRotationSequence`)
El hook no rota las campañas al azar. Utiliza el módulo [src/utils/stockOfferMatcher.js](file:///c:/Users/Pininas/KioscoProX/src/utils/stockOfferMatcher.js):
1. **Cruce con Inventario Real:** Inspecciona `kiosco.products` buscando artículos cuyo stock sea menor o igual al stock mínimo ($\text{stock} \le \text{minStock}$).
2. **Detección de Coincidencias Contextuales:** Si un mayorista tiene una campaña activa para un producto que el kiosco tiene agotado, esa campaña se marca como **Contextual / Prioritaria**.
3. **Secuencia Intercalada Equitativa:** Intercala ofertas contextuales con ofertas generales en una cadencia regular ($\approx 1 \text{ cada } 3 \text{ posiciones}$: `[Contextual, General, General]`) calculada mediante Mínimo Común Múltiplo (LCM), garantizando que las campañas generales no sufran inanición (*zero-starvation*).

---

## 4. INTERACCIÓN COMERCIAL: BOTÓN DE ACCIÓN (CTA WHATSAPP)

Tanto en el banner superior de `PuntoDeVenta.jsx` como en las tarjetas de `Ofertas.jsx`:
1. El usuario hace clic en *"Pedir por WhatsApp"*.
2. Se ejecuta `buildWhatsAppUrl(campaign, merchant)` en [src/services/adSyncEngine.js](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js):
   - Sanitiza el número de teléfono del distribuidor (código de país `549` para Argentina).
   - Genera un mensaje predeterminado codificado en URL:
     ```
     Hola [Distribuidor], soy [Nombre Comercio] de [Ciudad].
     Vi la oferta "[Título Campaña]" en Simple ProX y quiero realizar un pedido.
     ```
3. La llamada `window.open(url, '_blank')` es interceptada por [electron/main.js](file:///c:/Users/Pininas/KioscoProX/electron/main.js) (`setWindowOpenHandler`), que bloquea la creación de ventanas internas y abre el navegador web predeterminado del sistema operativo con WhatsApp Web / Desktop.
4. Se registra inmediatamente un evento de conversión de tipo `click_cta`.

---

## 5. COLA DE EVENTOS OFFLINE Y PATRÓN OUTBOX (`syncService.js`)

Ubicado en [src/services/syncService.js](file:///c:/Users/Pininas/KioscoProX/src/services/syncService.js). Resuelve el problema de registrar métricas cuando el comercio no tiene conexión a Internet.

### A. Estructura de la Cola Persistente
- **Cola Activa (`kioscoprox_outbox`):** Array de eventos pendientes de envío. Cada evento contiene:
  ```json
  {
    "id": "e4b3c2a1-0000-4000-8000-0123456789ab",
    "type": "ad_metric",
    "payload": {
      "campaign_id": "uuid-campaña",
      "installation_id": "spx_inst_...",
      "event_type": "impression",
      "event_time": "2026-11-18T20:00:00.000Z"
    },
    "attempts": 0,
    "createdAt": "2026-11-18T20:00:00.000Z"
  }
  ```
- **Cola de Letras Muertas (`kioscoprox_outbox_deadletter`):**
  Si un evento falla por un error definitivo (HTTP 400, campaña inexistente) o supera el límite de `MAX_RETRIES = 5`, es movido a la cola `deadletter` (capacidad máxima: 200 ítems) con el mensaje de error y timestamp, evitando reintentos infinitos que degraden el rendimiento.

### B. Parámetros de Despacho en Lote
- `OUTBOX_FLUSH_INTERVAL_MS = 600.000` ($10 \text{ minutos}$ entre sondeos normales).
- `OUTBOX_BATCH_THRESHOLD = 40`: Si la cola acumula 40 eventos, dispara el envío de forma anticipada.
- `OUTBOX_MAX_BATCH_SIZE = 50`: Límite máximo de eventos transmitidos por paquete HTTP a la Edge Function `/terminal-sync/events`.

---

## 6. IDEMPOTENCIA Y PROTECCIÓN CONTRA DUPLICACIÓN

### A. Generación de UUIDs en Origen
Cada evento publicitario recibe un identificador único global (UUID v4) en el momento exacto en que ocurre en la terminal (`crypto.randomUUID()`).

### B. Manejo de Fallas de Red y Reintentos
Si la terminal transmite un lote de 30 eventos a `/events`, el servidor los guarda pero la conexión se corta antes de que la terminal reciba la confirmación HTTP 200:
1. La terminal conservará el lote en la cola outbox y lo retransmitirá en el siguiente intento.
2. La Edge Function y PostgreSQL ejecutan la inserción mediante:
   ```sql
   INSERT INTO campaign_events (...) VALUES (...)
   ON CONFLICT (id) DO NOTHING;
   ```
3. Los registros previamente insertados son ignorados; no se duplican las impresiones ni se inflan artificialmente las estadísticas del mayorista.

---

## 7. DIFERENCIAS POR PLAN COMERCIAL (BÁSICO VS PRO)

- **Plan Básico:**
  - El banner publicitario en la cabecera de `PuntoDeVenta.jsx` es **obligatorio y permanente**.
  - La pestaña de `Ofertas.jsx` está disponible en la barra de navegación inferior.
- **Plan Pro:**
  - En `Configuracion.jsx`, se desbloquea el control de alternancia:
    ```javascript
    kiosco.businessConfig?.hideAds === true
    ```
  - Si `hideAds` está activo, `App.jsx` y `PuntoDeVenta.jsx` ocultan completamente los banners publicitarios, otorgando una interfaz limpia y libre de anuncios.

---

## 8. LÍMITES TÉCNICOS Y FUNCIONALIDADES PENDIENTES

1. **Sin Precarga de Imágenes Pesadas:** Los banners se descargan directamente desde URLs remotas al renderizarse; si la terminal tiene una conexión 3G rural muy lenta, la imagen puede tardar en cargar (se mitiga con la caché HTTP de Chromium).
2. **Interacción Unidireccional:** El comercio puede consultar ofertas y abrir WhatsApp, pero no puede confirmar pedidos ni enviar órdenes de compra estructuradas dentro del sistema (funcionalidad de pedidos B2B programada para fases posteriores).

---

## 9. PROTOCOLO DE PRUEBAS DE REGRESIÓN RECOMENDADO

1. **Prueba de Resistencia Offline:** Desconectar Internet; navegar en POS durante 15 minutos; verificar que los banners cacheados sigan rotando y que los eventos se acumulen en `localStorage.getItem('kioscoprox_outbox')`.
2. **Prueba de Despacho al Reconectar:** Reconectar Internet; verificar que `syncService` vacíe la cola outbox y que no se registren errores en consola.
3. **Prueba de Dwell Time:** Entrar a POS y cambiar a Clientes en menos de 1 segundo; verificar que **no** se haya generado un evento de impresión espurio.
4. **Prueba de Plan Pro:** Activar `hideAds: true` en Configuración; verificar desaparición inmediata del widget de anuncios en POS sin errores en React.
