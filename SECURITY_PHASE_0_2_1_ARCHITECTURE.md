# ARQUITECTURA DE SEGURIDAD — FASE 0.2.1 / 0.2.1a: ENROLAMIENTO SEGURO Y CONTROL DE IDENTIDAD
**Proyecto:** KioscoProX / Simple ProX  
**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2.1a-enrollment-review-fixes`  
**Estado:** BORRADOR QUIRÚRGICO LOCAL — PENDIENTE DE REVISIÓN (NO DESPLEGADO)  

---

## 1. INTRODUCCIÓN Y DIAGNÓSTICO DE VULNERABILIDAD

Al auditar la implementación real de la Supabase Edge Function `terminal-sync`, se identificaron debilidades críticas en el flujo de vinculación inicial de terminales:

1. **First-Claim / Enrollment Hijacking**:
   - `POST /enroll` recibía `installationId` provisto por el cliente sin exigir ninguna prueba de autorización server-side previa.
   - Si no existía identidad previa para ese `installationId`, el servidor generaba y retornaba un `terminalToken` permanente.
   - Cualquier atacante o tercero que conociese o enumerase un `installationId` legítimo aún no enrolado podía reclamarlo y secuestrar la identidad del comercio, dejando a la terminal legítima en error 409 Conflict permanente.
2. **Creación arbitraria de comercios**:
   - Si el `installationId` no existía en `merchants`, `/enroll` creaba automáticamente una nueva fila de comercio, abriendo la base de datos a comercios fantasmas sin validación previa.
3. **Confianza en datos del cliente para identidad**:
   - `/enroll` utilizaba `body.commerceId` enviado por el cliente para fijar la identidad comercial.
   - `/register` permitía que una terminal ya autenticada modificase arbitrariamente su `commerce_id`.
4. **Validación de rol Admin en emisión de tickets**:
   - El endpoint `/issue-ticket` verificaba únicamente `auth.getUser(jwt)`, confundiendo cualquier usuario `authenticated` con un `admin` con privilegios para autorizar terminales.
5. **Comportamiento destructivo ante HTTP 401**:
   - `src/services/terminalIdentityService.js` eliminaba la credencial local ante cualquier 401 transitorio o desautorización, provocando que la terminal intentase reenrolarse sin ticket y quedase bloqueada en 409.

---

## 2. MODELO DE AUTORIZACIÓN: ENROLLMENT TICKETS DE UN SOLO USO

Para mitigar el First-Claim Hijacking sin introducir secretos globales compartidos en el cliente (prohibido por la Regla 6 de `AGENTS.md`), se diseñó un modelo de **Enrollment Ticket** emitido y controlado exclusivamente server-side.

```text
       ┌────────────────────────┐
       │ Administrador Auténtico│ (Sesión Supabase Auth en panel-admin)
       └───────────┬────────────┘
                   │ 1. POST /issue-ticket (JWT Bearer)
                   ▼
       ┌────────────────────────┐
       │ terminal-sync Function │
       └───────────┬────────────┘
                   │ 2. Verificar auth.getUser(jwt) -> user.id
                   │ 3. Consultar public.admin_users (is_active = true)
                   │    - Si NO es admin -> HTTP 403 Forbidden
                   │    - Si ES admin -> Continuar
                   ▼
       ┌────────────────────────┐
       │ Generar Ticket Cripto  │ (32 bytes aleatorios criptográficos, prefijo 'spx_ticket_')
       │ Duración: 30 minutos   │ (Fijada estrictamente en backend)
       └───────────┬────────────┘
                   │ 4. INSERT INTO terminal_enrollment_tickets
                   │    (Guarda SHA-256(ticket), installation_id, expires_at, status='pending')
                   ▼
       ┌────────────────────────┐
       │ Retornar Ticket Crudo  │ (Entregado al operador/instalador una sola vez)
       └───────────┬────────────┘
                   │ 5. Instalador/Kiosco ingresa el ticket
                   ▼
       ┌────────────────────────┐
       │ POST /enroll (Kiosco)  │ ({ installationId, enrollmentTicket })
       └───────────┬────────────┘
                   │ 6. Invocar RPC enroll_terminal_with_ticket
                   ▼
       ┌────────────────────────────────────────────────────────┐
       │ Transacción Atómica en PostgreSQL (RPC SECURITY DEFINER)│
       │ a) Precondición: ¿merchant pre-provisionado?           │
       │    NO -> Retorna 422 MERCHANT_NOT_PROVISIONED          │
       │          (Ticket NO se consume)                        │
       │ b) ¿Identidad activa previa?                           │
       │    SÍ -> Retorna 409 ALREADY_ENROLLED                  │
       │ c) UPDATE terminal_enrollment_tickets                  │
       │    SET status='used', used_at=now()                    │
       │    WHERE ticket_hash=$1 AND installation_id=$2         │
       │      AND status='pending' AND expires_at > now()       │
       │    (Row-level lock, previene doble consumo concurrente)│
       │ d) INSERT INTO terminal_identities                     │
       └───────────┬────────────────────────────────────────────┘
                   │ 7. Emitir terminalToken permanente a la terminal
                   ▼
       ┌────────────────────────┐
       │ Terminal Simple ProX   │
       │ Guarda token en DPAPI  │
       └────────────────────────┘
```

---

## 3. PROPIEDADES DE SEGURIDAD DEL DISEÑO

### A. Autoridad Administrativa Real (`admin_users`)
- No se confía en `auth.role() = 'authenticated'`. Un usuario común registrado en Supabase no puede emitir tickets.
- Se implementó la tabla privada `public.admin_users` que vincula `user_id UUID REFERENCES auth.users(id)` con `is_active BOOLEAN`.
- RLS activada con denegación absoluta para roles públicos (`anon`, `authenticated`). Solo `service_role` (usado por la Edge Function) puede consultarla.
- **Bootstrap del primer admin**: Operación manual/controlada ejecutada por el operador de infraestructura directamente en SQL:
  ```sql
  INSERT INTO public.admin_users (user_id, is_active, notes)
  VALUES ('<UUID_DEL_USUARIO_EN_AUTH_USERS>', true, 'Superadmin inicial');
  ```

### B. Duración Estricta del Ticket (30 Minutos)
- La expiración es fijada unilateralmente por el servidor: `Date.now() + 30 * 60 * 1000`.
- El cliente no puede enviar parámetros `duration`, `ttl` ni `expiresAt`.
- Si el ticket no es canjeado en 30 minutos, expira automáticamente.

### C. Consumo Atómico y Transaccional (PostgreSQL RPC)
- Para evitar inconsistencias donde un ticket se marque como usado pero falle el registro de identidad o el comercio no exista, todo el flujo se consolidó en la función PostgreSQL con `SECURITY DEFINER`:
  `public.enroll_terminal_with_ticket(p_ticket_hash, p_installation_id, p_token_hash)`
- Si el comercio no está pre-provisionado en `merchants`, la RPC aborta con `MERCHANT_NOT_PROVISIONED` y el ticket **permanece intacto** (`pending`).
- El consumo del ticket utiliza un `UPDATE ... WHERE status = 'pending' AND expires_at > now()` con bloqueo a nivel de fila (`ROW LOCK`), impidiendo que dos solicitudes concurrentes utilicen el mismo ticket.

### D. Eliminación de Creación Arbitraria de Comercios
- `/enroll` ya no realiza `INSERT` en `merchants`.
- La terminal solo puede enrolarse si el comercio fue previamente creado por el proceso de administración comercial.

### E. Blindaje de Identidad en `/register`
- `/register` ya no acepta ni procesa `commerceId` o `installationId` provenientes del payload.
- Solo permite actualizar campos comerciales legítimos definidos en la allowlist: `name`, `address`, `phone`, `installer`, `business_type`, `province_code`, `province_name`, `city_code`, `city_name`, `app_version`.

### F. Validación de Campañas en Lote en `/events`
- Se evalúan los `campaign_id` únicos de cada lote en una sola consulta (`.in('id', uniqueCampaignIds)`).
- **Regla estricta**: Si un evento declara un `campaign_id` que no existe en `campaigns`, dicho evento es **descartado del lote** (no se transforma en `null`), protegiendo la fidelidad de las métricas. Eventos sin campaña legítimos (nulos) se conservan.

---

## 4. ESTADO DE LOS COMPONENTES Y DESPLIEGUE

* **Edge Function `terminal-sync`**: Actualizada localmente en `supabase/functions/terminal-sync/index.ts`. No desplegada a Supabase Cloud (cumplimiento de Regla 44 y Regla 55).
* **Script SQL**: Preparado en `SECURITY_PHASE_0_2_1_SUPABASE.sql` con su correspondiente `SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql`. No ejecutado en Supabase Cloud.
* **Cliente Electron / React**: Actualizado quirúrgicamente en `src/services/terminalIdentityService.js` para consumir el ticket y no borrar credenciales ante 401. Compilación verificada con Vite (`npm run build`).
