# Visor UML Móvil (CU-08) - Flutter

Aplicación móvil en **Flutter** para el monitoreo en tiempo real del diagrama de clases en modo lectura (CU-08). Se conecta al backend de NestJS mediante WebSockets (`socket_io_client`) y sincroniza los cambios realizados por colaboradores o la IA en vivo.

---

## Características

- ⚡ **Sincronización en Vivo:** Escucha de eventos `diagram-update` vía WebSockets sobre el namespace `/diagram`.
- 🟢 **Indicador de Conexión:** Estados dinámicos (`EN VIVO`, `CONECTANDO`, `OFFLINE`, `ERROR RED`).
- 🏷️ **Clases Asociativas (N:M):** Badge morado distintivo y estilizado para clases intermedias.
- 📋 **Detalle Completo:** Atributos con visibilidad (+, -, #, ~), métodos con parámetros y tipos de retorno, y chips de conexiones/relaciones.
- 🔍 **Buscador en Tiempo Real:** Filtra clases, atributos o métodos instantáneamente.
- ⚙️ **Configuración Flexible:** Diálogo en la app para configurar la IP de la PC, puerto y UUID del proyecto sin recompilar.

---

## Cómo Ejecutar y Generar el APK

### 1. Probar en un emulador o celular conectado por USB
Asegúrate de que tu celular tenga habilitada la **Depuración por USB**:
```bash
cd mobile_flutter
flutter run
```

### 2. Generar el Archivo Instalable `.apk`
Para compilar el archivo APK e instalarlo directamente en cualquier teléfono Android:

```bash
cd mobile_flutter
flutter build apk --split-per-abi
```
*(Opcionalmente `flutter build apk` para un APK universal).*

Al terminar la compilación, encontrarás el archivo instalable en:
```text
mobile_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```
o (si usaste el comando universal):
```text
mobile_flutter/build/app/outputs/flutter-apk/app-release.apk
```

Solo copias ese archivo a tu teléfono (por WhatsApp, Google Drive, cable USB) y lo instalas.

---

## Configuración de Conexión en la App

1. Inicia la aplicación en tu celular.
2. Toca el ícono **⚙️ (Ajustes)** en la esquina superior derecha.
3. Ingresa:
   - **IP del Servidor:** La IP local de tu computadora en la red Wi-Fi (ejemplo: `192.168.1.15`).
   - **Puerto Backend:** `3000`.
   - **ID del Proyecto:** El UUID del proyecto abierto en la web.
4. Presiona **Guardar y Conectar**.

Verás el estado cambiar a **🟢 EN VIVO**.
Cualquier cambio que realices en el lienzo web o cualquier instrucción dada a Claude se reflejará al instante en tu celular sin necesidad de refrescar la pantalla.
