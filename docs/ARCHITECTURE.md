# Arquitectura del Sistema Simple ProX (KioscoProX)

Este documento detalla la arquitectura técnica integral de la aplicación **Simple ProX**, en conformidad con las directivas de `AGENTS.md` y las especificaciones del Master Prompt de Distribución Masiva.

---

## 1. Visión General y Principio Fundamental

Simple ProX es una aplicación de escritorio para Windows concebida bajo el paradigma **Offline-First**. 
El núcleo del punto de venta (caja, turnos, productos, stock, ventas, clientes y reportes locales) es **100% autónomo** y funciona de manera ininterrumpida sin conexión a Internet en `localStorage`.

Las operaciones cloud (identidad, sincronización de métricas, catálogos B2B, configuración remota y actualización automática) operan como una capa complementaria y desacoplada en segundo plano:

```text
                                SIMPLE PROX
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 ▼                                       ▼
         NÚCLEO POS LOCAL                           CAPA CLOUD & B2B
        (100% Offline-First)                      (Desacoplada y Async)
                 │                                       │
     ┌───────────┴───────────┐               ┌───────────┼───────────┐
     │                       │               │           │           │
     ▼                       ▼               ▼           ▼           ▼
   Caja y                  Stock y     Installation   Sync &     RemoteConfig
  Ventas                 Inventario     & Commerce    Outbox      & Updates
     │                       │               │           │           │
     └───────────┬───────────┘               └───────────┼───────────┘
                 │                                       │
       localStorage Local                                │ HTTPS (Async)
       (Sin dependencias)                                ▼
                                                  SUPABASE CLOUD
                                                (qtixbiikhvhzwshfgyeo)
                                            - merchants (identidad y geo)
                                            - remote_config (versionado)
                                            - campaigns (targeting B2B)
                                            - campaign_events (métricas)
```

---

## 2. Stack Tecnológico

- **Contenedor Desktop**: Electron 41 (Node.js runtime, Chromium integrado, `contextIsolation: true`).
- **Frontend / Renderer**: React 19 + Vite 7.
- **Iconografía**: Lucide React.
- **Almacenamiento Local**: `localStorage` nativo para datos del POS, cola Outbox y cachés offline.
- **Backend Remoto B2B**: Supabase (PostgreSQL 15 + PostgREST REST API + Storage).
- **Actualización Automática**: `electron-updater` (Generic Provider desacoplado).
- **Normalización Geográfica**: Diccionario estático local de provincias y ciudades (`argentinaGeo.js`).

---

## 3. Identidad y Separación de Conceptos

1. **`installationId`**:
   - Identifica una terminal o máquina física concreta.
   - **Regla Crítica**: Si una terminal ya cuenta con un ID preexistente (ej. `LTMEI6YT`, `WG6KX8UI`), se preserva exactamente y nunca se regenera, protegiendo las licencias vigentes.
   - Para instalaciones nuevas, se genera un UUID seguro estándar (`crypto.randomUUID()`).
2. **`commerceId`**:
   - Identifica la entidad comercial en la nube (`COMM-UUID`).
   - Preparado para soportar múltiples terminales por comercio ($1 \text{ Comercio} \to N \text{ Terminales}$).
3. **`licenseId` / `licenseKey`**:
   - Clave criptográfica calculada mediante $\text{Hash32}(installationId + \text{"KioscoProX\_Secret\_2026"})$.
   - Gestiona el acceso al Plan Pro (ocultar publicidad en caja).

---

## 4. Servicios de la Capa Cloud

- **`installationService.js`**: Gestión inmutable del `installationId`, creación de `commerceId` y administración del `CommerceProfile`.
- **`connectivityService.js`**: Monitor activo de conexión real con ping HTTP y eventos reactivos (`ONLINE`, `OFFLINE`, `CHECKING`).
- **`syncService.js`**: Motor central con patrón Outbox (`kioscoprox_outbox`), reintentos con backoff exponencial e idempotencia.
- **`remoteConfigService.js`**: Configuración remota versionada y validada en caliente (`DEFAULT_CONFIG` + caché local).
- **`updateService.js`**: Coordinador de AutoUpdate en el frontend, bloqueando reinicios si la caja está abierta (`caja.isOpen`).

---

## 5. Delimitación de Datos: Local vs Cloud

| Dominio | Entidades | Almacenamiento | Tolerancia a Fallos de Red |
| :--- | :--- | :--- | :--- |
| **POS Local** | Ventas, Tickets, Caja, Turnos, Stock, Productos, Clientes, Deudas, Compras | `localStorage` | **100% Inmune a caídas de red** |
| **Cloud & B2B** | Perfil de Comercio, Telemetría, Campañas B2B, Eventos, Configuración Remota | Supabase + Caché Local | Encolado en Outbox con reintentos automáticos |
