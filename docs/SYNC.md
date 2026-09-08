# Guía de Sincronización y Patrón Outbox (`SyncService`)

## 1. Principio de Operación

La sincronización en Simple ProX está centralizada en `src/services/syncService.js`.
Ningún módulo realiza peticiones sueltas ni bloqueantes contra la nube.

```text
Operación Local (Métrica / Registro)
              │
              ▼
    Outbox Local (kioscoprox_outbox)
              │
      ¿Hay Conexión Real?
         ├── NO  ──► Permanece en cola local
         │
         └── SÍ  ──► Despacho idempotente a Supabase
                     ├── OK: Se elimina de la cola
                     └── ERROR: Reintento con backoff exponencial
```

---

## 2. Detección de Conectividad Activa (`ConnectivityService`)

- **Problema resuelto**: `navigator.onLine` devuelve `true` si la computadora está conectada a un router WiFi local, aun si la línea de Internet está cortada.
- **Solución**: `ConnectivityService` realiza una verificación HTTP activa contra el endpoint de Supabase con timeout estricto (2.5s).
- **Patrón Observer**: Expone `subscribeConnectivity(listener)` para reaccionar al instante cuando la conexión regresa.

---

## 3. Tipos de Operaciones en el Outbox

- `MERCHANT_REGISTER`: Alta y actualización de perfil del comercio en la tabla `merchants`.
- `CAMPAIGN_EVENT`: Impresiones, aperturas de oferta y clics a WhatsApp (enviados en lotes agrupados para máximo rendimiento).
- `HEARTBEAT`: Telemetría técnica periódica cada 30 minutos.
