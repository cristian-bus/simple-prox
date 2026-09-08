# Guía de Configuración Remota (`RemoteConfigService`)

## 1. Alcance y Límites de Seguridad

Remote Config permite ajustar parámetros no críticos de la aplicación en caliente desde la tabla `remote_config` de Supabase:

### Parámetros Permitidos (Solo DATA):
- `b2bEnabled` (boolean): Activa o desactiva la sección comercial B2B.
- `bannerEnabled` (boolean): Activa o desactiva la rotación de banners publicitarios.
- `bannerInterval` (number): Intervalo de rotación de banners en segundos.
- `syncIntervalMinutes` (number): Frecuencia de sincronización de campañas.
- `minimumSupportedVersion` (string): Versión mínima recomendada.
- `updateChannel` (string): Canal de distribución (`stable`, `beta`).
- `whatsappTemplates` (object): Mensajes predeterminados para pedidos mayoristas.

### Restricciones Críticas:
- **PROHIBIDO**: No puede alterar ventas, inventario, productos, clientes, deudas ni caja.
- **PROHIBIDO**: No puede ejecutar código JavaScript remoto.

---

## 2. Resiliencia y Fallbacks

Si la terminal arranca sin conexión a Internet o Supabase no responde:
1. Utiliza la última configuración válida guardada en `kioscoprox_remote_config_v2`.
2. Si nunca hubo conexión, aplica de forma inmediata el `DEFAULT_CONFIG` estático embebido en el código.
