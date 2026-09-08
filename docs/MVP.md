# Definición del MVP Comercial (Fase 10) - KioscoProX

Este documento define el alcance estricto del **Producto Mínimo Viable (MVP)** para el canal de ofertas B2B de KioscoProX, según lo estipulado en las Reglas 9, 28 y 29 de `AGENTS.md`.

---

## 1. Propósito de Validación Comercial

El objetivo del MVP no es agregar funcionalidades complejas, sino validar empíricamente dos hipótesis clave de negocio:
1. **¿Los comercios utilizan el sistema?** (Visualizan ofertas, abren promociones y hacen clics hacia WhatsApp).
2. **¿Los mayoristas están dispuestos a pagar por anunciarse en esa red?** (Reciben consultas y pedidos reales de kioscos con código de campaña trazable).

Meta de validación:
```text
5 a 10 Comercios Activos  +  1 a 2 Mayoristas Aliados  +  Campañas Reales  +  Métricas Reales
```

---

## 2. Funcionalidades Incluidas en el MVP

- **Campañas B2B**: Título, imagen optimizada, precios y cálculo automático de descuento (%) y ahorro ($).
- **Fechas de Vigencia**: Fecha de inicio y fin con cálculo dinámico de estados (`active`, `scheduled`, `finished`, `paused`, `draft`).
- **Widget y Rotación en Caja**: Banners rotativos cada 10 segundos en la pantalla del POS.
- **Canal WhatsApp**: Generación de mensaje dinámico con código único de campaña (`SPX-XXXXX`) para trazabilidad de ventas mayoristas.
- **Métricas Confiables**: Registro local offline e inserción en nube de impresiones, aperturas y clics a WhatsApp.
- **Panel Administrador**:
  - CRUD de campañas con previsualización fiel.
  - Métricas filtradas por período (Hoy, 7 días, 30 días, Mes, Historial) sin cortes de paginación.
  - Exportación de reportes en formato Excel (CSV con BOM) e impresión PDF para mayoristas.
  - Directorio de comercios conectados y directorio de mayoristas.
- **Regla de Licencias**: Plan Básico con anuncios obligatorios; Plan PRO con interruptor para ocultar anuncios en caja.

---

## 3. Funcionalidades Excluidas Explícitamente del MVP

Para evitar sobreingeniería y preservar la agilidad, **NO se implementan en el MVP**:
- Marketplace con pasarela de pagos integrada.
- Facturación electrónica B2B automatizada.
- Algoritmos de Inteligencia Artificial para recomendaciones.
- Comparación automática de precios de mayoristas.
- Generación automática de órdenes de compra directas.

Toda evolución hacia pedidos estructurados queda reservada para las Fases 11 y subsiguientes una vez validada la tracción del canal.
