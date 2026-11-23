# SIMPLE PROX v1.3.12 — ÍNDICE MAESTRO Y ESTADO DEL SISTEMA

**DOCUMENTO:** `00_INDICE_Y_ESTADO.md`  
**VERSIÓN DEL PROYECTO:** 1.3.12  
**FECHA DE CORTE Y AUDITORÍA:** 17 de Noviembre de 2026  
**RAMA GIT ACTIVA:** `security/phase-0.2.2-event-idempotency`  
**COMMIT DE REFERENCIA BASE:** `4e145bba6b4553c289727a90c569124bef8ed24b`  
**MODO OPERATIVO:** BASE DE CONOCIMIENTO TÉCNICO Y AUDITORÍA FORENSE (Solo Lectura)

---

## 1. PROPÓSITO DE LA BASE DE CONOCIMIENTO
Este conjunto documental constituye la **fuente de verdad canónica e integral** de la arquitectura, reglas de negocio, persistencia, flujos criptográficos, seguridad y dependencias de Simple ProX. Ha sido construido mediante inspección estricta de código fuente línea por línea para que cualquier ingeniero o agente de IA pueda diagnosticar, auditar y ejecutar **modificaciones quirúrgicas sin regresiones**.

---

## 2. REGLAS MAESTRAS DE TRABAJO (AGENTS.md)
Toda intervención futura en este proyecto debe respetar los 50 artículos de [AGENTS.md](file:///c:/Users/Pininas/KioscoProX/.agents/AGENTS.md), cuyos principios rectores inquebrantables son:
1. **NO ROMPER LO QUE YA FUNCIONA:** Análisis de dependencias e impacto antes de tocar una línea de código.
2. **MODO CAMBIO QUIRÚRGICO:** Cambiar exclusivamente lo necesario para cumplir el objetivo solicitado. Todo código circundante permanece intacto.
3. **DIFF MÍNIMO:** Prohibido reescribir archivos enteros o correr formateadores automáticos que ensucien el control de versiones.
4. **OFFLINE-FIRST:** El núcleo del POS (ventas, stock, caja, clientes, turnos) jamás debe depender de Internet ni de servidores externos. La falla de Supabase o la falta de red nunca debe inutilizar la operación del kiosco.
5. **ZERO-KNOWLEDGE DE SECRETOS:** Prohibido exponer claves maestras, firmas privadas o credenciales en el cliente o en el repositorio.

---

## 3. MAPA DE NAVEGACIÓN DE LA DOCUMENTACIÓN

| Archivo | Título del Módulo | Estado de Verificación |
| :--- | :--- | :---: |
| [`00_INDICE_Y_ESTADO.md`](file:///c:/Users/Pininas/KioscoProX/DOCUMENTACION_IA/00_INDICE_Y_ESTADO.md) | Índice Maestro, Estado del Sistema y Convenciones | **VERIFICADO** |
| [`01_ARQUITECTURA.md`](file:///c:/Users/Pininas/KioscoProX/DOCUMENTACION_IA/01_ARQUITECTURA.md) | Arquitectura Electron, IPC, React y Persistencia | **VERIFICADO** |
| [`02_MODULOS_POS.md`](file:///c:/Users/Pininas/KioscoProX/DOCUMENTACION_IA/02_MODULOS_POS.md) | Análisis de las 12 Pantallas del POS y Lógica de Negocio | **VERIFICADO** |
| `03_LICENCIAS_Y_PLANES.md` | Criptografía Ed25519, Básico vs Pro y Ciclo de Vida | *Bloque 2* |
| `04_PANEL_ADMIN_B2B.md` | Panel Administrador B2B SPA y Capacidades de Gestión | *Bloque 2* |
| `05_SUPABASE_BACKEND.md` | Esquema SQL, RLS, RPCs y Edge Functions Cloud | *Bloque 2* |
| `06_PUBLICIDAD_Y_METRICAS.md` | Motor de Ofertas B2B, Cupos y Outbox Idempotente | *Bloque 3* |
| `07_ACTUALIZACIONES.md` | Distribución NSIS, electron-updater y GitHub Releases | *Bloque 3* |
| `08_RESPALDOS_Y_PERSISTENCIA.md`| Formato .spx, Criptografía SHA-256 y RecoveryGuard | *Bloque 3* |
| `09_SEGURIDAD_Y_RIESGOS.md` | Vectores de Ataque, Protecciones y Riesgos de Soporte | *Bloque 4* |
| `10_MAPA_DEPENDENCIAS.md` | Matriz de Impacto Cruzado para Modificaciones Quirúrgicas | *Bloque 4* |
| `11_PRUEBAS_Y_PENDIENTES.md` | Suite de Pruebas, Cobertura y Pendientes de Roadmap | *Bloque 4* |

---

## 4. ESTADO ACTUAL DEL PROYECTO (v1.3.12)

### A. Estado de Versión y Empaquetado
- **Versión canónica:** `1.3.12` sincronizada en:
  - [package.json](file:///c:/Users/Pininas/KioscoProX/package.json) (Línea 4).
  - [package-lock.json](file:///c:/Users/Pininas/KioscoProX/package-lock.json) (Líneas 3 y 9).
  - [src/constants/version.js](file:///c:/Users/Pininas/KioscoProX/src/constants/version.js) (Línea 5).
- **Instalador NSIS comercial generado:**
  - Archivo: `release/Simple-ProX-Setup-1.3.12.exe` (197.272.586 bytes, fecha 16/11/2026 18:36:23).
  - Manifiesto: `release/latest.yml` (SHA-512 verificado al 100%: `c+XQbLrI1Ix8p9KrCQ8lFxxdDLIsH8NVowKpzDN76BW6y942VbKAZ/P7jv0IL4yZDUlueqjep54JdUdgFM6xgw==`).
  - Blockmap diferencial: `release/Simple-ProX-Setup-1.3.12.exe.blockmap` (203.306 bytes).
  - Canal empaquetado: `cristian-bus/simple-prox` (Comercial oficial).

### B. Diferencias entre el Commit de Referencia (`4e145bb`) y el Árbol de Trabajo
El código inspeccionado corresponde a la rama `security/phase-0.2.2-event-idempotency` en el commit `4e145bb`, con modificaciones no commiteadas aprobadas quirúrgicamente durante las fases de estabilización precomercial:
1. **Punto de Venta:** Agregado de botón de cierre (X) y escucha de tecla `Escape` en modal de Apertura de Caja ([src/screens/PuntoDeVenta.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/PuntoDeVenta.jsx)).
2. **Clientes:** Implementación de importación y exportación de clientes a Excel (.xlsx) con validación de columnas y deduplicación por CUIT/Nombre ([src/screens/Clientes.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Clientes.jsx)).
3. **Integridad Financiera:** Bloqueo de eliminación para Consumidor Final (ID 1), clientes con saldo deudor (`deuda > 0`) o con ventas históricas asociadas ([src/hooks/useKiosco.js](file:///c:/Users/Pininas/KioscoProX/src/hooks/useKiosco.js)).
4. **Cobranzas:** Cobro de deuda habilitado tanto en Plan Básico como en Plan Pro ([src/screens/Clientes.jsx](file:///c:/Users/Pininas/KioscoProX/src/screens/Clientes.jsx)).
5. **Versionado y Distribución:** Configuración nativa `"artifactName": "Simple-ProX-Setup-${version}.${ext}"` en `package.json` para eliminar discrepancias con `latest.yml`.

---

## 5. CONVENCIONES DE ESTADO EN ESTA DOCUMENTACIÓN

- **[IMPLEMENTADO]:** Funcionalidad presente en el código, referenciada con archivo y línea exactos.
- **[VERIFICADO]:** Código probado de forma activa mediante tests automatizados o pruebas manuales documentadas.
- **[PARCIAL]:** Funcionalidad presente en código pero con limitaciones de interfaz o cobertura.
- **[PLANIFICADO]:** Mencionada en documentación/ROADMAP pero sin implementación en código.
- **[NO VERIFICADO]:** Código existente cuya ejecución no ha sido comprobada en producción.
