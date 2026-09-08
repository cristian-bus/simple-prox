# AGENTS.md

## PROPÓSITO

Este archivo contiene las reglas maestras que deben respetarse durante TODO el desarrollo de este proyecto.

Estas instrucciones tienen prioridad sobre decisiones improvisadas durante una tarea.

El proyecto es una aplicación de gestión comercial para Windows orientada inicialmente a kioscos y pequeños comercios.

La aplicación incluye o incluirá:

* POS / Caja
* Ventas
* Productos
* Inventario
* Compras
* Clientes
* Proveedores
* Reportes
* Usuarios
* Licencias
* Configuración
* Funcionamiento offline
* Ofertas comerciales B2B
* Proveedores y distribuidores
* Futuramente pedidos B2B

La aplicación está desarrollada con Electron + React + Vite, salvo que la auditoría del proyecto indique otra arquitectura.

---

# 1. REGLA PRINCIPAL

## NO ROMPER LO QUE YA FUNCIONA

Antes de modificar cualquier funcionalidad existente:

1. Analizar el código actual.
2. Entender cómo funciona.
3. Identificar dependencias.
4. Identificar efectos secundarios.
5. Evaluar impacto.
6. Proponer el cambio.
7. Implementar de forma incremental.
8. Probar.
9. Verificar que las funcionalidades existentes continúan funcionando.

Nunca reemplazar una implementación funcional simplemente porque existe una alternativa "más moderna".

---

# 2. NO REESCRIBIR EL PROYECTO

Está PROHIBIDO realizar una reescritura general de la aplicación salvo autorización explícita.

No:

* migrar todo el proyecto innecesariamente;
* cambiar de framework;
* cambiar de base de datos;
* cambiar arquitectura;
* reorganizar todo el código;
* reemplazar módulos completos;

si no existe una razón técnica demostrable.

Preferir:

* cambios pequeños;
* módulos independientes;
* reutilización;
* refactorización incremental.

---

# 3. REGLA DE ORDEN DE TRABAJO

El desarrollo debe realizarse por fases.

Nunca saltar arbitrariamente entre fases.

El orden general es:

```text
FASE 0
Auditoría

↓

FASE 1
Estabilización del proyecto

↓

FASE 2
Arquitectura del sistema de ofertas

↓

FASE 3
Backend/API

↓

FASE 4
Panel administrador

↓

FASE 5
Integración Electron

↓

FASE 6
Caché y funcionamiento offline

↓

FASE 7
Métricas

↓

FASE 8
WhatsApp / CTA

↓

FASE 9
Pruebas

↓

FASE 10
MVP comercial

↓

FASE 11
Evolución B2B
```

## REGLA CRÍTICA

NO avanzar a la siguiente fase hasta que:

* la fase actual esté implementada;
* las pruebas correspondientes pasen;
* no existan errores críticos;
* la funcionalidad haya sido verificada;
* se haya documentado lo realizado.

Si una fase tiene errores, permanecer en esa fase.

---

# 4. PROTOCOLO OBLIGATORIO ANTES DE PROGRAMAR

Antes de modificar código, el agente debe responder internamente:

### ¿Qué estoy modificando?

### ¿Por qué?

### ¿Qué dependencias tiene?

### ¿Qué funcionalidades puede afectar?

### ¿Cómo voy a probarlo?

### ¿Qué archivos voy a modificar?

No realizar modificaciones masivas sin necesidad.

---

# 5. SI ENCUENTRAS UN ERROR

Cuando se detecte un error:

NO continuar agregando funcionalidades encima del error.

Primero:

1. reproducir el error;
2. encontrar la causa;
3. determinar si es regresión o problema preexistente;
4. corregir;
5. ejecutar pruebas;
6. verificar funcionalidades relacionadas;
7. documentar la solución.

Después continuar.

---

# 6. NO OCULTAR ERRORES

Está prohibido:

* silenciar errores;
* ocultar excepciones;
* eliminar logs solamente para evitar mensajes;
* agregar `try/catch` sin resolver la causa;
* desactivar validaciones;
* utilizar soluciones temporales sin documentarlas.

Si se utiliza un workaround temporal:

Debe quedar documentado como:

```text
TEMPORARY WORKAROUND
```

y explicar:

* motivo;
* limitación;
* solución definitiva pendiente.

---

# 7. OFFLINE-FIRST

La aplicación principal debe seguir funcionando sin Internet.

Esto es una REGLA FUNDAMENTAL.

Sin Internet deben continuar funcionando:

* ventas;
* caja;
* productos;
* inventario;
* clientes;
* proveedores;
* compras;
* reportes;
* configuración local.

Las funciones online deben ser complementarias.

Nunca permitir que:

```text
Internet caído
```

provoque:

```text
POS inutilizable
```

---

# 8. NUEVO SISTEMA DE OFERTAS

El sistema de ofertas debe ser independiente del núcleo del POS.

Conceptualmente:

```text
APLICACIÓN
│
├── POS
├── STOCK
├── PRODUCTOS
├── CLIENTES
├── PROVEEDORES
├── REPORTES
│
└── OFERTAS B2B
       │
       ├── Campañas
       ├── Banners
       ├── Ofertas
       ├── CTA
       ├── WhatsApp
       └── Métricas
```

Las ofertas nunca deben bloquear:

* ventas;
* caja;
* stock;
* inicio de sesión;
* funcionamiento offline.

---

# 9. MVP

El MVP debe mantenerse pequeño.

### MVP:

* campañas;
* banners;
* imágenes;
* fechas;
* activación/desactivación;
* rotación;
* caché;
* CTA;
* WhatsApp;
* impresiones;
* clicks;
* sincronización.

NO implementar todavía:

* marketplace;
* pedidos completos;
* IA;
* comparación automática de proveedores;
* recomendaciones inteligentes;
* pagos;
* facturación B2B;
* automatización avanzada.

---

# 10. EVOLUCIÓN FUTURA

La arquitectura debe permitir evolucionar posteriormente hacia:

```text
OFERTAS
   ↓
CATÁLOGOS
   ↓
PROVEEDORES
   ↓
STOCK DEL COMERCIO
   ↓
RECOMENDACIONES
   ↓
PEDIDOS
   ↓
MARKETPLACE B2B
```

Pero NO implementar funcionalidades futuras antes de terminar el MVP.

---

# 11. INTEGRACIÓN CON STOCK

La futura integración entre stock y ofertas debe considerarse desde el diseño.

Ejemplo:

```text
Stock Coca-Cola = 2
Stock mínimo = 10

↓

Detectar necesidad

↓

Buscar oferta

↓

Mostrar proveedor

↓

Consultar / pedir
```

No implementar esta automatización en el MVP salvo autorización explícita.

---

# 12. SEGURIDAD

Nunca almacenar secretos sensibles en:

* React;
* Electron renderer;
* archivos públicos;
* variables visibles al cliente;
* código distribuido.

Nunca confiar exclusivamente en controles del frontend.

Todo permiso importante debe validarse en backend cuando corresponda.

No enviar datos innecesarios de clientes.

Nunca enviar a servidores externos:

* nombres de clientes;
* teléfonos;
* historial personal;
* información sensible;

si no es estrictamente necesario y autorizado.

---

# 13. PRIVACIDAD

Recolectar únicamente la información necesaria.

Las métricas mínimas pueden incluir:

* merchant_id;
* campaign_id;
* event_type;
* timestamp;
* versión de aplicación.

Evitar recolectar información personal innecesaria.

---

# 14. MÉTRICAS

Los eventos deben ser resistentes a:

* pérdida de conexión;
* duplicación;
* errores de red.

Cuando no haya Internet:

```text
evento
↓
cola local
↓
Internet disponible
↓
sincronización
↓
confirmación
```

Utilizar mecanismos de idempotencia.

---

# 15. RENDIMIENTO

La aplicación debe mantener bajo consumo de:

* CPU;
* RAM;
* disco;
* red.

Las sincronizaciones deben ser:

* asíncronas;
* pequeñas;
* incrementales.

No bloquear el hilo principal de Electron.

No descargar recursos pesados innecesariamente.

---

# 16. IMÁGENES

Los banners deben:

* tener tamaño limitado;
* estar optimizados;
* utilizar formatos adecuados;
* utilizar caché;
* evitar descargas repetidas.

Nunca cargar imágenes gigantes si existe una versión optimizada.

---

# 17. LICENCIAS

La aplicación tiene diferentes niveles de licencia.

La nueva funcionalidad debe integrarse con el sistema existente.

Conceptualmente:

```text
FREE
→ puede mostrar ofertas

PRO
→ puede ocultar publicidad
```

No reemplazar el sistema actual de licenciamiento.

No implementar una segunda plataforma de licencias sin necesidad.

---

# 18. COMPATIBILIDAD

Antes de modificar una dependencia:

Comprobar:

* versión actual;
* compatibilidad Electron;
* compatibilidad Node;
* compatibilidad Vite;
* compatibilidad React;
* compatibilidad Windows;
* compatibilidad de build.

No actualizar dependencias masivamente sin justificación.

---

# 19. GESTIÓN DE DEPENDENCIAS

Antes de instalar una dependencia nueva:

Preguntar:

### ¿Realmente es necesaria?

Si puede resolverse con:

* código existente;
* librería ya instalada;
* API existente;

preferir la solución existente.

No agregar dependencias innecesarias.

---

# 20. ARCHIVOS Y DOCUMENTACIÓN

Mantener documentación actualizada.

Debe existir:

```text
docs/
├── ARCHITECTURE.md
├── ROADMAP.md
├── MVP.md
├── DECISIONS.md
└── TESTING.md
```

Si alguna de estas documentaciones no existe:

CREARLA antes de iniciar una fase importante.

---

# 21. ROADMAP

El archivo:

```text
docs/ROADMAP.md
```

debe ser considerado la fuente principal del orden de implementación.

Antes de comenzar una nueva tarea:

1. Leer AGENTS.md.
2. Leer ROADMAP.md.
3. Revisar estado actual.
4. Determinar fase.
5. Trabajar únicamente dentro de esa fase.

---

# 22. NO SALTAR DE CONTEXTO

Si estoy trabajando en:

```text
FASE 3 — Backend
```

no comenzar espontáneamente:

* diseño visual;
* marketplace;
* IA;
* recomendaciones;
* pagos;
* funcionalidades futuras.

Si aparece una mejora futura:

registrarla en:

```text
docs/ROADMAP.md
```

pero continuar con la fase actual.

---

# 23. CONTROL DE CAMBIOS

Después de una modificación importante registrar:

```text
Fecha
Fase
Problema
Solución
Archivos modificados
Pruebas realizadas
Resultado
```

Esto puede almacenarse en:

```text
docs/DECISIONS.md
```

---

# 24. DEFINICIÓN DE "TERMINADO"

Una tarea NO está terminada simplemente porque:

* compila;
* no muestra errores inmediatamente;
* aparece visualmente.

Debe:

1. compilar;
2. ejecutar;
3. probar funcionalidad;
4. probar casos normales;
5. probar casos de error;
6. verificar regresiones;
7. verificar offline cuando corresponda;
8. documentar.

---

# 25. PRUEBAS OBLIGATORIAS

Para cualquier modificación del POS:

Probar como mínimo:

* iniciar aplicación;
* iniciar sesión;
* crear producto;
* vender producto;
* modificar stock;
* consultar stock;
* cerrar caja;
* reiniciar aplicación.

Para funcionalidades online:

Probar:

* Internet disponible;
* Internet desconectado;
* recuperación de conexión;
* API caída;
* respuesta inválida;
* datos incompletos.

---

# 26. SI EL AGENTE NO ESTÁ SEGURO

NO inventar.

Si existe incertidumbre técnica:

Explicar:

* qué se sabe;
* qué no se sabe;
* qué necesita comprobarse.

Utilizar inspección del proyecto antes de tomar decisiones.

---

# 27. PRINCIPIO DE MÍNIMA COMPLEJIDAD

Siempre preferir:

```text
solución simple
```

sobre:

```text
solución sofisticada
```

si ambas resuelven correctamente el problema.

No construir infraestructura para 100.000 comercios cuando todavía existen 10.

La arquitectura debe poder escalar, pero la implementación inicial debe ser pequeña.

---

# 28. PRINCIPIO DE VALIDACIÓN COMERCIAL

El objetivo no es desarrollar funcionalidades por desarrollar.

Cada etapa debe acercarnos a validar:

> ¿Los comercios utilizan el sistema?

y:

> ¿Los mayoristas están dispuestos a pagar por llegar a esos comercios?

Por eso el MVP debe permitir probar rápidamente:

```text
5-10 comercios
+
1-2 mayoristas
+
campañas reales
+
métricas reales
```

---

# 29. REGLA DE ORO

Antes de implementar cualquier nueva funcionalidad preguntarse:

### ¿Esto es necesario para el MVP actual?

Si:

### SÍ

Implementar siguiendo el roadmap.

Si:

### NO

Documentarlo como funcionalidad futura y NO implementarlo todavía.

---

# 30. PROTOCOLO DE RESPUESTA DEL AGENTE

Al comenzar cada tarea importante, responder brevemente:

```text
FASE ACTUAL:
...

OBJETIVO:
...

ARCHIVOS QUE VOY A MODIFICAR:
...

RIESGO:
...

PRUEBAS:
...

¿AFECTA FUNCIONALIDADES EXISTENTES?:
Sí / No
```

Al finalizar:

```text
CAMBIOS REALIZADOS:
...

PRUEBAS EJECUTADAS:
...

RESULTADO:
...

ERRORES PENDIENTES:
...

SIGUIENTE PASO SEGÚN ROADMAP:
...
```

No avanzar automáticamente a la siguiente fase sin indicación o sin que el roadmap lo permita.

---

# REGLA FINAL

Este proyecto debe evolucionar:

```text
SOFTWARE DE GESTIÓN
        ↓
SOFTWARE DE GESTIÓN + OFERTAS
        ↓
RED DE COMERCIOS
        ↓
CANAL B2B
        ↓
PROVEEDORES
        ↓
PEDIDOS
        ↓
MARKETPLACE B2B
```

Pero debe construirse de manera:

* incremental;
* verificable;
* segura;
* offline-first;
* modular;
* comercialmente validable.

NO intentar construir todo al mismo tiempo.
