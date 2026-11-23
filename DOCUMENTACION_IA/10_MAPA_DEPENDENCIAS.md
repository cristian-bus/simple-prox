# MAPA INTEGRAL DE DEPENDENCIAS Y MATRIZ DE IMPACTO CRUZADO

> **Documento:** `DOCUMENTACION_IA/10_MAPA_DEPENDENCIAS.md`  
> **Estado:** `[IMPLEMENTADO]` / `[INSPECCIONADO]`  
> **Referencia de Código:** Commit `4e145bba6b4553c289727a90c569124bef8ed24b` + rama `security/phase-0.2.2-event-idempotency`  
> **Regla de oro (AGENTS.md):** Antes de modificar una sola línea de código, consultar este mapa para identificar las dependencias directas e indirectas y planificar la prueba de regresión mínima.

---

## 1. VISIÓN GENERAL DE ACOPLAMIENTO DEL SISTEMA

El núcleo comercial de Simple ProX se articula alrededor del hook maestro [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js). Todas las pantallas leen y despachan mutaciones a través de este canal unificado.

```mermaid
flowchart TD
    subgraph UI_Modules ["Pantallas y Submódulos UI"]
        POS["PuntoDeVenta.jsx"]
        PROD["Productos.jsx"]
        INV["Inventario.jsx"]
        COMP["Compras.jsx"]
        TURN["Turnos.jsx"]
        CLI["Clientes.jsx"]
        REP["Reportes.jsx"]
        CONF["Configuracion.jsx"]
        OFER["Ofertas.jsx"]
        USER["Usuarios.jsx"]
    end

    subgraph StateHub ["Canal Unificado de Estado"]
        HOOK["useKiosco.js"]
    end

    subgraph CoreEntities ["Entidades Compartidas (localStorage)"]
        E_PROD[("products")]
        E_SALE[("sales")]
        E_PURCH[("purchases")]
        E_CLI[("clients")]
        E_CAJA[("caja")]
        E_SHIFT[("shifts")]
        E_CONF[("businessConfig")]
        E_RES[("reservations")]
    end

    POS -->|addSale, checkoutReservation| HOOK
    PROD -->|addProduct, updateProduct| HOOK
    INV -->|updateProduct (stock)| HOOK
    COMP -->|addPurchase, updatePurchase| HOOK
    TURN -->|updateCaja, closeCajaAndSaveShift| HOOK
    CLI -->|addClient, payDebt, deleteClient| HOOK
    CONF -->|updateBusinessConfig, clearAllData| HOOK

    HOOK <--> E_PROD
    HOOK <--> E_SALE
    HOOK <--> E_PURCH
    HOOK <--> E_CLI
    HOOK <--> E_CAJA
    HOOK <--> E_SHIFT
    HOOK <--> E_CONF
    HOOK <--> E_RES
```

---

## 2. MATRIZ TÉCNICA DETALLADA POR MÓDULO

---

### M1. Punto de Venta y Facturación (`PuntoDeVenta.jsx`)
* **Archivos Reales:**
  - [src/screens/PuntoDeVenta.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/PuntoDeVenta.jsx)
  - [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js) (`addSale`, `payDebt`, `checkoutReservation`)
  - [src/components/OfertasBannerWidget.jsx](file:///c:/Users/Pininas/KioscoProX/src/components/OfertasBannerWidget.jsx)
* **Datos Compartidos:**
  - Lee: `products`, `clients`, `caja`, `businessConfig`, `activeUser`, `reservations`.
  - Escribe: `sales`, `products` (stock), `caja` (efectivo), `clients` (deuda en fiado Pro), `reservations` (estado 'Completado').
* **Dependencias Directas:**
  - `addSale` en `useKiosco.js`: si se altera el formato de `saleData`, impacta en la actualización de caja, stock de combos e histórico de ventas.
  - Bandera global `window.__ACTIVE_SALE__`: consultada por `App.jsx` para no bloquear por licencia durante un cobro.
* **Riesgos de Regresión:**
  - Redondeo erróneo en totales de ticket o cobros mixtos.
  - Venta de combos que no descuente el stock de sus componentes (`components`).
  - Pérdida de foco en lectores de código de barras.
* **Funcionalidades que Deben Permanecer Intactas:** Cobro en efectivo, atajos de teclado F1 a F12, cobro de deuda de clientes, visualización del banner B2B.
* **Pruebas Necesarias Post-Cambio:**
  1. Venta en efectivo $\rightarrow$ verificar suma exacta en `caja.efectivo` y resta de stock.
  2. Venta a fiado (Plan Pro) $\rightarrow$ verificar suma exacta en `client.deuda`.
  3. Cierre con Escape en apertura de caja $\rightarrow$ verificar que el modal se cierre limpiamente.

---

### M2. Productos, Catálogo y Stock (`Productos.jsx`, `Inventario.jsx`)
* **Archivos Reales:**
  - [src/screens/Productos.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Productos.jsx)
  - [src/screens/Inventario.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Inventario.jsx)
  - [src/utils/stockOfferMatcher.js](file:///c:/Users/Pininas/KioscoProX/src/utils/stockOfferMatcher.js)
* **Datos Compartidos:**
  - `kioscoprox_products`, `kioscoprox_categories`.
* **Dependencias Directas:**
  - `PuntoDeVenta.jsx`: busca artículos por `code`, `sku` o `id`.
  - `Compras.jsx`: actualiza costo, stock y precio final manteniendo el margen.
  - `stockOfferMatcher.js`: audita productos con $\text{stock} \le \text{minStock}$ para priorizar ofertas mayoristas.
* **Riesgos de Regresión:**
  - Alterar la fórmula de precio de venta: $\text{Precio} = \text{Costo} \times (1 + \text{Margen}/100)$.
  - Ruptura del parser de importación masiva en Excel (`batchImportProducts`).
* **Funcionalidades Protegidas:** Límite de 500/1000 productos en Plan Básico y 2500 en Plan Pro; soporte de código de barras.
* **Pruebas Post-Cambio:** Crear producto, venderlo en POS, ajustar stock en Inventario, verificar cálculo de rentabilidad en Reportes.

---

### M3. Caja y Turnos (`Turnos.jsx`, `useKiosco.js`)
* **Archivos Reales:**
  - [src/screens/Turnos.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Turnos.jsx)
  - [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js) (`updateCaja`, `closeCajaAndSaveShift`)
  - [src/services/updateService.js](file:///c:/Users/Pininas/KioscoProX/src/services/updateService.js) (`applyUpdateSafe`)
* **Datos Compartidos:**
  - `kioscoprox_caja`, `kioscoprox_shifts`.
* **Dependencias Directas:**
  - `PuntoDeVenta.jsx`: suma efectivo de ventas de contado.
  - `Compras.jsx`: resta efectivo de compras de contado.
  - `Clientes.jsx`: suma efectivo al saldar deudas de clientes.
  - `updateService.js`: bloquea actualizaciones si `caja.isOpen === true`.
* **Riesgos de Regresión:**
  - Discrepancias entre el arqueo real contado y el esperado contable.
  - Cierre de caja que no resetee los movimientos o deje `caja.isOpen: true`.
* **Funcionalidades Protegidas:** Cierre X y Cierre Z; exportación e impresión de resumen de turno.
* **Pruebas Post-Cambio:** Abrir turno con fondo inicial, registrar venta en efectivo, compra en efectivo y cobro de fiado; cerrar turno y comprobar balance exacto.

---

### M4. Clientes y Cuentas Corrientes (`Clientes.jsx`)
* **Archivos Reales:**
  - [src/screens/Clientes.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Clientes.jsx)
  - [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js) (`addClient`, `payDebt`, `deleteClient`, `batchImportClients`)
* **Datos Compartidos:**
  - `kioscoprox_clients`, `kioscoprox_sales`, `kioscoprox_caja`.
* **Dependencias Directas:**
  - `PuntoDeVenta.jsx`: asignación de cliente y acumulación de fiado (Plan Pro).
  - Bloqueos de eliminación en `useKiosco.js`: validaciones estrictas para Consumidor Final, deuda activa (`HAS_DEBT`) o ventas históricas (`HAS_SALES`).
* **Riesgos de Regresión:**
  - Permitir borrar un cliente con deuda activa, perdiendo el saldo deudor de forma irrecuperable.
  - Cobrar fiado sin registrar el movimiento de ingreso (`deposit`) en la caja abierta.
* **Funcionalidades Protegidas:** Importación y exportación de clientes a Excel con deduplicación por CUIT/Nombre.
* **Pruebas Post-Cambio:** Intentar borrar Consumidor Final $\rightarrow$ debe fallar; saldar deuda en efectivo $\rightarrow$ verificar incremento en caja; exportar a Excel $\rightarrow$ verificar formato.

---

### M5. Compras y Proveedores (`Compras.jsx`)
* **Archivos Reales:**
  - [src/screens/Compras.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Compras.jsx)
  - [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js) (`addPurchase`, `updatePurchase`)
* **Datos Compartidos:**
  - `kioscoprox_purchases`, `kioscoprox_products`, `kioscoprox_caja`, `kioscoprox_suppliers`.
* **Dependencias Directas:**
  - Actualización automática de `stock` y `cost` de productos.
  - Rollback exacto en `updatePurchase`: desanda los valores previos de stock y caja antes de aplicar la modificación.
* **Riesgos de Regresión:** Desfase de stock o doble deducción de caja al editar un comprobante de compra previo.
* **Pruebas Post-Cambio:** Registrar compra en efectivo, verificar aumento de stock y baja en caja; editar la compra reduciendo la cantidad, verificar reajuste correcto de ambos.

---

### M6. Licencias, Activación y Ciclo de Vida (`ActivationGuard.jsx`, `licenseCrypto.js`)
* **Archivos Reales:**
  - [src/components/ActivationGuard.jsx](file:///c:/Users/Pininas/KioscoProX/src/components/ActivationGuard.jsx)
  - [src/utils/licenseCrypto.js](file:///c:/Users/Pininas/KioscoProX/src/utils/licenseCrypto.js)
  - [src/services/installationService.js](file:///c:/Users/Pininas/KioscoProX/src/services/installationService.js)
  - [src/App.jsx](file:///c:/Users/Pininas/KioscoProX/src/App.jsx) (`checkLicense()`)
* **Datos Compartidos:**
  - `kioscoprox_installation_id`, `kioscoprox_license_token`, `kioscoprox_business_config`.
* **Dependencias Directas:**
  - `App.jsx`: si `checkLicense()` falla o `businessConfig.isActivated` es falso, oculta todo el POS y monta `ActivationGuard`.
  - `Configuracion.jsx`: botón de activación Pro (`isValidProLicense`).
* **Riesgos de Regresión:**
  - El defecto crítico de "pérdida aparente de activación" si una función sobrescribe `businessConfig` sin propagar `isActivated: true`.
* **Pruebas Post-Cambio:** Modificar perfil comercial en Configuración, cerrar y reabrir Electron $\rightarrow$ verificar que la aplicación continúe activada sin solicitar clave.

---

### M7. Publicidad B2B y Telemetría (`adSyncEngine.js`, `useOfertas.js`)
* **Archivos Reales:**
  - [src/services/adSyncEngine.js](file:///c:/Users/Pininas/KioscoProX/src/services/adSyncEngine.js)
  - [src/services/syncService.js](file:///c:/Users/Pininas/KioscoProX/src/services/syncService.js)
  - [src/hooks/useOfertas.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useOfertas.js)
  - [src/components/OfertasBannerWidget.jsx](file:///c:/Users/Pininas/KioscoProX/src/components/OfertasBannerWidget.jsx)
* **Datos Compartidos:**
  - `kioscoprox_offers_cache`, `kioscoprox_outbox`, `kioscoprox_outbox_deadletter`.
* **Dependencias Directas:**
  - Supabase Edge Function `/terminal-sync`: ingesta de eventos y descarga de campañas.
  - `PuntoDeVenta.jsx` y `Ofertas.jsx`: renderizado visual.
* **Riesgos de Regresión:** Bloqueo del renderizado por fallas de red; desborde de memoria en la cola outbox.
* **Pruebas Post-Cambio:** Probar funcionamiento con red desconectada, verificar acumulación en outbox y retransmisión al reconectar.

---

### M8. Respaldos y Recuperación (`backupService.js`, `safeBackupWriter.js`, `RecoveryGuard.jsx`)
* **Archivos Reales:**
  - [src/services/backupService.js](file:///c:/Users/Pininas/KioscoProX/src/services/backupService.js)
  - [electron/safeBackupWriter.js](file:///c:/Users/Pininas/KioscoProX/electron/safeBackupWriter.js)
  - [src/services/recoveryService.js](file:///c:/Users/Pininas/KioscoProX/src/services/recoveryService.js)
  - [src/components/RecoveryGuard.jsx](file:///c:/Users/Pininas/KioscoProX/src/components/RecoveryGuard.jsx)
* **Datos Compartidos:**
  - Todas las claves de `localStorage`.
* **Dependencias Directas:**
  - Proceso Principal de Electron (`main.js`): handlers IPC para escritura atómica en disco y diario de snapshots.
  - `src/main.jsx`: monta `RecoveryGuard` en el nivel 0.
* **Riesgos de Regresión:**
  - Sobreescritura involuntaria de `installationId` al restaurar un `.spx`.
  - Fallo en el cálculo o validación del hash SHA-256.
* **Pruebas Post-Cambio:** Exportar backup comercial, restaurarlo en un perfil limpio, verificar integridad de todas las entidades.

---

### M9. Submódulo de Reservas y Encargos (`reservations`)
* **Archivos Reales:**
  - [src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js) (`addReservation`, `updateReservation`, `deleteReservation`, `checkoutReservation`)
  - [src/screens/PuntoDeVenta.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/PuntoDeVenta.jsx)
* **Datos Compartidos:**
  - `kioscoprox_reservations`.
* **Dependencias Directas:**
  - `addSale`: si `saleData.linkedReservationId` está presente, marca la reserva como `'Completado'`.
* **Riesgos de Regresión:** Reservas cobradas en POS que no cambien de estado o se mantengan como pendientes.
* **Pruebas Post-Cambio:** Cargar una reserva de mercadería, enviarla al carrito de POS (`checkoutReservation`), cobrarla y verificar actualización de estado.

---

## 3. DEPENDENCIAS QUE REQUIEREN INVESTIGACIÓN ADICIONAL

1. **Drivers Físicos de Ticketeadoras Térmicas:**
   La interacción entre el formateador de texto en `Configuracion.jsx` (58mm vs 80mm) y el diálogo nativo de impresión de Chromium (`window.print()`). Se desconoce el comportamiento exacto ante drivers genéricos de Windows con cortes automáticos de papel.
2. **Escáneres de Barras con Teclados Especiales:**
   En terminales donde el lector de barras envía secuencias `Suffix` personalizadas distintas a `Enter` (ej. `Tab` o caracteres de control ASCII), el listener de teclado en `PuntoDeVenta.jsx` requiere verificación física en hardware real.
