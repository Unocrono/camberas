# Configuración de Capacitor para GPS en Segundo Plano

Este documento explica cómo compilar la app nativa de GPS Camberas con soporte de segundo plano.

## Requisitos Previos

### Para iOS
- macOS con Xcode instalado (versión 14+)
- Apple Developer Account (gratuita para desarrollo, de pago para publicar)

### Para Android
- Android Studio instalado
- JDK 17+
- Android SDK

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

## Configuración iOS - GPS en Segundo Plano

### 5.1. Abrir proyecto en Xcode

```bash
npx cap open ios
```

### 5.2. Configurar Info.plist

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

### 5.3. Configurar Capabilities

1. En Xcode, selecciona el target "App"
2. Ve a la pestaña "Signing & Capabilities"
3. Haz clic en "+ Capability"
4. Añade "Background Modes"
5. Marca la opción "Location updates"

## Configuración Android - GPS en Segundo Plano

### 6.1. Abrir proyecto en Android Studio

```bash
npx cap open android
```

### 6.2. Configurar AndroidManifest.xml

El archivo ya debería tener los permisos básicos. Añade estos permisos adicionales en `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Dentro de <manifest> -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Dentro de <application> -->
<service
    android:name="com.transistorsoft.locationmanager.service.TrackingService"
    android:foregroundServiceType="location"
    android:permission="android.permission.FOREGROUND_SERVICE" />
```

### 6.3. Configurar build.gradle

En `android/app/build.gradle`, asegúrate de tener:

```gradle
android {
    defaultConfig {
        minSdkVersion 22
        targetSdkVersion 34
    }
}
```

## Probar la App

### iOS Simulator / Dispositivo

```bash
npx cap run ios
```

### Android Emulator / Dispositivo

```bash
npx cap run android
```

## Publicación

### iOS - App Store

1. Configura tu Apple Developer Account
2. En Xcode, archiva la app (Product → Archive)
3. Sube a App Store Connect

### Android - Google Play

1. Genera un APK/AAB firmado en Android Studio
2. Sube a Google Play Console

## Sincronización de Cambios

Después de hacer cambios en Lovable y hacer `git pull`:

```bash
npm run build
npx cap sync
npx cap run ios  # o android
```

## Notas Importantes

1. **iOS**: El GPS en segundo plano consume batería. La app mostrará un indicador azul en la barra de estado cuando esté usando la ubicación.

2. **Android**: Android 10+ requiere permiso explícito "Allow all the time" para ubicación en segundo plano.

3. **Optimización de batería**: La app ya implementa modo de ahorro cuando la batería está por debajo del 20%.

4. **Desarrollo**: Durante el desarrollo, la app usa el sandbox de Lovable (`server.url` en capacitor.config.ts). Para producción, comenta esa línea para usar la build local.

## Solución de Problemas

### GPS no funciona en segundo plano (iOS)
- Verifica que "Location updates" esté habilitado en Background Modes
- Verifica que los permisos en Info.plist estén correctos

### GPS no funciona en segundo plano (Android)
- Verifica que el usuario haya dado permiso "Allow all the time"
- Verifica que la app no esté siendo cerrada por el ahorro de batería
- Algunos fabricantes (Xiaomi, Huawei) tienen ahorro de batería agresivo - la app necesita estar excluida

### El usuario no ve la solicitud de permisos
- En iOS, los permisos solo se piden una vez. El usuario debe ir a Configuración → Privacidad → Servicios de Localización
- En Android, el usuario puede cambiar permisos en Configuración → Apps → Camberas → Permisos
