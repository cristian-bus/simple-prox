# SUITE DE PRUEBAS, COBERTURA, ERRORES CONFIRMADOS Y PENDIENTES

> **Documento:** `DOCUMENTACION_IA/11_PRUEBAS_Y_PENDIENTES.md`  
> **Estado:** `[IMPLEMENTADO]` / `[INSPECCIONADO]`  
> **Referencia de Código:** Commit `4e145bba6b4553c289727a90c569124bef8ed24b` + rama `security/phase-0.2.2-event-idempotency`  
> **Directorio de Pruebas:** [tests/](file:///c:/Users/Pininas/KioscoProX/tests/)  
> **Regla de oro (AGENTS.md):** No confundir código implementado con funcionalidad probada. Una tarea no está terminada porque compile o no muestre errores inmediatos; requiere verificación empírica.

---

## 1. INVENTARIO DE PRUEBAS AUTOMATIZADAS EXISTENTES

El repositorio cuenta con una extensa batería de scripts de verificación automatizada desarrollados durante las fases de endurecimiento de backend, criptografía y persistencia:

### A. Pruebas de Respaldo, Escritura Atómica y Recuperación
* [tests/fase4b05_adversarial_backup_runner.mjs](file:///c:/Users/Pininas/KioscoProX/tests/fase4b05_adversarial_backup_runner.mjs) (`21.486 bytes`):
  - **Alcance:** Prueba de estrés adversaria sobre [safeBackupWriter.js](file:///c:/Users/Pininas/KioscoProX/electron/safeBackupWriter.js).
  - **Casos:** Simulación de fallos de disco (`ENOSPC`), bloqueos de archivos por antivirus (`EBUSY`), renombrado atómico con reintentos y validación de suma SHA-256.
  - **Estado:** `[TEST_AUTOMATIZADO]` Verificado con evidencia en `fase4b05_raw_evidence.json`.
* [tests/test_stage5b4_validation.mjs](file:///c:/Users/Pininas/KioscoProX/tests/test_stage5b4_validation.mjs) (`7.768 bytes`):
  - **Alcance:** Validación de contención estricta en `userData` y defensa contra Path Traversal en snapshots de recuperación.
  - **Estado:** `[TEST_AUTOMATIZADO]`.
* [tests/test_commercial_restore.mjs](file:///c:/Users/Pininas/KioscoProX/tests/test_commercial_restore.mjs) (`16.068 bytes`):
  - **Alcance:** Validación de restauración de esquemas comerciales sin pérdida de identificador de instalación.
  - **Estado:** `[TEST_AUTOMATIZADO]`.

---

### B. Pruebas de Clientes, Cuentas Corrientes e Importación/Exportación
* [tests/test_clientes_import_export.mjs](file:///c:/Users/Pininas/KioscoProX/tests/test_clientes_import_export.mjs) (`11.208 bytes`):
  - **Alcance:** Validación de importación masiva desde Excel (`.xlsx`), deduplicación por CUIT/Nombre y exportación consistente.
  - **Estado:** `[TEST_AUTOMATIZADO]`.
* [tests/test_cobro_deuda_y_planes.mjs](file:///c:/Users/Pininas/KioscoProX/tests/test_cobro_deuda_y_planes.mjs) (`5.558 bytes`):
  - **Alcance:** Validación de que el cobro de deudas (`payDebt`) funcione tanto en Plan Básico como en Plan Pro, mientras que la venta a fiado quede restringida a Pro.
  - **Estado:** `[TEST_AUTOMATIZADO]`.

---

### C. Pruebas de Criptografía y Licencias Ed25519
* [tests/test_pro_license_validator.mjs](file:///c:/Users/Pininas/KioscoProX/tests/test_pro_license_validator.mjs) (`13.326 bytes`):
  - **Alcance:** Validación de certificados Ed25519 Pro con WebCrypto SubtleCrypto, rechazo de firmas alteradas y control de vencimientos.
  - **Estado:** `[TEST_AUTOMATIZADO]`.
* [tests/pro_license_hub.test.mjs](file:///c:/Users/Pininas/KioscoProX/tests/pro_license_hub.test.mjs) (`18.580 bytes`):
  - **Alcance:** Emisión y validación cruzada de licencias de prueba con claves efímeras en memoria (`__TEST_PUBLIC_KEY_JWK__`).
  - **Estado:** `[TEST_AUTOMATIZADO]`.

---

### D. Pruebas de Backend Supabase, RLS y Métricas
* [tests/fase4b72_adversarial_retention_runner.mjs](file:///c:/Users/Pininas/KioscoProX/tests/fase4b72_adversarial_retention_runner.mjs) (`26.939 bytes`):
  - **Alcance:** Prueba de retención de métricas, políticas RLS y agregación en `campaign_daily_metrics`.
  - **Estado:** `[TEST_AUTOMATIZADO]`.
* [tests/test_pilot_campaigns_runner.cjs](file:///c:/Users/Pininas/KioscoProX/tests/test_pilot_campaigns_runner.cjs) (`6.970 bytes`):
  - **Alcance:** Ejecución de perfiles aislados en Electron para validar la ingesta de campañas y despacho de eventos en la cola outbox.
  - **Estado:** `[TEST_AUTOMATIZADO]`.

---

## 2. PRUEBAS MANUALES DOCUMENTADAS (ENTORNO REAL / SANDBOX)

Registradas en los informes de bitácora técnica de [docs/](file:///c:/Users/Pininas/KioscoProX/docs/):
1. **Arranque Limpio y Activación Comercial en Windows Sandbox:**
   - Instalación desde cero del ejecutable `Simple-ProX-Setup-1.3.12.exe`.
   - Carga de datos del local y activación exitosa mediante Clave Maestra.
   - Estado: `[TEST_MANUAL_DOCUMENTADO]`.
2. **Ciclo Operativo de Caja y Ventas:**
   - Apertura de turno con fondo inicial, venta de artículos en efectivo, control de stock y arqueo de cierre.
   - Estado: `[TEST_MANUAL_DOCUMENTADO]`.
3. **Generación y Exportación de Respaldo `.spx`:**
   - Exportación física a través del diálogo nativo del sistema operativo `dialog.showSaveDialog`.
   - Estado: `[TEST_MANUAL_DOCUMENTADO]`.

---

## 3. ERRORES CONFIRMADOS POR ANÁLISIS DE CÓDIGO

A través de la inspección estática y pruebas controladas, se confirman los siguientes comportamientos que requieren atención:

### Error E1: Riesgo de Pérdida Aparente de Activación
* **Ubicación:** [src/services/installationService.js](file:///c:/Users/Pininas/KioscoProX/src/services/installationService.js) (`saveCommerceProfile`) y [src/screens/Configuracion.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Configuracion.jsx).
* **Causa:** Si se actualiza el perfil del comercio y se sobreescribe `kioscoprox_business_config` sin realizar una fusión defensiva de los campos `isActivated: true`, `installationId` y `plan`, la función `checkLicense()` en `App.jsx` interpreta que la máquina no está activada y dispara la pantalla de bloqueo de `ActivationGuard`.
* **Estado:** `CONFIRMADO POR CÓDIGO`. Mitigado mediante directivas defensivas, pendiente de test automatizado específico.

### Error E2: Ausencia de Controles UI para Revocación en Panel Admin
* **Ubicación:** [panel-admin/index.html](file:///c:/Users/Pininas/KioscoProX/panel-admin/index.html).
* **Causa:** La sección "Comercios Activos" es un visualizador de solo lectura; no implementa botones para invocar el endpoint administrativo `POST /revoke` desplegado en la Edge Function `terminal-sync`.
* **Estado:** `CONFIRMADO POR CÓDIGO`.

### Error E3: Discrepancia de Ruta de Perfil en Desarrollo vs Producción
* **Ubicación:** [electron/main.js](file:///c:/Users/Pininas/KioscoProX/electron/main.js) vs [package.json](file:///c:/Users/Pininas/KioscoProX/package.json).
* **Causa:** Al no invocar `app.setName('Simple ProX')`, el entorno de desarrollo (`electron .`) utiliza `%APPDATA%\simple-prox` (tomado de `"name": "simple-prox"`), mientras que el instalador empaquetado utiliza `%APPDATA%\Simple ProX` (tomado de `"productName": "Simple ProX"`).
* **Estado:** `CONFIRMADO POR CÓDIGO Y SISTEMA DE ARCHIVOS`.

---

## 4. HIPÓTESIS NO VERIFICADAS Y PRUEBAS PENDIENTES

Las siguientes áreas **no cuentan con pruebas automatizadas ni verificación empírica en hardware físico**, por lo que deben considerarse `[NO VERIFICADO]`:

1. **Impresión Térmica en Hardware ESC/POS Real:**
   - No se ha probado la salida física en impresoras térmicas de 58mm y 80mm conectadas por USB/Serial/Red. Se desconoce si los saltos de línea y corte automático funcionan en todos los modelos comerciales.
2. **Límite de Catálogo con Carga Masiva (2500 Productos en RAM):**
   - No se ha medido el consumo de memoria ni el rendimiento de renderizado en React 19 cuando un comercio carga el tope de 2500 productos con un historial de más de 20.000 ventas acumuladas en `localStorage`.
3. **Escáneres de Código de Barras Inalámbricos / Bluetooth:**
   - Se desconoce si escáneres con configuraciones de sufijo no estándar (sin caracter `Enter`) activan correctamente la adición al carrito en `PuntoDeVenta.jsx`.
4. **Cierre Forzado por Administrador de Tareas durante Venta:**
   - Si Windows termina el proceso `Simple ProX.exe` de forma abrupta en el milisegundo exacto en que se serializa `kioscoprox_sales`, no se ha medido si LevelDB descarta la transacción incompleta o si requiere intervención del diario de contingencia.

---

## 5. CHECKLIST MAESTRO DE PRUEBAS DE REGRESIÓN PRE-DESPLIEGUE

Antes de compilar y distribuir una nueva versión de Simple ProX, deben ejecutarse obligatoriamente las siguientes pruebas:

```markdown
### 1. Núcleo POS y Caja
- [ ] Iniciar la aplicación y abrir turno de caja con fondo inicial.
- [ ] Realizar una venta en efectivo de un producto simple $\rightarrow$ verificar deducción de stock e incremento en caja.
- [ ] Realizar una venta de un combo $\rightarrow$ verificar deducción de stock de sus componentes.
- [ ] Realizar una compra a proveedor en efectivo $\rightarrow$ verificar aumento de stock y baja en caja.
- [ ] Cerrar el turno de caja (Cierre X / Z) $\rightarrow$ verificar que caja.isOpen pase a false y se guarde el turno.

### 2. Cuentas Corrientes (Clientes)
- [ ] En Plan Pro: Asignar una venta a un cliente con método Fiado $\rightarrow$ verificar aumento de deuda.
- [ ] En Plan Básico: Verificar que la opción Fiado permanezca bloqueada.
- [ ] En ambos planes: Cobrar deuda de un cliente $\rightarrow$ verificar baja en deuda e ingreso en caja.
- [ ] Intentar eliminar Consumidor Final $\rightarrow$ verificar rechazo del sistema.
- [ ] Intentar eliminar un cliente con deuda activa o con ventas $\rightarrow$ verificar bloqueo con mensaje explicativo.

### 3. Licenciamiento y Resiliencia
- [ ] Guardar datos del comercio desde Configuración.
- [ ] Cerrar y reabrir Electron $\rightarrow$ verificar que NO aparezca ActivationGuard.
- [ ] Generar un archivo de respaldo .spx $\rightarrow$ verificar que se guarde sin errores.
- [ ] Limpiar datos y restaurar el .spx $\rightarrow$ verificar restauración íntegra y preservación de la licencia.
- [ ] Modificar manualmente un precio dentro del .spx e intentar restaurarlo $\rightarrow$ verificar rechazo por suma SHA-256.

### 4. Actualizaciones y Red
- [ ] Con la caja abierta, intentar aplicar una actualización $\rightarrow$ verificar bloqueo de seguridad.
- [ ] Desconectar Internet $\rightarrow$ verificar que el POS continúe operando al 100% de forma autónoma.
- [ ] Realizar interacciones publicitarias offline $\rightarrow$ verificar que la cola outbox se vacíe al reconectar.
```
