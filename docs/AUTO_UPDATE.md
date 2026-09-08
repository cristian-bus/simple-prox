# Guía de Actualización Automática (`AutoUpdate`)

## 1. Arquitectura de Distribución

Simple ProX utiliza `electron-updater` con el proveedor oficial de GitHub Releases:

- **Canal de Publicación**:
  ```json
  "publish": [
    {
      "provider": "github",
      "owner": "cristian-bus",
      "repo": "simple-prox"
    }
  ]
  ```
- **Separación de Vías**:
  - Remote Config: Ajuste de parámetros en caliente sin tocar el ejecutable.
  - Software Update: Descarga de un nuevo instalador `.exe` compilado y firmado.

---

## 2. Reglas Críticas de Seguridad Operativa

1. **Descarga en Segundo Plano**:
   La descarga del paquete de actualización ocurre silenciosamente sin congelar la interfaz ni interferir con el POS.
2. **Prohibición de Reinicio Forzado**:
   `autoInstallOnAppQuit = false`. El sistema **nunca** cerrará ni reiniciará la aplicación de forma imprevista.
3. **Bloqueo por Caja Abierta**:
   Si la caja del turno se encuentra abierta (`kiosco.caja.isOpen === true`), el botón de reinicio estará bloqueado y advertirá al usuario que debe cerrar la caja antes de aplicar el cambio.
