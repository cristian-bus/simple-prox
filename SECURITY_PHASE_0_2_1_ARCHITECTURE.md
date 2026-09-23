# KioscoProX / Simple ProX — Arquitectura de Seguridad Fase 0.2.1
## Corrección del Enrolamiento de Terminales (Mitigación de First-Claim Hijacking)

**Versión:** 1.3.9  
**Fecha:** 23 de Septiembre de 2026  
**Rama:** `security/phase-0.2.1-secure-enrollment`  
**Commit de Respaldo Previo:** `11089dc`  
**Puntos de Restauración Previos:** `772c9b4` (Fase 0.2) / `8e9c85b` (Fase 0.1) / `2605667` (Fase 0)

---

## 1. Auditoría del Código Real Desplegado y Problemas Confirmados

Tras la auditoría del código real desplegado en Supabase Edge Function `terminal-sync` (`index.ts`), se identificaron dos discrepancias y una vulnerabilidad crítica:

### 1.1 Vulnerabilidad Crítica: First-Claim / Enrollment Hijacking en `POST /enroll`
* **Código Auditado:**
  ```typescript
  if (action === "enroll" && req.method === "POST") {
    const body = await req.json();
    const installationId = String(body.installationId || "").trim();
    // 1. Solo verifica si ya existe en terminal_identities
    const { data: existingIdentity } = await adminClient
      .from("terminal_identities")
      .select("installation_id, status")
      .eq("installation_id", installationId)
      .maybeSingle();

    if (existingIdentity && existingIdentity.status === "active") {
      return new Response(JSON.stringify({ error: "Terminal ya enrolada..." }), { status: 409 });
    }
    // 2. Emite token sin ninguna prueba de autorización
    const rawToken = "spx_term_" + ...;
    // 3. Si no existe en merchants, crea un comercio automáticamente
    if (!existingMerchant) {
      await adminClient.from("merchants").insert({ id: installationId, ... });
    }
  ```
* **Impacto:** Conocer o enumerar un `installationId` aún no enrolado permitía a un atacante reclamarlo de forma arbitraria, obteniendo un `terminalToken` legítimo y bloqueando permanentemente a la terminal real con HTTP 409. Además, `/enroll` actuaba como vía abierta para crear comercios sin control administrativo.

### 1.2 Discrepancia en Validación de Métricas (`POST /events`)
* **Discrepancia Auditada:** La documentación de Fase 0.2 afirmó que `/events` validaba la existencia de `campaign_id` en la tabla `campaigns`. En el código real, `campaign_id` se insertaba directamente sin validar su existencia contra la base de datos.

### 1.3 Vulnerabilidad de Recuperación en el Cliente (`terminalIdentityService.js`)
* **Código Auditado:** Ante una respuesta HTTP 401, el cliente purgaba de inmediato su token local (`kioscoprox_terminal_cred_enc`). En la sincronización siguiente, intentaba re-enrolarse sin ticket y recibía HTTP 409, quedando permanentemente incomunicada.

---

## 2. Nueva Arquitectura: Enrollment Tickets de Un Solo Uso

Para eliminar el first-claim sin utilizar secretos globales compartidos en los clientes ni exponer `SUPABASE_SERVICE_ROLE_KEY`, se separa estrictamente:

```text
AUTORIZAR ENROLAMIENTO (Server-Side)  ≠  CONSUMIR AUTORIZACIÓN (/enroll)
```

```text
               ┌────────────────────────────────────────────────────────┐
               │                    SUPABASE CLOUD                      │
               │                                                        │
[ Admin / POS ]│   [ terminal-sync ]                                    │
       │       │     ├── 1. POST /issue-ticket                          │
       │       │     │    Valida sesión Admin (Supabase Auth)           │
       │       │     │    o Master Key server-side (Hash seguro)        │
       │       │     │    Emite enrollmentTicket (256 bits, 24h exp)    │
       │       │     │                                                  │
       ▼       │     ├── 2. POST /enroll                                │
[ Terminal ] ──┼───► │    Recibe installationId + enrollmentTicket      │
               │     │    UPDATE atómico en terminal_enrollment_tickets │
               │     │    Emite terminalToken individual                │
               │     │                                                  │
               │     └── 3. POST /events                                │
               │          Valida en lote campaign_id existentes         │
               │          Fuerza merchant_id = authenticated_id         │
               │                                                        │
               │   [ Tablas Privadas ]                                  │
               │     ├── public.terminal_enrollment_tickets (RLS: Auth) │
               │     ├── public.terminal_identities (RLS: Privada)      │
               │     └── public.merchants / campaign_events             │
               └────────────────────────────────────────────────────────┘
```

---

## 3. Especificación Técnica de Componentes

### 3.1 Tabla `public.terminal_enrollment_tickets`
```sql
CREATE TABLE public.terminal_enrollment_tickets (
  ticket_hash TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  commerce_id TEXT,
  store_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
  created_by TEXT DEFAULT 'admin'
);

ALTER TABLE public.terminal_enrollment_tickets ENABLE ROW LEVEL SECURITY;

-- Acceso público PostgREST: DENEGADO (anon no puede listar ni crear tickets)
-- Administradores autenticados: Acceso total para gestión desde Panel Admin
CREATE POLICY "enrollment_tickets_admin_all" ON public.terminal_enrollment_tickets
FOR ALL TO public
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

### 3.2 Consumo Atómico de Tickets (Prevención de Race Conditions)
Para evitar que dos peticiones concurrentes consuman el mismo ticket simultáneamente, la validación y el marcado se ejecutan en una única sentencia atómica de PostgreSQL:
```sql
UPDATE public.terminal_enrollment_tickets
SET status = 'used', used_at = now()
WHERE ticket_hash = $1
  AND installation_id = $2
  AND status = 'pending'
  AND expires_at > now()
RETURNING installation_id, commerce_id, store_name;
```
Si dos peticiones llegan con el mismo ticket, PostgreSQL bloquea la fila: la primera transacción la actualiza exitosamente y la segunda obtiene 0 filas afectadas, siendo rechazada inmediatamente.

### 3.3 Ciclo de Vida del Ticket
* **Entropía:** 256 bits generados criptográficamente (`spx_ticket_` + 64 caracteres hex aleatorios).
* **Almacenamiento Server-Side:** Solo se almacena el hash SHA-256 del ticket (`ticket_hash`). El ticket en texto plano solo lo conoce la terminal receptora.
* **Expiración:** 24 horas (duración finita; tickets no utilizados expiran automáticamente).
* **Uso Único:** Un ticket solo puede ser consumido una vez para el `installation_id` asignado.

---

## 4. Estrategia para Terminales Existentes y Nuevas

### 4.1 Terminales Nuevas
1. El técnico o comercio realiza la activación.
2. La terminal envía la solicitud de ticket al endpoint seguro server-side.
3. El servidor valida la autoridad, emite el `enrollmentTicket` de corta duración vinculado a ese `installationId`.
4. La terminal consume el ticket en `/enroll` y recibe su `terminalToken`.
5. Se almacena cifrado con Windows DPAPI (`safeStorage`).
6. `/enroll` ya **NO** crea comercios huérfanos sin ticket válido.

### 4.2 Terminales Existentes en Campo (9 Comercios en Producción)
1. Los 9 comercios existentes ya cuentan con `businessConfig.isActivated === true`.
2. Para evitar requerir que los 9 comercios ingresen claves nuevamente, se pre-generan tickets de migración controlados en la tabla `terminal_enrollment_tickets` vinculados a sus respectivos `installationId` existentes.
3. Al conectarse, la terminal solicita su migración presentando su identidad existente y consume su ticket de migración pre-asignado.
4. Una vez consumido, la identidad queda blindada de forma definitiva en `terminal_identities`.

---

## 5. Validación Batch Eficiente de `campaign_id` en `/events`

Para resolver la discrepancia de validación sin degradar el rendimiento con $N$ consultas a la base de datos:
1. Se extraen los `campaign_id` únicos no nulos del lote (máximo 50 eventos).
2. Se realiza una única consulta batch a PostgreSQL:
   ```typescript
   const { data: validCampaigns } = await adminClient
     .from("campaigns")
     .select("id")
     .in("id", uniqueCampaignIds);
   ```
3. Se construye un `Set` en memoria y se descartan o anulan los eventos cuyo `campaign_id` no exista en la base de datos activa.

---

## 6. Manejo Seguro de Errores 401 en el Cliente

Se actualiza [`src/services/terminalIdentityService.js`](file:///c:/Users/Pininas/KioscoProX/src/services/terminalIdentityService.js):
* Ante un error HTTP 401, **NO se borra el token local**.
* Se suspende temporalmente el intento de sincronización en el Outbox para evitar saturar el servidor con peticiones fallidas.
* El POS (ventas, stock, caja) continúa funcionando 100% offline sin interrupción.
* Si el token fue revocado administrativamente, se requiere un ticket de re-enrolamiento emitido por el administrador para actualizar la credencial.
