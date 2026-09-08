# Guía y Protocolos de Pruebas Obligatorias - KioscoProX

En cumplimiento de las Reglas 24 y 25 de `AGENTS.md`, toda modificación en el código fuente debe someterse a los protocolos de verificación definidos a continuación.

Una tarea **NO** está terminada simplemente porque compila; debe probarse funcionalmente, verificar regresiones y documentar los resultados.

---

## 1. Protocolo Obligatorio para el Núcleo del POS

Ante cualquier cambio que toque componentes del punto de venta o servicios compartidos, es obligatorio comprobar como mínimo:

1. **Inicio de la aplicación**: Apertura limpia sin errores en consola ni excepciones de Electron.
2. **Inicio de sesión / Autenticación**: Validación de credenciales locales de usuario.
3. **Creación / Edición de producto**: Crear un producto de prueba con código de barra, precio de costo y venta.
4. **Venta de producto en Caja**: Agregar producto al carrito, seleccionar método de pago y finalizar cobro con ticket/impresión.
5. **Modificación de Stock**: Verificar que la venta descuente stock y que la modificación manual en inventario se refleje de inmediato.
6. **Consulta de Stock**: Buscar producto por código y descripción en la pantalla de Productos.
7. **Cierre de Caja**: Realizar arqueo y cierre de turno validando los totales en caja.
8. **Reinicio de la aplicación**: Cerrar y volver a abrir verificando que no se hayan perdido datos ni configuraciones locales.

---

## 2. Protocolo de Pruebas de Conectividad y Resiliencia Online

Para funcionalidades de publicidad, sincronización y métricas B2B:

1. **Internet Disponible (Online)**:
   - Las campañas se descargan correctamente de Supabase y se guardan en el caché local.
   - Los eventos de impresión y clics se sincronizan en tiempo real.
2. **Internet Desconectado (Offline)**:
   - Desactivar red/Wi-Fi: el POS debe seguir operando al 100%.
   - Los banners se cargan desde el caché local `localStorage`.
   - Las métricas se encolan en `kioscoprox_pending_events` sin arrojar errores visibles al usuario.
3. **Recuperación de Conexión**:
   - Reactivar red: la cola acumulada se envía automáticamente al backend de forma idempotente sin duplicados.
4. **API o Supabase Caído / Error HTTP**:
   - La aplicación maneja el fallo con gracia y continúa trabajando con datos cacheados.

---

## 3. Protocolo de Pruebas de Compilación y Distribución

1. **Compilación de Producción**:
   ```bash
   npm run build
   ```
   Debe completar con código 0 y sin errores de sintaxis ni de dependencias.
2. **Generación de Instalador Windows**:
   ```bash
   npm run electron:dist
   ```
   Genera el instalador ejecutable `.exe` en la carpeta `release/`.
