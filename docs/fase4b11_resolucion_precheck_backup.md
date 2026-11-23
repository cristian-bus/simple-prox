# SIMPLE PROX v1.3.10 — FASE 4B.1.1
## RESOLUCIÓN DE OBSERVACIONES DE PRECHECK Y VALIDACIÓN ADVERSARIAL FINAL DEL SISTEMA DE BACKUP MANUAL

**Fecha:** 2026-11-09  
**Proyecto:** Simple ProX v1.3.10  
**Entorno de Validación:** PostgreSQL 17.11 en contenedor Docker aislado (`pg_isolated_fase3b`)  
**Base de Datos Productiva:** Supabase Cloud Free (`qtixbiikhvhzwshfgyeo`) — **100% INTACTA (CERO CONEXIONES EN ESTA FASE)**  
**Dictamen Oficial:** **GO (APTO) PARA REALIZAR EXCLUSIVAMENTE EL BACKUP REAL BAJO SUPERVISIÓN**

---

## 1. RESUMEN EJECUTIVO

En cumplimiento de los requerimientos de la FASE 4B.1.1 bajo estricto **MODO CAMBIO QUIRÚRGICO**, se resolvieron las observaciones finales detectadas en el precheck:
1. **Escape formal de credenciales en `.pgpass`:** Se implementó la función `Escape-PgPassField` en `admin-tools/backup_supabase_manual.ps1`, siguiendo la especificación oficial de PostgreSQL `libpq` (escapado estricto de `\` como `\\` y `:` como `\:`). Se validó con contraseñas sintéticas complejas con dos puntos, barras invertidas, espacios y símbolos tipográficos.
2. **Restricciones reales de compatibilidad de versiones de PostgreSQL:** Se endureció el pre-chequeo para validar que el servidor remoto no sea anterior a la versión mínima soportada (PostgreSQL 12+) y que la versión mayor de `pg_dump` local sea mayor o igual a la del servidor remoto.
3. **Estrategia dinámica de validación de filas (`ExpectedCounts` y `MinExpectedCounts`):** Se adaptó `admin-tools/verify_and_restore_backup.ps1` para desestimar números históricos fijos. Se habilitó el parámetro `-MinExpectedCounts` para validar pisos mínimos de eventos conocidos (ej. $\ge 9.787$), además de permitir la comparación exacta opcional (`-ExpectedCounts`) contra una consulta en vivo tomada en el momento del respaldo.
4. **Validación de mecanismos críticos intactos:** Se mantuvo inalterada la verificación bidireccional SHA-256, transporte binario con `docker cp`, protección de memoria con `SecureString`, lista negra y bloqueo de bases locales, y limpieza forzosa en `finally`.
5. **Pruebas y Regresión:** La suite adversarial se amplió a 16 casos (`tests/fase4b05_adversarial_backup_runner.mjs`), logrando **16/16 PASS (100%)**. La suite previa (`tests/fase4b03_backup_runner.mjs`) superó **4/4 PASS (100%)**.

---

## 2. MODIFICACIONES QUIRÚRGICAS IMPLEMENTADAS

### A. Construcción y Escape en `admin-tools/backup_supabase_manual.ps1`
Se implementó la función auxiliar `Escape-PgPassField` que procesa cada campo del archivo `.pgpass`:
```powershell
function Escape-PgPassField([string]$field) {
    if ([string]::IsNullOrEmpty($field)) { return "" }
    return $field.Replace('\', '\\').Replace(':', '\:')
}
```
* Cada campo (`HostName`, `Database`, `UserName`, `plainPass`) se escapa antes de concatenar en la línea `.pgpass`.
* La línea se inyecta por `stdin` mediante pipeline de PowerShell a `cat > /tmp/.pgpass_... && chmod 0600 /tmp/.pgpass_...`.
* En el bloque `finally`, las variables intermedias (`$escPass`, `$escUser`, etc.) y el archivo temporal se eliminan forzosamente.

### B. Endurecimiento del Pre-chequeo de Versión en `backup_supabase_manual.ps1`
Se añadieron comprobaciones determinísticas:
```powershell
if ($serverVerMajor -lt 12) {
    throw "Version de servidor no soportada: PostgreSQL $serverVerMajor es anterior a la version minima soportada (PostgreSQL 12+)."
}
if ($dumpVerMajor -lt $serverVerMajor) {
    throw "Incompatibilidad de version: pg_dump ($dumpVerMajor) es menor que el servidor ($serverVerMajor). pg_dump solo puede respaldar servidores de su misma version mayor o anteriores."
}
```

### C. Estrategia de Validación de Conteos en `admin-tools/verify_and_restore_backup.ps1`
Se incorporó el parámetro `-MinExpectedCounts` (hashtable) que valida que las tablas recuperadas no presenten una pérdida de datos respecto a un piso mínimo histórico:
```powershell
param(
    ...
    [Parameter(Mandatory = $false)]
    [hashtable]$ExpectedCounts = $null,

    [Parameter(Mandatory = $false)]
    [hashtable]$MinExpectedCounts = $null
)
```
* **Opción 1 (Piso mínimo seguro - Recomendada para el operador):**
  `-MinExpectedCounts @{ campaign_events = 9787 }`
  Garantiza que la tabla recuperada tenga al menos los 9.787 registros auditados previamente, aceptando nuevos eventos recibidos desde entonces.
* **Opción 2 (Cotejo exacto sincrónico):**
  Ejecutar en Supabase SQL Editor `SELECT count(*) FROM public.campaign_events;` justo antes del volcado y pasar `-ExpectedCounts @{ campaign_events = <valor_obtenido> }`.
* **Opción 3 (Auditoría estructural):**
  Omitir ambos parámetros. El script imprime la tabla con todos los registros recuperados para inspección visual.

---

## 3. RESULTADOS DE LAS PRUEBAS DE REGRESIÓN Y ADVERSARIALES

### Suite Adversarial Ampliada (16 Escenarios):
| Caso | Prueba | Resultado |
|---|---|:---:|
| 1 | Backup correcto con exit code 0 y archivo binario generado | **PASS** |
| 2 | Transferencia íntegra: SHA-256 coincide y TOC es legible | **PASS** |
| 3 | Detección obligatoria de corrupción binaria ante mismatch SHA-256 | **PASS** |
| 4 | `pg_restore` con error o archivo corrupto detectado y abortado | **PASS** |
| 5 | Dependencias de Supabase (roles anon, authenticated, service_role y auth) | **PASS** |
| 6 | Conteo diferente detectado: rechaza y aborta ante discrepancia de filas | **PASS** |
| 7 | Intento de utilizar `test_db` bloqueado y protegido con error crítico | **PASS** |
| 8 | Base temporal preexistente rechazada para evitar sobreescritura destructiva | **PASS** |
| 9 | Pre-chequeo de compatibilidad de versión PostgreSQL aborta ante incompatibilidad | **PASS** |
| 10 | Contraseña ausente de argumentos visibles (uso exclusivo de .pgpass efímero) | **PASS** |
| 11 | Restauración completa exitosa: tablas, filas exactas, índices y RLS | **PASS** |
| 12 | Limpieza completa: sin archivos .pgpass huérfanos ni bases de prueba residuales | **PASS** |
| 13 | Conservación de backup: archivo .dump en host preservado tras errores forenses | **PASS** |
| 14 | **Escape correcto de contraseña con `:` y `\` y espacios en `.pgpass`** | **PASS** |
| 15 | **Validación con `MinExpectedCounts` (aprueba piso alcanzado y rechaza piso insuficiente)** | **PASS** |
| 16 | **Restricción de versión mínima: servidores anteriores a PostgreSQL 12 rechazados** | **PASS** |

**Resultado Global:** **16/16 PASS (100% EXITO)**.  
**Suite de Regresión Base (`fase4b03_backup_runner.mjs`):** **4/4 PASS (100% EXITO)**.

---

## 4. DICTAMEN FINAL

> **DICTAMEN OFICIAL FASE 4B.1.1:**  
> **GO (APTO) PARA REALIZAR EXCLUSIVAMENTE EL BACKUP REAL BAJO SUPERVISIÓN**  
>
> Todas las observaciones del precheck han sido resueltas quirúrgicamente. El sistema es tolerante a contraseñas complejas, restringe versiones obsoletas, permite validación de pisos mínimos de eventos y protege rigurosamente el entorno local y las credenciales.
>
> **ESTADO DE PRODUCCIÓN:** **100% INTACTO. CERO CONEXIONES REALIZADAS.**

