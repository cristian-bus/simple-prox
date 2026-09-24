# ARQUITECTURA DE SEGURIDAD — FASE 0.2.1 / 0.2.1a / 0.2.1b: ENROLAMIENTO SEGURO Y CONTROL DE IDENTIDAD
**Proyecto:** KioscoProX / Simple ProX  
**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2.1b-revocation-hardening`  
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
   - `/issue-ticket` aceptaba `body.commerceId` y `body.storeName` del cliente en lugar de derivarlos server-side.
4. **Validación de rol Admin en emisión de tickets**:
   - El endpoint `/issue-ticket` verificaba únicamente `auth.getUser(jwt)`, confundiendo cualquier usuario `authenticated` con un `admin` con privilegios para autorizar terminales.
5. **Riesgo de Reactivación de Terminales Revocadas/Suspendidas (Fase 0.2.1b)**:
   - La RPC utilizaba `ON CONFLICT (installation_id) DO UPDATE SET status = 'active'`, lo que permitía que un ticket reactivara una terminal revocada o suspendida por razones de seguridad.
6. **Múltiples Tickets Pendientes Simultáneos (Fase 0.2.1b - Ajuste Final)**:
   - Se permitía emitir múltiples tickets pendientes vigentes para la misma terminal, incrementando la superficie de exposición innecesariamente.
7. **Comportamiento destructivo ante HTTP 401**:
   - `src/services/terminalIdentityService.js` eliminaba la credencial local ante cualquier 401 transitorio o desautorización, provocando que la terminal intentase reenrolarse sin ticket y quedase bloqueada en 409.

---

## 2. MODELO DE AUTORIZACIÓN: ENROLLMENT TICKETS DE UN SOLO USO

Para mitigar el First-Claim Hijacking sin introducir secretos globales compartidos en el cliente (prohibido por la Regla 6 de `AGENTS.md`), se diseñó un modelo de **Enrollment Ticket** emitido y controlado exclusivamente server-side:

```text
       ┌────────────────────────┐
       │ Administrador Auténtico│ (Sesión Supabase Auth en panel-admin)
       └───────────┬────────────┘
                   │ 1. POST /issue-ticket (JWT Bearer, installationId)
                   ▼
       ┌────────────────────────┐
       │ terminal-sync Function │
       └───────────┬────────────┘
                   │ 2. Verificar auth.getUser(jwt) -> user.id
                   │ 3. Consultar public.admin_users (is_active = true) -> Si NO: 403 Forbidden
                   │ 4. Consultar public.merchants (id = installationId) -> Si NO: 422 MERCHANT_NOT_PROVISIONED
                   │ 5. Consultar public.terminal_identities (installation_id):
                   │    - active -> 409 ALREADY_ENROLLED
                   │    - revoked/suspended/otro -> 409 REENROLL_REQUIRES_ADMIN_RESET
                   │ 6. Comprobar tickets pending existentes para installationId:
                   │    - Si existe vigente (expires_at > now) -> 409 ENROLLMENT_TICKET_ALREADY_PENDING
                   │    - Si existe expirado (expires_at <= now) -> UPDATE status='expired' (conserva historial)
                   │ 7. Derivar server-side: commerce_id y store_name desde merchants
                   │    (Ignorar totalmente body.commerceId y body.storeName)
                   ▼
       ┌────────────────────────┐
       │ Generar Ticket Cripto  │ (32 bytes aleatorios criptográficos, prefijo 'spx_ticket_')
       │ Duración: 30 minutos   │ (Fijada estrictamente en backend)
       └───────────┬────────────┘
                   │ 8. INSERT INTO terminal_enrollment_tickets
                   │    (Protegido por UNIQUE INDEX parcial WHERE status = 'pending')
                   ▼
       ┌────────────────────────┐
       │ Retornar Ticket Crudo  │ (Entregado al operador/instalador una sola vez)
       └───────────┬────────────┘
                   │ 9. Instalador/Kiosco ingresa el ticket
                   ▼
       ┌────────────────────────┐
       │ POST /enroll (Kiosco)  │ ({ installationId, enrollmentTicket })
       └───────────┬────────────┘
                   │ 10. Invocar RPC enroll_terminal_with_ticket
                   ▼
       ┌────────────────────────────────────────────────────────┐
       │ Transacción Atómica en PostgreSQL (RPC SECURITY DEFINER)│
       │ a) Precondición 1: ¿Existe identidad previa?           │
       │    - active -> 409 ALREADY_ENROLLED                    │
       │    - revoked/suspended/otro -> 409 REENROLL...RESET    │
       │    (Ticket NO se consume)                              │
       │ b) Precondición 2: ¿merchant pre-provisionado?         │
       │    NO -> Retorna 422 MERCHANT_NOT_PROVISIONED          │
       │    (Ticket NO se consume)                              │
       │ c) UPDATE terminal_enrollment_tickets                  │
       │    SET status='used', used_at=now()                    │
       │    WHERE ticket_hash=$1 AND installation_id=$2         │
       │      AND status='pending' AND expires_at > now()       │
       │    (Row-level lock, previene doble consumo concurrente)│
       │ d) INSERT INTO terminal_identities                     │
       │    (ESTRICTO, SIN ON CONFLICT DO UPDATE)               │
       └───────────┬────────────────────────────────────────────┘
                   │ 11. Emitir terminalToken permanente a la terminal
                   ▼
       ┌────────────────────────┐
       │ Terminal Simple ProX   │
       │ Guarda token en DPAPI  │
       └────────────────────────┘
```

---

## 3. PROPIEDADES DE SEGURIDAD DEL DISEÑO

### A. Regla de Ticket Pending Único y Protección ante Concurrencia (Fase 0.2.1b)
- **Regla Estricta**: Solo puede existir **como máximo un ticket en estado `pending`** por `installationId`.
- **Garantía en TypeScript (Edge Function)**:
  - Antes de generar un ticket, consulta la tabla de tickets por `installation_id` y `status = 'pending'`.
  - Si encuentra uno vigente (`expires_at > now()`), rechaza con HTTP 409 `ENROLLMENT_TICKET_ALREADY_PENDING`.
  - Si encuentra uno expirado (`expires_at <= now()`), lo actualiza a `status = 'expired'` preservando el historial para auditoría (no se elimina ningún registro).
- **Garantía en PostgreSQL (Base de Datos)**:
  - Se define un índice único parcial en PostgreSQL:
    ```sql
    CREATE UNIQUE INDEX idx_terminal_enrollment_tickets_single_pending 
      ON public.terminal_enrollment_tickets (installation_id) 
      WHERE (status = 'pending');
    ```
  - Si dos solicitudes concurrentes intentan insertar simultáneamente un ticket `pending` para la misma terminal, el motor PostgreSQL bloquea la segunda por violación de unicidad (`error 23505`).
  - La Edge Function captura este error específico y lo traduce en HTTP 409 `ENROLLMENT_TICKET_ALREADY_PENDING` (evitando errores 500).

### B. Reglas Estrictas de Estados e Imposibilidad de Reactivación (Fase 0.2.1b)
- **No existe identidad previa**: Se permite el enrolamiento normal si el ticket es válido y el comercio está provisionado.
- **Existe identidad con `status = 'active'`**: Se rechaza con error 409 `ALREADY_ENROLLED`.
- **Existe identidad con `status = 'revoked'`**: Se rechaza con error 409 `REENROLL_REQUIRES_ADMIN_RESET`.
- **Existe identidad con `status = 'suspended'`**: Se rechaza con error 409 `REENROLL_REQUIRES_ADMIN_RESET`.
- **Existe identidad con cualquier otro estado**: Falla cerrado (`FAIL CLOSED`) rechazando con error 409 `REENROLL_REQUIRES_ADMIN_RESET`.
- **Eliminación de `ON CONFLICT DO UPDATE`**: La RPC realiza únicamente un `INSERT` estricto en `terminal_identities`. Bajo ninguna circunstancia un ticket normal puede sobrescribir un registro revocado o suspendido.
- **Conservación para auditoría**: Las identidades revocadas o suspendidas no se borran de la base de datos.

### C. Derivación Server-Side en `/issue-ticket` (Fase 0.2.1b)
- El administrador solo envía el `installationId`.
- El servidor comprueba la existencia de la fila en `merchants` y extrae directamente de la base de datos el `commerce_id` y el `name`.
- Si el request incluye `body.commerceId` o `body.storeName`, son **completamente ignorados**, impidiendo ataques de asignación cruzada de comercios (`installationId = A, commerceId = B`).
- Si el comercio no está pre-provisionado, se responde con HTTP 422 `MERCHANT_NOT_PROVISIONED` y no se emite ningún ticket.

### D. Autoridad Administrativa Real (`admin_users`)
- No se confía en `auth.role() = 'authenticated'`. Un usuario común registrado en Supabase no puede emitir tickets.
- Se implementó la tabla privada `public.admin_users` que vincula `user_id UUID REFERENCES auth.users(id)` con `is_active BOOLEAN`.
- RLS activada con denegación absoluta para roles públicos (`anon`, `authenticated`). Solo `service_role` (usado por la Edge Function) puede consultarla.
- **Bootstrap del primer admin**: Operación manual/controlada ejecutada por el operador de infraestructura directamente en SQL:
  ```sql
  INSERT INTO public.admin_users (user_id, is_active, notes)
  VALUES ('<UUID_DEL_USUARIO_EN_AUTH_USERS>', true, 'Superadmin inicial');
  ```

### E. Duración Estricta del Ticket (30 Minutos)
- La expiración es fijada unilateralmente por el servidor: `Date.now() + 30 * 60 * 1000`.
- El cliente no puede enviar parámetros `duration`, `ttl` ni `expiresAt`.
- Si el ticket no es canjeado en 30 minutos, expira automáticamente.

### F. Consumo Atómico y Transaccional (PostgreSQL RPC)
- Todo el flujo de verificación y enrolamiento se consolidó en la función PostgreSQL con `SECURITY DEFINER`:
  `public.enroll_terminal_with_ticket(p_ticket_hash, p_installation_id, p_token_hash)`.
- Si la terminal ya existe, o el comercio no está pre-provisionado, la RPC aborta antes de tocar el ticket, por lo que **el ticket permanece intacto** (`pending`).
- El consumo del ticket utiliza un `UPDATE ... WHERE status = 'pending' AND expires_at > now()` con bloqueo a nivel de fila (`ROW LOCK`), impidiendo que dos solicitudes concurrentes utilicen el mismo ticket.

### G. Blindaje de Identidad en `/register`
- `/register` ya no acepta ni procesa `commerceId` o `installationId` provenientes del payload.
- Solo permite actualizar campos comerciales legítimos definidos en la allowlist: `name`, `address`, `phone`, `installer`, `business_type`, `province_code`, `province_name`, `city_code`, `city_name`, `app_version`.

### H. Validación de Campañas en Lote en `/events`
- Se evalúan los `campaign_id` únicos de cada lote en una sola consulta (`.in('id', uniqueCampaignIds)`).
- **Regla estricta**: Si un evento declara un `campaign_id` que no existe en `campaigns`, dicho evento es **descartado del lote** (no transformado en `null`), protegiendo la fidelidad de las métricas. Eventos sin campaña legítimos (nulos) se conservan.

---

## 4. ESTADO DE LOS COMPONENTES Y DESPLIEGUE

* **Edge Function `terminal-sync`**: Actualizada localmente en `supabase/functions/terminal-sync/index.ts`. No desplegada a Supabase Cloud (cumplimiento de Regla 44 y Regla 55).
* **Script SQL**: Preparado en `SECURITY_PHASE_0_2_1_SUPABASE.sql` con su correspondiente `SECURITY_PHASE_0_2_1_SUPABASE_ROLLBACK.sql`. No ejecutado en Supabase Cloud.
* **Cliente Electron / React**: Actualizado quirúrgicamente en `src/services/terminalIdentityService.js` para consumir el ticket y no borrar credenciales ante 401. Compilación verificada con Vite (`npm run build`).
