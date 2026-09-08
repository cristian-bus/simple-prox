# Guía de Instalación, Identidad y Perfil del Comercio

## 1. Identidad de Instalación (`installationId`)

Cada equipo o terminal que ejecuta Simple ProX posee un identificador persistente:

- **Instalaciones Existentes**:
  El sistema detecta automáticamente la configuración previa en `kioscoprox_business_config`. Si existe un `installationId` previo (por ejemplo `LTMEI6YT`, `WG6KX8UI`), **se conserva con exactitud absoluta**. Queda prohibido regenerar o sobreescribir este ID ya que revocaría las licencias Pro asociadas.
- **Instalaciones Nuevas**:
  Se genera un UUID seguro estándar (`crypto.randomUUID()`) y se guarda de forma inmutable en `kioscoprox_installation_id`.

---

## 2. Modelo de Perfil de Comercio (`CommerceProfile`)

El perfil se gestiona a través de `src/services/installationService.js` con los siguientes campos:

```json
{
  "installationId": "LTMEI6YT",
  "commerceId": "COMM-4A8F2B1C",
  "storeName": "Kiosco Central",
  "businessType": "kiosco",
  "provinceCode": "AR-D",
  "provinceName": "San Luis",
  "cityCode": "SL-CAPITAL",
  "cityName": "San Luis Capital",
  "postalCode": "5700",
  "address": "Av. Illia 123",
  "phone": "2664805745",
  "appVersion": "1.3.1",
  "plan": "Pro",
  "status": "active",
  "registeredAt": "2026-09-01T12:00:00Z",
  "lastSeenAt": "2026-09-07T21:00:00Z"
}
```

---

## 3. Onboarding y Normalización Geográfica

El proceso de Onboarding consta de 3 pasos ágiles:
1. **Nombre del Negocio**: Registro del nombre comercial.
2. **Ubicación Normalizada**: Selección de Provincia y Ciudad mediante el catálogo local `src/utils/argentinaGeo.js`.
3. **Rubro**: Selección del nicho comercial (`kiosco`, `almacen`, `libreria`, `petshop`, `barberia`).

No se depende de APIs geográficas externas para garantizar funcionamiento 100% offline.
