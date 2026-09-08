# Registro de Decisiones y Cambios

## 2026-09-07 (FASE 11 - Evolución B2B: Carrito Multiproducto para Pedido Mayorista)
- **Fase**: FASE 11 — Evolución B2B (Paso C: Pedido Multiproducto Consolidado)
- **Problema**: 
  - Al armar pedidos a distribuidores, los comerciantes solo podían enviar consultas individuales por WhatsApp para un único producto a la vez. Cuando querían comprar 3 o 4 promociones diferentes de un mismo mayorista, debían enviar mensajes dispersos o tipear a mano el listado completo.
- **Solución**:
  1. `src/utils/b2bOrderFormatter.js`:
     - Función `groupB2BCartBySupplier()`: Agrupa automáticamente los ítems del carrito por distribuidor o mayorista.
     - Función `formatB2BOrderMessage()`: Redacta un mensaje prolijo y estructurado para WhatsApp con emojis, desglose de ítems, cantidades solicitadas, subtotales, monto total y datos de cabecera del comercio solicitante (nombre, dirección, ciudad, teléfono).
  2. `src/components/B2BCartModal.jsx`:
     - Modal especializado para el pedido B2B con barra de progreso interactiva de Compra Mínima (identifica si se alcanzó el monto o cuántos pesos faltan).
     - Controles de incremento/decremento de cantidades (`+` / `-`), botón para quitar ítems o vaciar el pedido completo.
     - Si hay ítems de diferentes proveedores, crea pestañas para enviar a cada mayorista su pedido correspondiente sin mezclarlos.
  3. `src/screens/Ofertas.jsx`:
     - Estado persistente `b2bCart` en `localStorage` (`kioscoprox_b2b_cart`).
     - Botón `[ 🛒 Pedido Mayorista (N) ]` en la cabecera superior con contador visual en vivo.
     - Botón `[ + Agregar Pedido ]` y selector de cantidad integrado en cada tarjeta de oferta.
     - Botón directo alternativo "Pedir solo este producto" para mantener la experiencia ágil individual.
  4. `src/components/OfertaDetailModal.jsx`:
     - Botón `[ + Agregar al Pedido ]` en el pie de la vista detallada de la oferta.
  5. `AGENTS.md` - Regla 1, 7 y 8:
     - El carrito B2B es 100% independiente del carrito de ventas del POS.
     - Funciona sin internet (offline-first con `localStorage`).
- **Archivos modificados / creados**:
  - `src/utils/b2bOrderFormatter.js` (nuevo)
  - `src/components/B2BCartModal.jsx` (nuevo)
  - `src/components/OfertaDetailModal.jsx`
  - `src/screens/Ofertas.jsx`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Compilación limpia con Vite (`npm run build`, 1.772 módulos, 0 errores).
  - Verificación de no-regresión en ventas locales, caja e inventario.
- **Resultado**: El kiosquero puede armar carritos de compra mayorista, verificar compras mínimas y enviar un pedido consolidado por WhatsApp en un solo clic.

## 2026-09-07 (FASE 11 - Evolución B2B: Integración Inteligente de Ofertas con Stock Mínimo)
- **Fase**: FASE 11 — Evolución B2B (Paso B: Sugerencias de Reposición por Stock Mínimo)
- **Problema**: 
  - Cuando un producto en el kiosco alcanzaba el nivel de stock mínimo o se agotaba, el comerciante debía darse cuenta manualmente, recordar qué mayorista lo vendía y buscar si había alguna promoción vigente en el catálogo B2B.
  - Conforme al principio de evolución de `AGENTS.md` (Regla 11), era necesario conectar el inventario y punto de venta con las oportunidades de compra mayorista sin ser intrusivo y sin bloquear la operación comercial offline del kiosco.
- **Solución**:
  1. `src/utils/stockOfferMatcher.js`:
     - Motor de coincidencia semántica en memoria (`findMatchingOfferForProduct` y `getLowStockReplenishmentOpportunities`).
     - Normaliza cadenas, elimina diacríticos/tildes y stop-words comerciales ('pack', 'caja', 'de', 'un', etc.).
     - Calcula ponderaciones por coincidencia exacta o de sub-cadena y bonus por categoría idéntica.
     - Filtra productos con `stock <= stockAlert` que tengan al menos una oferta activa afín y los ordena priorizando productos agotados (`stock === 0`).
  2. `src/screens/PuntoDeVenta.jsx`:
     - Banner superior de sugerencia de reposición inteligente: Si hay productos con stock crítico y una oferta mayorista compatible, se presenta un aviso estilizado con botones directos:
       - `[ Ver Oferta ]`: abre el modal oficial de detalle de la campaña B2B.
       - `[ Pedir WhatsApp ]`: abre chat con el proveedor con el mensaje comercial preformateado.
       - `[ ✕ ]`: descarta la sugerencia durante la sesión actual sin bloquear el flujo de ventas.
     - Modal de Alertas de Stock enriquecido con indicación de oferta disponible y accesos directos de reposición.
  3. `src/screens/Inventario.jsx`:
     - Se añadió la prop `ofertas` (conectada desde `App.jsx`).
     - Nueva tarjeta estadística interactiva: `[ Con Oferta B2B ]` con conteo en tiempo real de productos críticos que disponen de promociones mayoristas vigentes (al hacer clic filtra la tabla).
     - En la tabla de inventario, para cada fila con stock bajo que cuente con oferta mayorista, se agregó el botón de acción rápida `[ 🏷️ Reponer B2B ]` que abre la oferta del proveedor.
  4. `src/screens/Ofertas.jsx`:
     - Se incorporó el botón/filtro dinámico `[ 🚨 Reposición Stock (N) ]` en la barra de categorías para visualizar de un vistazo solo las campañas que reponen faltantes actuales del kiosco.
  5. `AGENTS.md` - Regla 1, 7 y 8:
     - 100% no bloqueante, funciona tanto online como offline (usando la caché local de campañas). No afecta cobros, cierres de caja ni creación de productos.
- **Archivos modificados**:
  - `src/utils/stockOfferMatcher.js`
  - `src/App.jsx`
  - `src/screens/PuntoDeVenta.jsx`
  - `src/screens/Inventario.jsx`
  - `src/screens/Ofertas.jsx`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Script de test unitario de matching semántico con casos reales (Fernet, Coca Cola, Cerveza, etc.).
  - `npm run build` exitoso (1.770 módulos transformados, 0 errores).
- **Resultado**: Integración fluida entre la necesidad de reposición local del kiosco y la compra mayorista B2B.

## 2026-09-07 (Corrección de Duplicación en Métrica de Ofertas Abiertas)
- **Fase**: FASE 7 — Métricas y Telemetría B2B
- **Problema**: 
  - Al hacer clic en "Detalles" de una oferta B2B, el contador de "Ofertas Abiertas" (`offer_open`) en las métricas del panel administrativo sumaba de a 2 o 3 eventos en lugar de 1.
  - Causa raíz:
    1. En `src/screens/Ofertas.jsx`, el botón "Detalles" carecía de `e.stopPropagation()`. Por lo tanto, al presionarlo se disparaba el `onClick` del botón y luego el evento burbujeaba al contenedor `<div onClick={() => openCampaignDetail(campaign)}>`, invocando la función dos veces en el mismo milisegundo.
    2. En `src/hooks/useOfertas.js`, `openCampaignDetail()` no contaba con un mecanismo de deduplicación o protección contra doble clic rápido o rebotes de eventos de interfaz.
- **Solución**:
  1. `src/screens/Ofertas.jsx`: Se agregó `e.stopPropagation()` en el botón "Detalles", igual que en los botones de WhatsApp y Guardar.
  2. `src/hooks/useOfertas.js`: Se incorporó una referencia `lastOpenTrackRef` con ventana de guarda de 1.500 ms por campaña en `openCampaignDetail()` y `lastWhatsAppTrackRef` en `handleWhatsAppClick()`, garantizando idempotencia estricta ante clics simultáneos o dobles clics.
- **Archivos modificados**:
  - `src/screens/Ofertas.jsx`
  - `src/hooks/useOfertas.js`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Compilación de producción con Vite (`npm run build` exitoso con 1.769 módulos).
  - Verificación de no-regresión en apertura de modales y enlaces de WhatsApp.
- **Resultado**: Cada apertura de detalle registra estrictamente 1 único evento `offer_open`.

## 2026-09-05 (Normalización y Agrupación de Campañas B2B por Mayorista en Ofertas)
- **Fase**: FASE 11 — Evolución B2B (Paso A: Catálogos por Mayorista)
- **Problema**: 
  - En la tarjeta del directorio de "Distribuidora MAC" figuraban solo "3 ofertas", cuando en la base de datos existían 5 ofertas activas creadas para ese mayorista.
  - Al abrir el catálogo del mayorista ("el banner"), solo se mostraban 3 tarjetas en la grilla en lugar de las 5 ofertas vigentes.
  - Causa raíz:
    1. Dos campañas en Supabase tenían nombres variantes o con errores de tipeo en el campo `supplier_name`: una decía `"MAC"` y otra `"distribuidora MAC"` (con 'd' minúscula) y otra `"Mayorista MIC"`.
    2. El agrupador y filtro de `Ofertas.jsx` realizaba comparaciones estrictas y sensibles a mayúsculas/minúsculas sin resolución canónica de alias, dejando fuera las campañas no idénticas a la cadena de texto base.
- **Solución**:
  1. Base de datos Supabase: Se unificó `supplier_name = 'Distribuidora MAC'` para las 5 campañas activas de bebidas (`🍺 6 Packs de Cerveza`, `🍺 Pack Latas de Cerveza`, `Pack Fernet x20`, `Pack Vinos x30`, `Packs Sidras x20`).
  2. `src/screens/Ofertas.jsx`:
     - Se implementó la función `normalizeSupplierName()` para resolver alias comunes (`MAC` -> `Distribuidora MAC`) y normalizar espacios y mayúsculas.
     - En `distributorList` se calcula la acumulación agrupando por el nombre canónico del mayorista.
     - En `filteredCampaigns` el filtro compara insensibilizando mayúsculas y aplicando la normalización canónica, permitiendo que tanto la tarjeta del directorio como la vista de catálogo muestren de forma coherente las 5 ofertas activas.
- **Archivos modificados**:
  - `src/screens/Ofertas.jsx`
  - Base de datos Supabase (`campaigns`)
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Simulación de agrupación con datos reales de Supabase: Distribuidora MAC pasa exactamente a 5 ofertas, Mayorista El Triunfo a 5 ofertas, etc.
  - `npm run build` exitoso (1.769 módulos sin errores).
- **Resultado**: Coherencia total entre el conteo de la tarjeta (5 ofertas) y las tarjetas mostradas en el banner/catálogo (5 tarjetas).

## 2026-09-05 (FASE 11 - Evolución B2B: Explorador de Catálogos y Directorio de Mayoristas)
- **Fase**: FASE 11 — Evolución B2B (Paso A: Catálogos por Mayorista)
- **Problema**: 
  - La pantalla de Ofertas del sistema KioscoProX únicamente mostraba promociones sueltas en una grilla plana de banners.
  - Los comerciantes no contaban con una vista estructurada para consultar qué mayoristas operan en la plataforma, qué condiciones comerciales y compra mínima tienen, ni podían explorar el catálogo consolidado de un proveedor específico ni contactarlo directamente para pedir listas completas de precios.
- **Solución**:
  1. `src/screens/Ofertas.jsx`:
     - Se incorporó un conmutador de navegación en la cabecera con dos vistas: `[ 🏷️ Promociones ]` y `[ 🏢 Mayoristas y Catálogos ]`.
     - Se unificó el listado de mayoristas combinando `b2b_distributors.json` con los distribuidores dinámicos presentes en campañas activas de Supabase.
     - Cada tarjeta de distribuidor expone: nombre, zona/cobertura, tipo de distribución, compra mínima, condiciones de despacho/plazos, badge de ofertas activas y dos botones de acción rápida:
       - **"Ver Catálogo"**: filtra y abre al instante todas las promociones vigentes de ese proveedor, con un banner azul contextual y botón "Volver a Todos los Mayoristas".
       - **"WhatsApp"**: abre conversación preformateada al número oficial del mayorista consultando por su catálogo mayorista actualizado para el kiosco.
  2. Compatibilidad y Regla 1:
     - No se alteró ningún módulo del POS, caja, inventario, clientes ni ventas.
- **Archivos modificados**:
  - `src/screens/Ofertas.jsx`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Compilación de producción con Vite (`npm run build` exitoso con 1769 módulos).
  - Verificación de renderizado en ambas vistas y retorno contextual.
- **Resultado**: El comercio dispone ahora de un directorio mayorista y explorador de catálogos B2B directo sin intermediarios invasivos.

## 2026-09-05 (Exportación de Reportes Comerciales y Regla de Licencias Básico vs Pro)
- **Fase**: FASE 10 / FASE 4 / FASE 17 — MVP Comercial, Reportes y Licencias
- **Problema**: 
  1. No existía forma de entregar reportes cuantitativos formales a los mayoristas para justificar la inversión publicitaria en la red de comercios.
  2. La regla de licenciamiento (Regla 17 de `AGENTS.md`) de permitir a los comercios con licencia PRO ocultar o activar los banners comerciales en caja no estaba reflejada en la interfaz de configuración del kiosco ni condicionada en el hook de ofertas.
- **Solución**:
  1. `panel-admin/index.html`:
     - Se incorporó el botón **"Exportar CSV"** en la barra de herramientas de Métricas, descargando un archivo con codificación UTF-8 con BOM (`\uFEFF`) y delimitadores listos para abrir directamente en Microsoft Excel o Google Sheets.
     - Se implementó un resumen con fecha/hora de emisión, período seleccionado, total de impresiones, ofertas abiertas, clics hacia WhatsApp y CTR global.
     - Se añadió el botón **"Imprimir / PDF"** con hoja de estilos `@media print` optimizada para impresión limpia de reportes comerciales.
  2. `src/hooks/useOfertas.js`:
     - Se condicionó el cálculo de `showAds`: en Plan Básico siempre se muestran los anuncios; en Plan Pro se respeta la preferencia `businessConfig.hideAds`.
  3. `src/screens/Configuracion.jsx`:
     - En la tarjeta del Plan, se agregó un switch interactivo para usuarios Pro ("Mostrar Ofertas y Banners en Caja") y un indicador de beneficio Pro para usuarios del Plan Básico.
- **Archivos modificados**:
  - `panel-admin/index.html`
  - `src/hooks/useOfertas.js`
  - `src/screens/Configuracion.jsx`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Comprobación de generación de formato CSV con BOM para Excel.
  - Validación lógica unitaria de los 4 casos de uso de licenciamiento (Básico vs Pro / hideAds on/off).
  - Compilación de producción con Vite (`npm run build`).
- **Resultado**: Panel con exportación comercial lista para presentar a mayoristas; regla de licencias Básico vs Pro integrada sin alterar ventas ni funciones de caja.


- **Fase**: FASE 4 / FASE 2 — Panel Administrador y Ciclo de Vida de Ofertas
- **Problema**: Al dar de baja una campaña con "Eliminar", se marcaba internamente con `status = 'deleted'`, pero en el panel no existía filtro para "Eliminadas". El filtro existente "🔴 Finalizadas" solo mostraba campañas vencidas cronológicamente (`end_date < hoy`). Como todas las campañas tenían vigencia futura, el filtro no devolvía resultados y las campañas descartadas quedaban en un limbo sin poder reactivarse.
- **Solución**:
  1. Se unificó la baja manual como "Finalizar Campaña", asignando `status: 'finished'`.
  2. En `computeCampaignStatus` y `getStatusBadge` se integró el reconocimiento de `finished` y `deleted` bajo el estado "🔴 Finalizada".
  3. En el menú de acciones se sustituyó "Eliminar" por "Finalizar" para ofertas activas, y se incorporó la acción "Reactivar" para ofertas finalizadas (extendiendo vigencia automáticamente por 30 días si estuviera vencida).
  4. En `src/utils/b2bUtils.js` se actualizó `getCampaignStatus` para que los clientes POS excluyan campañas finalizadas inmediatamente.
  5. En Supabase se normalizaron los registros con estado `deleted` a `finished`.
- **Archivos modificados**:
  - `panel-admin/index.html`
  - `src/utils/b2bUtils.js`
  - Base de datos Supabase (`campaigns`)
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Consulta en tiempo real de campañas en Supabase.
  - Validación de filtrado correcto en la pestaña "🔴 Finalizadas".
  - Compilación de producción con Vite (`npm run build`).
- **Resultado**: Ciclo de vida de ofertas completo y predecible; filtro "Finalizadas" 100% funcional con capacidad de reactivación.

## 2026-09-05 (Corrección de Raíz de Contabilización de Impresiones y Eventos en el Panel)
- **Fase**: FASE 7 / FASE 4 — Métricas y Panel Administrador
- **Problema**: Las impresiones totales en el panel se encontraban trabadas en 996 desde hacía días sin incrementar, y al recargar la página algunas campañas restaban impresiones.
- **Causa Raíz**:
  - Supabase PostgREST impone un límite de servidor inalterable de 1.000 filas por consulta (`max-rows = 1000`).
  - El panel solicitaba `/campaign_events?select=*&order=timestamp.desc&limit=100000`. PostgREST truncaba la respuesta a las 1.000 filas más recientes (en las cuales había 996 impresiones, 1 clic a WhatsApp y 3 aperturas).
  - Al ingresar nuevas impresiones desde los kioscos, los eventos más antiguos salían de la ventana de 1.000 filas, causando que campañas anteriores perdieran impresiones al refrescar.
- **Solución**:
  1. Se implementó paginación automática secuencial (`limit=${pageSize}&offset=${offset}`) en `fetchCampaignsFromSupabase()` dentro de `panel-admin/index.html`, leyendo todos los lotes de eventos sin tope.
  2. Se optimizó la consulta solicitando únicamente `campaign_id,event_type,timestamp`, reduciendo el ancho de banda en más del 70%.
  3. Se añadió un botón "Actualizar" con micro-animación en la barra de métricas.
  4. Se crearon los índices `idx_campaign_events_timestamp` y `idx_campaign_events_campaign_event` en Supabase PostgreSQL para acelerar las lecturas en milisegundos.
  5. Se ajustó la política RLS en Supabase para permitir lectura pública de estadísticas en caso de sesión caducada.
- **Archivos modificados**:
  - `panel-admin/index.html`
  - Base de datos Supabase (índices y políticas)
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - Validación con script de lectura de Supabase (de 996 a 4.746+ impresiones y 87 clics reales procesados).
  - `npm run build` sin errores.
- **Resultado**: Contabilización precisa, completa y acumulativa; el panel ya no se traba ni resta eventos al recargar.


- **Fase**: FASE 5 / FASE 9 / FASE 10 - Integración Electron, Pruebas y Distribución
- **Problema**: Se requería generar el instalador de cliente de Windows con todas las correcciones integradas: registro persistente de nuevos comercios, sincronización offline-first resiliente a fallas, y perfeccionamiento estético y responsivo del panel administrativo.
- **Solución**:
  1. Se actualizó la versión del aplicativo a `1.3.1` en `package.json` y `src/services/adSyncEngine.js` para permitir actualización transparente y sin conflictos con versiones previas (NSIS).
  2. Se empaquetó el instalador ejecutable de Windows con `electron-builder` (`npm run electron:dist`).
- **Archivos generados / modificados**:
  - `package.json`
  - `src/services/adSyncEngine.js`
  - `release/Simple ProX Setup 1.3.1.exe`
  - `docs/DECISIONS.md`
- **Resultado**: Instalador `Simple ProX Setup 1.3.1.exe` listo para distribución e instalación en kioscos y clientes.

## 2026-09-04 (Corrección de Raíz del Registro de Comercios y Datos de Instalación)
- **Fase**: FASE 3 / FASE 4 / FASE 5 / FASE 6 - Integración Supabase, Panel Admin y Offline
- **Problema**: 
  1. Al registrar o activar un nuevo kiosco, los datos cargados (nombre, teléfono, dirección, instalador) no llegaban al Panel Administrador o se visualizaban vacíos/guiones (`-`, `No especificada`).
  2. Causa raíz en `adSyncEngine.js`: En `registerMerchantRemotely`, cuando un kiosco hacía heartbeat o sincronización periódica sin datos explícitos pasados como argumento, enviaba `{ address: '', phone: '', installer: '' }`. Al usar `Prefer: resolution=merge-duplicates` (UPSERT en Supabase PostgREST), Postgres sobrescribía las columnas existentes con cadenas vacías, borrando los datos de la instalación original.
  3. En `ActivationGuard.jsx`, el registro remoto se disparaba dentro de un `setTimeout` no esperado (`await`) de 1 segundo; si la pantalla completaba la transición antes, la petición de red se cancelaba o quedaba huérfana.
  4. En `Configuracion.jsx`, no existían campos para editar teléfono y dirección del comercio ni se propagaban los cambios a Supabase.
  5. En `panel-admin/index.html`, no existía buscador en la tabla de comercios ni opciones para editar datos incompletos o eliminar registros de prueba.
- **Solución**:
  1. `src/services/adSyncEngine.js`:
     - Se corrigió el payload enviado a Supabase: nunca se envían claves con valores vacíos o nulos en operaciones de upsert, evitando que heartbeats o comprobaciones posteriores sobrescriban datos existentes.
     - Se añadió fallback multinivel de lectura en `localStorage` (`kioscoprox_business_config`, `kioscoprox_merchant_registration`, `activationData`).
     - Resiliencia offline: si la conexión falla o el endpoint no responde, se guarda el registro en cola (`PENDING_MERCHANT_SYNC`) para reintento automático en la próxima reconexión.
  2. `src/components/ActivationGuard.jsx`:
     - Se eliminó el `setTimeout` arbitrario y se aseguró la sincronización inmediata y esperada (`await registerMerchantRemotely`) guardando simultáneamente en `localStorage`.
  3. `src/screens/Onboarding.jsx`:
     - Se aseguró la persistencia de dirección, teléfono e instalador en la finalización del onboarding.
  4. `src/screens/Configuracion.jsx`:
     - Se agregaron campos de `Dirección` y `Teléfono / WhatsApp` en la configuración general del kiosco, disparando sincronización remota inmediata al guardar.
  5. `panel-admin/index.html`:
     - Se añadió un buscador en tiempo real en la tabla de comercios registrados.
     - Se agregaron acciones de "Editar" y "Eliminar" con modal interactivo para corregir datos o depurar kioscos de prueba directamente en Supabase.
- **Archivos modificados**:
  - `src/services/adSyncEngine.js`
  - `src/components/ActivationGuard.jsx`
  - `src/screens/Onboarding.jsx`
  - `src/screens/Configuracion.jsx`
  - `panel-admin/index.html`
  - `docs/DECISIONS.md`
- **Pruebas realizadas**:
  - `npm run build` exitoso sin errores ni advertencias de compilación.
  - Validación de compatibilidad con Supabase REST API (PATCH / DELETE / UPSERT merge-duplicates).
- **Resultado**: Los comercios nuevos y actualizados registran y conservan permanentemente todos sus datos de instalación sin riesgo de sobreescritura accidental, con capacidad de edición y búsqueda desde el panel de control.

## 2026-09-04 (Mejora Estética de Buscadores y Corrección Búsqueda Métricas)
- **Fase**: FASE 4 / FASE 7 - Panel Administrador y Métricas
- **Problema**: 
  1. En la pestaña Campañas, el buscador ocupaba el 100% del ancho forzando saltos de línea desproporcionados respecto a los filtros y pills.
  2. En Métricas y Clics, el buscador se solapaba sobre el selector de "Todo el Historial" debido a variables CSS huérfanas antes del selector `*` que invalidaban la regla `box-sizing: border-box`, provocando que el input se calculara como `content-box` y desbordara horizontal y verticalmente.
  3. En Métricas y Clics, la función de búsqueda en tiempo real arrojaba una excepción `TypeError: Assignment to constant variable` al reasignar `const metricsData` dentro del filtro, dejando la tabla en blanco y sin responder.
- **Solución**:
  1. Se eliminó el bloque CSS corrupto para restaurar el modelo de caja universal (`box-sizing: border-box`) y se agregó `box-sizing: border-box` explícito en `.form-control` y en los inputs en línea.
  2. Se ajustó el contenedor a ancho fijo (200px con `flex-shrink: 0`), altura 36px y relleno interior adecuado para que no desborde ni se monte sobre el dropdown de Historial.
  3. Se corrigió la declaración a `let metricsData`, se amplió la búsqueda para incluir también categorías y se añadió mensaje amigable cuando no haya resultados que coincidan.
- **Archivos modificados**:
  - `panel-admin/index.html`
- **Pruebas realizadas**:
  - Verificación de sintaxis de JavaScript mediante ejecución con Node.js (`Script OK`).
  - Filtrado en tiempo real probado.
- **Resultado**: Interfaz del panel de control limpia y proporcionada, buscador de métricas alineado y 100% operativo sin solapamiento ni errores de consola.

## 2026-08-29 (Mejora Atribución de Consultas WhatsApp B2B)
- **Fase**: FASE 3/4/7 - Sistema de Ofertas B2B
- **Problema**: El mensaje generado para solicitar una oferta por WhatsApp carecía de un identificador de campaña, y se presentaban ocasionalmente problemas de codificación (emojis rotos) al generar el enlace.
- **Solución**: 
  1. Se implementó la generación de códigos de campaña (`campaignCode`) de forma determinista para campañas antiguas, utilizando un substring de su UUID.
  2. Se actualizó el generador del mensaje de WhatsApp para adjuntar: `Código de oferta: {campaignCode}` preservando correctamente el uso de la codificación en URL (UTF-8) para los emojis.
  3. Se añadió visualización de `Código de oferta` y botón "Copiar" dentro del modal de detalle de oferta B2B.
- **Archivos modificados**:
  - `src/utils/b2bUtils.js`
  - `src/services/adSyncEngine.js`
  - `src/hooks/useOfertas.js`
  - `src/components/OfertaDetailModal.jsx`
- **Resultado**: Seguimiento de campañas más preciso para mayoristas al recibir contactos, retrocompatibilidad con campañas anteriores y flujo validado con soporte de emojis.

## 2026-08-28 (Gestión de Distribuidores desde el Panel)
- **Fase**: FASE 4 - Panel administrador
- **Problema**: Los distribuidores se encontraban estáticos en `public/b2b_distributors.json` y no podían ser administrados dinámicamente desde el panel.
- **Solución**: Se agregó una nueva pestaña "Distribuidores" en el panel de administración B2B. Incluye funcionalidad completa de CRUD, caché local (`localStorage`) para persistencia, soporte de sincronización con Supabase (en la tabla `distributors`) y exportación a JSON. Las selecciones de distribuidores al crear campañas se actualizaron para recargarse dinámicamente.
- **Archivos modificados**: 
  - `panel-admin/index.html`

## 2026-08-27 (Mejora Integral del Sistema B2B)
- **Fase**: FASES 1 a 11 - Sistema de Ofertas B2B
- **Problema**: 
  1. Inconsistencias en nombres de distribuidores y categorías dispersas sin fuente única.
  2. Los descuentos no se calculaban automáticamente con fórmula matemática uniforme ni se mostraba ahorro explícito.
  3. El panel administrador carecía de acciones completas (Editar, Duplicar como borrador, Soft-delete, Fechas de vigencia, Programación, Filtros de estado y Filtros por periodo en métricas).
  4. El dashboard del kiosco no exponía menú "Más ▾" para categorías secundarias ni datos B2B como compra mínima o condiciones de entrega.
- **Solución**:
  1. Se crearon catálogos centralizados `public/b2b_categories.json` y `public/b2b_distributors.json`.
  2. Se centralizó la fórmula `((regularPrice - price) / regularPrice) * 100` y el cálculo de ahorro en `src/utils/b2bUtils.js`.
  3. Se profesionalizó `panel-admin/index.html` con CRUD completo (Crear, Editar, Duplicar, Soft-delete, Pausar/Activar), cálculo de estados (`active`, `scheduled`, `paused`, `finished`, `draft`, `deleted`), filtros avanzados, previsualización fiel y métricas por periodo (Hoy, 7d, 30d, Mes) con ordenamiento y detalle de KPIs.
  4. Se actualizó `src/screens/Ofertas.jsx` y `src/components/OfertaDetailModal.jsx` con el menú "Más ▾", mensajes dinámicos de WhatsApp y soporte para condiciones B2B.
- **Archivos modificados**: 
  - `public/b2b_categories.json`
  - `public/b2b_distributors.json`
  - `src/utils/b2bUtils.js`
  - `src/services/adSyncEngine.js`
  - `src/components/OfertaDetailModal.jsx`
  - `src/screens/Ofertas.jsx`
  - `panel-admin/index.html`
  - `docs/ROADMAP.md`
- **Pruebas realizadas**: 
  - Pruebas unitarias de fórmula de descuento (29.000 -> 23.000: 20,7% OFF; 25.000 -> 15.000: 40% OFF; 17.800 -> 14.500: 18,5% OFF).
  - Compilación exitosa del frontend (`npm run build` sin errores).
- **Resultado**: Sistema B2B completamente operativo, robusto, modular y 100% retrocompatible sin afectar el funcionamiento del POS ni el modo offline.

## 2026-09-07 (Arquitectura de Instalación Masiva, Identidad, Geografía, Remote Config y AutoUpdate)
- **Fase**: FASE 12 - Arquitectura e Infraestructura de Distribución
- **Problema**: 
  1. Preparar Simple ProX para ser instalado físicamente en cientos de comercios sin necesidad de visitas técnicas presenciales.
  2. Riesgo de invalidar licencias existentes si se alteraba el `installationId` (`LTMEI6YT`, `WG6KX8UI`, etc.).
  3. Necesidad de separar la identidad del comercio (`commerceId`) de la terminal (`installationId`) para admitir multi-caja.
  4. Segmentación geográfica precisa para campañas mayoristas B2B dentro de Argentina sin depender de APIs geográficas externas en tiempo de ejecución (offline-first).
  5. Sincronización asíncrona segura con cola Outbox y telemetría no invasiva (heartbeat cada 30 min sin datos sensibles).
  6. Modificación dinámica de parámetros de la app (intervalos de banner, flags B2B) en caliente desde la nube sin tocar el código del POS.
  7. Actualización silenciosa de binarios mediante `electron-updater` con la regla de oro: nunca reiniciar mientras la caja registradora esté abierta (`caja.isOpen`).
- **Solución**:
  1. Se implementó `src/services/installationService.js` garantizando la inmutabilidad de `installationId` existentes y generando UUIDv4 para instalaciones nuevas. Se creó el modelo `CommerceProfile` (`commerceId`).
  2. Se creó `src/utils/argentinaGeo.js` con las 24 provincias argentinas (códigos ISO AR-*) y principales localidades 100% offline.
  3. Se adaptó el Onboarding en 3 pasos simples y se integró edición de ubicación y comprobación de software en `Configuracion.jsx`.
  4. Se desarrolló `connectivityService.js` con ping HTTP real a Supabase (timeout 2.5s) y estados reactivos.
  5. Se implementó `syncService.js` con cola Outbox persistente en `localStorage`, backoff exponencial, idempotencia y heartbeat periódico sin datos de clientes ni ventas.
  6. Se implementó `remoteConfigService.js` con caché local, validación estricta de tipos y fallback a configuración por defecto.
  7. Se integró `electron-updater` v6.8.9 en Electron Main (`electron/main.js`), puente seguro en Preload (`electron/preload.cjs`) y monitor con bloqueo de reinicio por caja abierta en `updateService.js`.
  8. Se actualizó la tabla `merchants` y se creó `remote_config` en Supabase con RLS público.
  9. Se extendió el panel administrativo `panel-admin/index.html` con columnas de geolocalización, versión instalada, estado de conexión y filtros.
  10. Se creó documentación completa en `docs/` (`ARCHITECTURE.md`, `INSTALLATION.md`, `SYNC.md`, `REMOTE_CONFIG.md`, `AUTO_UPDATE.md`).
- **Archivos modificados / creados**:
  - `src/services/installationService.js`
  - `src/utils/argentinaGeo.js`
  - `src/services/connectivityService.js`
  - `src/services/syncService.js`
  - `src/services/remoteConfigService.js`
  - `src/services/updateService.js`
  - `src/services/adSyncEngine.js`
  - `src/screens/Onboarding.jsx`
  - `src/screens/Configuracion.jsx`
  - `src/hooks/useOfertas.js`
  - `src/utils/b2bUtils.js`
  - `electron/main.js`
  - `electron/preload.cjs`
  - `panel-admin/index.html`
  - `package.json`
  - `docs/*`
- **Pruebas realizadas**:
  - Script de pruebas `scratch/verify_architecture.mjs`: 14/14 pruebas pasadas (geografía, determinismo de licencias de terminales reales, matching B2B y remote config).
  - Compilación `npm run build`: 1778 módulos en 9.59s, 0 errores.
- **Resultado**: Aplicación lista para despliegue masivo en comercios físicos, con auto-actualización protegida, configuración remota dinámica, targeting geográfico B2B y cero regresiones en el POS offline.

## 2026-09-08 (Integración GitHub, Servidor MCP y Hosting de Releases)
- **Fase**: FASE 12 - Infraestructura y Distribución
- **Problema**: 
  1. El instalador ejecutable `.exe` (`Simple ProX Setup 1.3.2.exe`, ~197 MB) excedía el límite de 50 MB por objeto de la capa gratuita de Supabase Storage.
  2. Necesidad de automatizar la distribución, control de versiones y publicación de releases sin requerir tokens secretos embebidos en el cliente Electron.
- **Solución**:
  1. Se configuró el servidor MCP oficial `@modelcontextprotocol/server-github` en `~/.gemini/config/mcp_config.json` con autenticación mediante PAT de la cuenta `@cristian-bus`.
  2. Se creó el repositorio público oficial en GitHub: `https://github.com/cristian-bus/simple-prox`.
  3. Se inicializó Git en el proyecto local, excluyendo archivos compilados pesados en `.gitignore` (`release/`, `scratch/`, `*.exe`).
  4. Se actualizó la configuración de `publish` en `package.json` hacia el proveedor nativo `github` (`owner: cristian-bus`, `repo: simple-prox`).
  5. Se publicó la primera Release oficial `v1.3.2` en GitHub con sus 3 artefactos: `Simple.ProX.Setup.1.3.2.exe`, `Simple.ProX.Setup.1.3.2.exe.blockmap` y `latest.yml`.
  6. Se verificó la disponibilidad pública de descarga directa sin autenticación (HTTP 200).
- **Archivos modificados**:
  - `package.json`
  - `.gitignore`
  - `docs/AUTO_UPDATE.md`
  - `docs/DECISIONS.md`
  - `~/.gemini/config/mcp_config.json`
- **Resultado**: Canal de AutoUpdate completamente operativo, gratuito y robusto con hosting de alta disponibilidad en GitHub Releases.

