# SIMPLE PROX v1.3.10 — FASE 4B.0.5
## CORRECCIÓN QUIRÚRGICA FINAL Y CERTIFICACIÓN DEL SISTEMA DE BACKUP MANUAL

**Fecha:** 2026-11-09  
**Proyecto:** Simple ProX v1.3.10  
**Entorno de Validación:** PostgreSQL 17.11 en contenedor Docker aislado (`pg_isolated_fase3b`)  
**Base de Datos Productiva:** Supabase Cloud Free (`qtixbiikhvhzwshfgyeo`) — **100% INTACTA (CERO CONEXIONES EN ESTA FASE)**  
**Dictamen Oficial:** **APTO PARA BACKUP PRODUCTIVO PREVIO A MIGRACIONES**

---

## 1. RESUMEN EJECUTIVO

Durante la Fase 4B.0.4 se detectaron 7 hallazgos de auditoría (3 Altos, 3 Medios y 1 Bajo) en los scripts iniciales de respaldo y restauración. En la presente **FASE 4B.0.5**, bajo estricto **MODO CAMBIO QUIRÚRGICO**, se rediseñaron e implementaron las correcciones definitivas sobre:
1. `admin-tools/backup_supabase_manual.ps1`
2. `admin-tools/verify_and_restore_backup.ps1`

La solución fue sometida a una suite automatizada adversarial de **13 escenarios de prueba** (`tests/fase4b05_adversarial_backup_runner.mjs`), cubriendo desde transferencias íntegras hasta inyecciones de bit-flip, discrepancias de conteo, intentos de sobreescritura de bases locales y comprobaciones de fugas de credenciales en la tabla de procesos del sistema operativo.

**Resultado de las pruebas:** **13/13 CASOS APROBADOS (100% PASS)**.

---

## 2. CORRECCIÓN DE LOS 7 HALLAZGOS DE AUDITORÍA (FASE 4B.0.4)

### Hallazgo 1 (ALTO) — Fuga de Contraseña en Argumentos de Proceso
* **Problema Previo:** `docker exec -e PGPASSWORD=$plainPass` exponía la contraseña en la tabla de procesos de Windows (`Win32_Process`), visible para cualquier proceso no privilegiado mediante `wmic process get CommandLine` o Task Manager.
* **Corrección Quirúrgica:** 
  - Se eliminó el parámetro `-e PGPASSWORD` de la línea de comandos de Docker.
  - La contraseña se inyecta exclusivamente vía `stdin` hacia una subshell interna en el contenedor mediante piping de PowerShell, creando un archivo efímero `/tmp/.pgpass_<timestamp>_<rand>` con permisos restrictivos `0600`.
  - El comando `pg_dump` y `psql` consumen la variable `PGPASSFILE=/tmp/.pgpass_...`, donde los argumentos de proceso únicamente muestran la ruta efímera.
  - En el bloque `finally` de PowerShell, el archivo `.pgpass` es eliminado forzosamente (`docker exec ... rm -f`), la variable `SecureString` es liberada de la memoria no administrada con `ZeroFreeBSTR`, y se invoca la recolección de basura `[System.GC]::Collect()`.

### Hallazgo 2 (MEDIO) — Compatibilidad de Versiones de PostgreSQL
* **Problema Previo:** Si la versión mayor de `pg_dump` local fuese inferior a la del servidor remoto de Supabase (PostgreSQL 17), `pg_dump` fallaría o generaría respaldos truncados sin diagnóstico previo.
* **Corrección Quirúrgica:**
  - Se agregó una etapa previa `[2/6]` en `backup_supabase_manual.ps1` que consulta de forma segura `SELECT current_setting('server_version_num')::int, version();`.
  - Se verifica que la versión mayor de `pg_dump` en el contenedor sea mayor o igual a la del servidor remoto.
  - Si no es compatible, el script aborta inmediatamente con un error explícito antes de iniciar la extracción.

### Hallazgo 3 (ALTO) — Verificación de Integridad Binaria Bidireccional SHA-256
* **Problema Previo:** Solo se calculaba el hash en Windows luego de la transferencia, sin contrastarlo contra el archivo generado en Linux.
* **Corrección Quirúrgica:**
  - Se ejecuta `sha256sum` dentro del contenedor Linux inmediatamente después de que `pg_dump` finaliza.
  - Se transfiere el archivo mediante `docker cp` nativo (sin conversiones CRLF de streams de PowerShell).
  - Se calcula `Get-FileHash` en Windows y se realiza una comparación estricta de ambos hashes hex.
  - Si los hashes difieren (corrupción de red o de disco), el script aborta de inmediato.
  - **Conservación Forense:** Ante cualquier fallo posterior de verificación, el archivo `.dump` del host **no es borrado** para permitir auditoría forense.

### Hallazgo 4 (ALTO) — Validación Estricta de Códigos de Retorno de `pg_restore`
* **Problema Previo:** Errores no fatales o código de salida `1` en `pg_restore` podían permitir la emisión del banner "VERIFICACIÓN EXITOSA".
* **Corrección Quirúrgica:**
  - Se forzó el flag `--exit-on-error` en `pg_restore`.
  - Se evalúa `$LASTEXITCODE -eq 0`. Si el código es distinto de 0, se captura la salida de error completa, se arroja una excepción terminante y se inhibe cualquier mensaje de éxito.

### Hallazgo 5 (MEDIO) — Protección Contra Sobreescritura de Bases Locales
* **Problema Previo:** El script de verificación utilizaba un nombre fijo `test_restore_verify_db` o el provisto por el usuario, con riesgo de destruir bases locales si se indicaba erróneamente `test_db` o `postgres`.
* **Corrección Quirúrgica:**
  - Se implementó una lista negra de protección: `postgres`, `template0`, `template1`, `test_db`.
  - Si no se especifica nombre, se genera automáticamente un nombre aleatorio único con prefijo temporal: `tmp_backup_verify_<timestamp>_<rand>`.
  - Se realiza una consulta previa a `pg_database`: si la base de datos ya existe, se aborta inmediatamente con `ACCESO DENEGADO` para prevenir sobreescritura destructiva.
  - En el bloque `finally`, se destruye **única y exclusivamente** la base temporal creada por la instancia en curso.

### Hallazgo 6 (MEDIO) — Aprovisionamiento de Dependencias de Supabase
* **Problema Previo:** Al restaurar un dump que contiene ACLs o funciones con dependencias de Supabase (`anon`, `authenticated`, `service_role`, `auth.uid()`, `auth.role()`), la restauración podía fallar en entornos PostgreSQL genéricos.
* **Corrección Quirúrgica:**
  - Se configuró la creación idempotente previa de los roles `anon`, `authenticated`, `service_role`.
  - Se provisionó el esquema `auth` auxiliar con funciones stub `auth.uid()` (devuelve UUID nulo) y `auth.role()` (devuelve 'anon'), garantizando que políticas RLS y triggers de integridad compilen sin errores durante `pg_restore`.

### Hallazgo 7 (BAJO) — Validación Absoluta de Conteos contra Metadata de Origen
* **Problema Previo:** La verificación solo comprobaba que las tablas existieran, pero no contrastaba si las cantidades coincidían con el origen.
* **Corrección Quirúrgica:**
  - Se habilitó el parámetro `-ExpectedCounts` (hashtable clave-valor).
  - Si se proporciona, el script compara exactamente el número de filas de cada tabla crítica (`campaign_events`, `campaigns`, `admin_users`, etc.).
  - Si existe una discrepancia, se reporta `CONTEO_MISMATCH` y se aborta la validación.
  - Si no se provee, el script advierte que la validación es puramente estructural.

---

## 3. MATRIZ DE RESULTADOS DE LA SUITE ADVERSARIAL (FASE 4B.0.5)

Evidencia empírica generada por `tests/fase4b05_adversarial_backup_runner.mjs` y persistida en `tests/fase4b05_raw_evidence.json`:

| Caso | Escenario Adversarial Evaluado | Resultado | Detalle Verificado |
|---|---|:---:|---|
| **1** | Backup correcto con `backup_supabase_manual.ps1` | **PASS** | Exit code 0, archivo binario generado > 2.6 MB, SHA-256 emitido |
| **2** | Transferencia íntegra (`docker cp` y lectura TOC) | **PASS** | Hash en contenedor coincide bit a bit con el host; TOC legible |
| **3** | Corrupción binaria simulada (mismatch SHA-256) | **PASS** | Aborta de inmediato con error crítico de integridad binaria |
| **4** | `pg_restore` con archivo corrupto o SQL inválido | **PASS** | Detecta fallo en TOC/restore; exit code 1; no emite banner de éxito |
| **5** | Dependencias de Supabase (roles y esquema `auth`) | **PASS** | Roles `anon`, `authenticated`, `service_role` y stubs `auth` funcionales |
| **6** | Discrepancia de filas detectada (`ExpectedCounts`) | **PASS** | Detecta discrepancia artificial (`999999`); aborta con `CONTEO_MISMATCH` |
| **7** | Intento de restaurar sobre base protegida `test_db` | **PASS** | Bloqueo inmediato con `ACCESO DENEGADO`; `test_db` intacta (50 eventos) |
| **8** | Nombre de base temporal preexistente | **PASS** | Detecta preexistencia en catálogo; aborta para evitar sobreescritura |
| **9** | Incompatibilidad de versión PostgreSQL | **PASS** | Detecta si `pg_dump` fuese menor al servidor y aborta antes de extraer |
| **10** | Contraseña ausente de argumentos visibles | **PASS** | Cero ocurrencias de `PGPASSWORD=` en CLI de Docker; uso de `.pgpass` efímero |
| **11** | Restauración completa exitosa con conteos reales | **PASS** | 50/50 eventos, 6/6 campañas, 1/1 admin_users, índices y RLS íntegros |
| **12** | Limpieza exhaustiva de temporales | **PASS** | Cero archivos `/tmp/.pgpass*` huérfanos; cero bases `tmp_backup_verify_*` |
| **13** | Conservación del backup ante fallos forenses | **PASS** | Archivo `.dump` en host preservado tras fallos de verificación |

---

## 4. PROCEDIMIENTO OPERATIVO PARA BACKUP DE SUPABASE COMERCIAL

Cuando el usuario autorice la conexión a producción, el procedimiento exacto es:

### Paso 1: Obtener la Cadena de Conexión en Session Mode (Puerto 5432)
En el panel de Supabase:
* **Settings > Database > Connection string > URI**
* Seleccionar **Session Mode (Puerto 5432)**. (NUNCA el puerto 6543 de Transaction Mode/PgBouncer, ya que no soporta `pg_dump`).
* Formato: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`

### Paso 2: Ejecutar el Script de Respaldo Interactivo
En PowerShell:
```powershell
.\admin-tools\backup_supabase_manual.ps1 `
    -HostName "aws-0-sa-east-1.pooler.supabase.com" `
    -Port 5432 `
    -UserName "postgres.qtixbiikhvhzwshfgyeo" `
    -Database "postgres"
```
* El script solicitará la contraseña enmascarada mediante `SecureString`.
* Se ejecutará la verificación de versión remota.
* Se generará el volcado binario en `backups/supabase_backup_YYYYMMDD_HHMMSS.dump`.
* Se validará la coincidencia exacta de SHA-256 contenedor vs host.

### Paso 3: Verificar y Restaurar en Entorno Local Aislado
Para certificar que el respaldo es 100% restaurable antes de aplicar migraciones:
```powershell
$expected = @{
    campaign_events = 9787
}
.\admin-tools\verify_and_restore_backup.ps1 `
    -BackupFilePath ".\backups\supabase_backup_YYYYMMDD_HHMMSS.dump" `
    -ExpectedCounts $expected
```
* Restaurará en una base efímera única.
* Validará que existan exactamente los 9.787 eventos productivos.
* Validará que todas las políticas RLS e índices estén presentes.
* Limpiará la base temporal automáticamente.

---

## 5. DICTAMEN FINAL

> **DICTAMEN OFICIAL FASE 4B.0.5:**  
> **APTO PARA BACKUP PRODUCTIVO PREVIO A MIGRACIONES**  
>
> Los scripts `backup_supabase_manual.ps1` y `verify_and_restore_backup.ps1` cumplen con todas las garantías de seguridad de contraseñas, integridad criptográfica SHA-256, protección de bases locales, compatibilidad de dependencias de Supabase y validación de conteos.
>
> **PRODUCCIÓN COMERCIAL SUPABASE: PERMANECE 100% INTACTA.**  
> Ninguna acción ha sido ejecutada contra la base de datos comercial.

