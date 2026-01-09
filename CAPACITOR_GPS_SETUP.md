# Configuración de Capacitor para GPS en Segundo Plano

Este documento explica cómo compilar la app nativa de GPS Camberas con soporte de segundo plano usando `@capacitor-community/background-geolocation`.

## Plugin Instalado

La app usa `@capacitor-community/background-geolocation` que proporciona:
- ✅ GPS en segundo plano automático
- ✅ **Foreground Service con notificación persistente en Android**
- ✅ Background Modes en iOS
- ✅ Bajo consumo de batería
- ✅ Alta precisión

## 🔔 Foreground Service (Android)

### ¿Qué es un Foreground Service?

Un **Foreground Service** es un servicio de Android que muestra una notificación persistente en la barra de estado. Esto le indica al sistema operativo que la app está realizando una tarea importante y **no debe ser cerrada** por el ahorro de batería.

### Configuración Actual

```typescript
// En src/hooks/useNativeGeolocation.ts
BackgroundGeolocation.addWatcher({
  backgroundTitle: 'Tracking Activo',
  backgroundMessage: 'Camberas GPS está compartiendo tu ubicación en tiempo real.',
  distanceFilter: 5,      // Actualiza cada 5 metros
  stale: false,           // Solo lecturas GPS frescas
  requestPermissions: true
});
```

### Comportamiento en Android

Cuando el tracking GPS está activo:
1. **Aparece una notificación fija** en la barra de estado con:
   - Título: "Tracking Activo"
   - Mensaje: "Camberas GPS está compartiendo tu ubicación en tiempo real."
2. El icono de GPS permanece visible
3. **El sistema NO cierra la app** aunque:
   - El usuario bloquee la pantalla
   - Pase a otras aplicaciones
   - El dispositivo entre en modo ahorro de batería

### Comportamiento en iOS

- Aparece un **indicador azul** en la barra de estado
- El sistema respeta el Background Mode de "location"

---

## Requisitos Previos

### Para iOS
- macOS con Xcode instalado (versión 14+)
- Apple Developer Account (gratuita para desarrollo, de pago para publicar)

### Para Android
- Android Studio instalado
- JDK 17+
- Android SDK

---

## Pasos de Configuración

### 1. Exportar y Clonar el Proyecto

1. En Lovable, ve a **Settings → GitHub** y exporta el proyecto
2. Clona el repositorio en tu máquina local:
   ```bash
   git clone https://github.com/tu-usuario/camberas.git
   cd camberas
   ```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Añadir Plataformas Nativas

```bash
npx cap add ios
npx cap add android
```

### 4. Compilar el Proyecto Web

```bash
npm run build
```

### 5. Sincronizar con Plataformas Nativas

```bash
npx cap sync
```

---

## Configuración Android - Foreground Service GPS

### 6.1. Abrir proyecto en Android Studio

```bash
npx cap open android
```

### 6.2. Configurar AndroidManifest.xml (CRÍTICO)

Abre `android/app/src/main/AndroidManifest.xml` y añade estos permisos **dentro de `<manifest>`, antes de `<application>`**:

```xml
<!-- Permisos de ubicación básicos -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- CRÍTICO: Permiso para ubicación en segundo plano (Android 10+) -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- CRÍTICO: Permisos para Foreground Service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

<!-- Mantener CPU activa durante tracking -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### 6.3. Verificar configuración del Service

El plugin `@capacitor-community/background-geolocation` registra automáticamente el servicio en el manifest. Verifica que después de `npx cap sync` exista algo similar a:

```xml
<service
    android:name="com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

### 6.4. Configurar build.gradle

En `android/app/build.gradle`, asegúrate de tener:

```gradle
android {
    defaultConfig {
        minSdkVersion 22
        targetSdkVersion 34
    }
}
```

### 6.5. Permisos en tiempo de ejecución (Android 10+)

El plugin solicita automáticamente los permisos. **El usuario DEBE seleccionar "Permitir todo el tiempo"** para que funcione en segundo plano.

Si el usuario selecciona "Solo mientras uso la app", el tracking se detendrá al bloquear pantalla.

---

## Configuración iOS - GPS en Segundo Plano

### 7.1. Abrir proyecto en Xcode

```bash
npx cap open ios
```

### 7.2. Configurar Info.plist

Añade estos permisos en `ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Necesitamos tu ubicación para mostrar tu posición durante la carrera</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Necesitamos tu ubicación en segundo plano para seguir compartiendo tu posición aunque bloquees la pantalla</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Necesitamos tu ubicación en segundo plano para seguir compartiendo tu posición aunque bloquees la pantalla</string>

<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```

### 7.3. Configurar Capabilities en Xcode

1. En Xcode, selecciona el target "App"
2. Ve a la pestaña "Signing & Capabilities"
3. Haz clic en "+ Capability"
4. Añade "Background Modes"
5. Marca la opción **"Location updates"**

---

## Probar la App

### iOS Simulator / Dispositivo

```bash
npx cap run ios
```

### Android Emulator / Dispositivo

```bash
npx cap run android
```

---

## Verificar que el Foreground Service Funciona

### En Android:

1. Inicia el tracking GPS en la app
2. **Verifica que aparece la notificación** "Tracking Activo" en la barra de estado
3. Bloquea la pantalla
4. Espera 1-2 minutos
5. Desbloquea y verifica que los puntos GPS siguieron enviándose

### En iOS:

1. Inicia el tracking GPS
2. **Verifica el indicador azul** en la barra de estado
3. Bloquea la pantalla o cambia de app
4. Verifica que el tracking continúa

---

## Solución de Problemas

### ❌ No aparece la notificación en Android

**Causa**: Faltan permisos en AndroidManifest.xml

**Solución**:
1. Verifica que tienes `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_LOCATION`
2. Ejecuta `npx cap sync` después de modificar
3. Reinstala la app (desinstala primero)

### ❌ El tracking se detiene al bloquear pantalla (Android)

**Causa**: El usuario no dio permiso "Permitir todo el tiempo"

**Solución**:
1. Ve a Configuración → Apps → GPS Camberas → Permisos → Ubicación
2. Selecciona **"Permitir todo el tiempo"**
3. Desactiva optimización de batería: Configuración → Apps → GPS Camberas → Batería → **Sin restricciones**

### ❌ Dispositivos Xiaomi/Huawei/Samsung cierran la app

Estos fabricantes tienen ahorro de batería agresivo.

**Solución**:
1. Añade la app a **"Autostart"** o **"Apps protegidas"**
2. Desactiva **"Ahorro de batería"** para la app
3. En MIUI: Configuración → Apps → Gestionar apps → GPS Camberas → Ahorro de batería → Sin restricciones
4. En EMUI: Configuración → Batería → Inicio de apps → GPS Camberas → Gestionar manualmente → Activar todo

### ❌ El usuario no ve la solicitud de permisos

**iOS**: Los permisos solo se piden una vez. El usuario debe ir a Configuración → Privacidad → Servicios de Localización → GPS Camberas

**Android**: Configuración → Apps → GPS Camberas → Permisos → Ubicación

---

## Sincronización de Cambios

Después de hacer cambios en Lovable y hacer `git pull`:

```bash
npm run build
npx cap sync
npx cap run ios  # o android
```

---

## Publicación

### iOS - App Store

1. Configura tu Apple Developer Account
2. En Xcode, archiva la app (Product → Archive)
3. Sube a App Store Connect

### Android - Google Play

1. Genera un APK/AAB firmado en Android Studio
2. Sube a Google Play Console

---

## Resumen de Configuración del Foreground Service

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `backgroundTitle` | "Tracking Activo" | Título de la notificación |
| `backgroundMessage` | "Camberas GPS está compartiendo tu ubicación..." | Texto de la notificación |
| `distanceFilter` | 5 metros | Frecuencia de actualización por distancia |
| `stale` | false | Solo lecturas GPS frescas |
| `requestPermissions` | true | Solicita permisos automáticamente |

Esta configuración garantiza que Android muestre una notificación persistente y no cierre la app mientras el usuario está en carrera.
