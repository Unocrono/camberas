# Guía de Cronometraje y Arquitectura - Camberas

## 🎯 Propósito
Este documento define la terminología profesional de cronometraje deportivo y la arquitectura de datos para el sistema Camberas.

---

## 📚 Terminología Estándar de Cronometraje

### Conceptos Básicos

| Término Profesional | Término Actual en BD | Descripción |
|---------------------|---------------------|-------------|
| **Evento** | `race_distances` | Una modalidad específica dentro de una carrera (ej: 21K, 42K, Trail 30K) |
| **Carrera** | `races` | Competición completa que puede tener múltiples eventos |
| **Dorsal** | `bib_number` | Número identificador único del participante |
| **Chip** | - (no implementado) | Dispositivo RFID para cronometraje automático |
| **Inscripción** | `registrations` | Registro de un participante en un evento específico |
| **Split / Paso** | `split_times` | Tiempo intermedio en un punto de control |
| **Checkpoint / Control** | `race_checkpoints` | Punto de medición de tiempos intermedios |
| **Resultado** | `race_results` | Tiempo final y clasificación del participante |
| **Categoría** | - (calculado) | Grupo de edad/género para clasificación |
| **Sexo** | - (calculado) | Grupo de  género para clasificación |
| **Clasificación** | `overall_position`, `category_position` , `gender_position`| Posición en general, por categoría o por sexo |
| **DNF** | Did Not Finish | No terminó - Abandonó durante la carrera |
| **DNS** | Did Not Start | No salió - No comenzó la carrera |
| **DSQ** | Disqualified | Descalificado - Infringió reglamento |
| **Retirado** | Withdrawn | Retirado antes de la salida (por decisión propia u organización) |

### Elementos de un Sistema de Cronometraje

#### 1. **Eventos (race_distances)**
- Representa cada modalidad/distancia dentro de una carrera
- Ejemplos: 10K, Media Maratón, Maratón, Ultra 50K, Trail 30K
- Cada evento tiene:
  - Distancia específica
  - Horario de salida propio
  - Precio de inscripción
  - Límite de participantes
  - Rango de dorsales asignados
  - Puntos de control específicos

#### 2. **Dorsales (Bib Numbers)**
- Identificador único visual del corredor
- Rangos asignados por evento (ej: 1-500 para Maratón, 501-1000 para Media)
- Secuencial automático dentro del rango
- Puede tener dígito de control para validación

#### 3. **Sistema de Cronometraje**
- **Manual**: Registro de tiempos por observador (requiere rol TIMER)
- **Chip RFID**: Detección automática en cada checkpoint
  - **RFID Ultra**: Equipo profesional de cronometraje vía TCP/IP puerto 23
  - Formato de lecturas: `ChipCode,Seconds,Milliseconds,AntennaNo,RSSI,ReaderNo,UltraID`
  - Protocolo de comunicación documentado (ver sección G)
- **GPS**: Tracking en tiempo real (implementado)
- **Foto-finish**: Para llegadas muy ajustadas
- **Importación SQL Server**: Sincronización desde aplicación externa de cronometraje

#### 3.1 **Roles de Usuario en Cronometraje**
- **Admin**: Gestión completa del sistema
- **Organizer**: Gestiona sus propias carreras, eventos y resultados
- **Timer**: Operador de cronometraje con permisos para:
  - Registrar lecturas manuales en `timing_readings`
  - Acceder a interfaces de cronometraje durante eventos
  - Ver y validar lecturas de dorsales en checkpoints
  - NO puede modificar configuración de carreras ni resultados finales

#### 4. **Puntos de Control (Checkpoints)**
- **Salida**: KM 0 - Inicio oficial
- **Intermedios**: Controles de paso (ej: KM 10, KM 21)
- **Meta**: Punto final - tiempo oficial
- **Nota importante**: Un mismo dorsal puede pasar múltiples veces por un checkpoint:
  - Circuitos con vueltas (lap 1, lap 2, lap 3...)
  - Lecturas duplicadas de chip RFID
  - Carreras con ida y vuelta por el mismo punto

#### 5. **Tiempos y Clasificaciones**
- **Tiempo Neto**: Desde que el corredor cruza salida hasta meta
- **Tiempo Gun**: Desde disparo de salida hasta que cruza meta
- **Split Time**: Tiempo en cada checkpoint
- **Pace**: Ritmo promedio (min/km)

---

## 🔌 Sistemas de Integración de Cronometraje

### G.1 **Equipo RFID Ultra (RFID Race Timing Systems)**

Sistema profesional de cronometraje RFID con comunicación TCP/IP.

#### Especificaciones Técnicas
- **Protocolo**: TCP/IP
- **Puerto**: 23 (Telnet)
- **Método de conexión**: Socket TCP directo
- **Formato de datos**: ASCII delimitado por comas

#### Formato de Lecturas
Cada lectura se envía en el siguiente formato:
```
0,ChipCode,Seconds,Milliseconds,AntennaNo,RSSI,IsRewind,ReaderNo,UltraID,ReaderTime,StartTime,LogID
```

**Descripción de campos:**
- `ChipCode`: Código del chip (decimal o hexadecimal según configuración)
- `Seconds`: Segundos desde 01/01/1980
- `Milliseconds`: Milisegundos
- `AntennaNo`: Número de antena (1-4)
- `RSSI`: Intensidad de señal (valor negativo)
- `IsRewind`: 0=lectura en vivo, 1=lectura desde log
- `ReaderNo`: Número de lector (1-3)
- `UltraID`: Identificador del equipo Ultra
- `ReaderTime`: Timestamp de 64-bit del lector UHF
- `StartTime`: Para MTB downhill
- `LogID`: Posición en el log

#### Comandos del Protocolo
- `R`: Iniciar lectura
- `S`: Detener lectura
- `t [HH:MM:SS DD-MM-YYYY]`: Configurar hora
- `r`: Consultar hora
- `?`: Consultar estado
- `800[FromTime][0x0D][ToTime]`: Rewind por tiempo
- `600[FromRecord][0x0D][ToRecord]`: Rewind por número de registro

#### Información de Conexión
Al conectarse, el Ultra envía:
```
Connected,LastTimeSent
```
Donde `LastTimeSent` es el timestamp (segundos desde 01/01/1980) de la última lectura enviada.

#### Estado de Voltaje
Cada 10 segundos el equipo envía:
```
V=25.0000
```

#### Configuración de Red
- Soporta GPRS (con tarjeta SIM)
- Soporta LAN (Ethernet)
- Configuración vía comandos 'u'
- IP estática o DHCP

### G.2 **Importación desde SQL Server**

Integración con aplicaciones de cronometraje que utilizan SQL Server para almacenar lecturas.

#### Caso de Uso
Aplicaciones de terceros que:
1. Reciben lecturas de equipos de cronometraje
2. Almacenan datos en SQL Server
3. Necesitan sincronizar con Camberas

#### Arquitectura de Integración
```
Equipo Cronometraje → App Externa → SQL Server
                                          ↓
                                    Edge Function
                                          ↓
                                  timing_readings (Camberas)
```

#### Tablas Esperadas en SQL Server
La aplicación externa típicamente tiene una estructura similar a:
```sql
-- Ejemplo de estructura esperada
CREATE TABLE Readings (
    Id INT PRIMARY KEY,
    BibNumber INT,
    ChipCode VARCHAR(50),
    ReadingTimestamp DATETIME,
    CheckpointId INT,
    DeviceId VARCHAR(50),
    OperatorId VARCHAR(50) NULL,
    ReadingType VARCHAR(20), -- 'automatic', 'manual'
    Processed BIT DEFAULT 0
)
```

#### Proceso de Sincronización
1. **Consulta periódica**: Edge function consulta nuevas lecturas
2. **Validación**: Verifica que dorsal existe en `registrations`
3. **Mapeo de datos**: Convierte formato SQL Server a `timing_readings`
4. **Prevención duplicados**: Compara con lecturas existentes
5. **Inserción masiva**: Batch insert en `timing_readings`
6. **Marcado procesado**: Actualiza flag en SQL Server

#### Mapeo de Campos
| Campo SQL Server | Campo Camberas | Transformación |
|------------------|----------------|----------------|
| BibNumber | bib_number | Directo |
| ChipCode | chip_code | Directo |
| ReadingTimestamp | timing_timestamp | Conversión timezone |
| CheckpointId | checkpoint_id | Lookup por nombre/orden |
| DeviceId | reader_device_id | Directo |
| OperatorId | operator_user_id | Lookup por username/email |
| ReadingType | reading_type | Directo |

#### Configuración de Conexión
Requiere secrets en Lovable Cloud:
- `SQL_SERVER_HOST`
- `SQL_SERVER_PORT`
- `SQL_SERVER_DATABASE`
- `SQL_SERVER_USERNAME`
- `SQL_SERVER_PASSWORD`

---

## 🏗️ Arquitectura Recomendada

### Estructura Actual vs. Ideal

```
ACTUAL                          IDEAL (futuro)
races                          races (carreras)
├── race_distances             ├── race_events (eventos)
│   ├── checkpoints            │   ├── event_checkpoints
│   ├── registrations          │   ├── event_registrations
│   └── roadbooks              │   ├── event_categories (nuevo)
│                              │   └── event_roadbooks
├── race_results               ├── timing_readings (lecturas raw - NUEVO)
│   └── split_times            ├── race_results
│                              │   └── split_times (calculados)
                               └── timing_chips (opcional)
```

### Tablas Clave

#### `races` - Carreras
```sql
- id
- name (ej: "Maratón Valencia 2024")
- date
- location
- organizer_id
- race_type (trail, road, mtb)
```

#### `race_distances` → `race_events` (futuro)
```sql
- id
- race_id
- name (ej: "Maratón 42K", "Media 21K")
- distance_km
- bib_start, bib_end, next_bib
- max_participants
- start_time
- cutoff_time
```

#### `registrations` - Inscripciones
```sql
- id
- user_id
- race_id
- race_distance_id (→ race_event_id)
- bib_number (dorsal)
- status (confirmed, pending, cancelled)
- payment_status
```

#### `race_checkpoints` - Puntos de Control
```sql
- id
- race_id
- race_distance_id (→ race_event_id)
- name (ej: "Salida", "KM 10", "Meta")
- checkpoint_order (1, 2, 3...)
- distance_km
- latitude, longitude
```

#### `timing_readings` - Lecturas de Cronometraje (NUEVO - Recomendado)
```sql
- id
- registration_id
- race_id
- checkpoint_id
- bib_number (dorsal)
- chip_code (código del chip RFID, nullable para lecturas manuales)
- timing_timestamp (hora según el sistema de cronometraje)
- reader_device_id (identificador del lector/equipo)
- operator_user_id (usuario que hizo lectura manual, nullable para automáticas)
- reading_timestamp (momento exacto en que se registró la lectura)
- reading_type (automatic, manual, status_change)
- lap_number (para circuitos con vueltas)
- is_processed (si ya se convirtió en split_time)
- status_code (null para lecturas normales, o: 'dnf', 'dns', 'dsq', 'withdrawn')
- notes (observaciones)

NOTA: Esta tabla guarda las lecturas RAW del sistema de cronometraje.
Es la fuente de verdad. Los split_times se calculan a partir de estas lecturas.
Ventajas:
- Permite reprocessar tiempos si hay errores
- Auditoría completa (quién, cuándo, con qué equipo)
- Filtrado de duplicados antes de generar splits
- Diferencia lecturas automáticas vs manuales
```

#### `split_times` - Tiempos Intermedios (CALCULADOS)
```sql
- id
- race_result_id
- checkpoint_name
- checkpoint_order
- split_time (interval) -- tiempo acumulado desde salida
- distance_km
- timing_reading_id (opcional) -- referencia a la lectura original
- lap_number (para carreras con vueltas)

NOTA: Esta tabla se CALCULA a partir de timing_readings.
No hay constraint único en (race_result_id, checkpoint_order) para permitir:
- Circuitos con vueltas (múltiples laps)
- Correcciones manuales
- Puntos de paso/retorno

Proceso de cálculo:
1. Obtener lecturas de timing_readings para cada checkpoint
2. Filtrar duplicados (elegir timestamp más cercano o criterio definido)
3. Calcular tiempo acumulado desde salida
4. Generar registro en split_times
```

#### `race_results` - Resultados Finales
```sql
- id
- registration_id
- finish_time
- overall_position (clasificación general)
- gender_position (clasificación por sexo)
- category_position (clasificación por categoría)
- status (finished, dnf, dns, dsq)
```

---

## 🔄 Flujos Principales

### 1. Creación de Carrera
```
1. Organizador crea carrera (race)
2. Define eventos/distancias (race_events)
3. Configura rangos de dorsales por evento
4. Crea checkpoints para cada evento
5. Publica inscripciones
```

### 2. Inscripción de Participante
```
1. Usuario selecciona carrera y evento
2. Completa formulario de inscripción
3. Sistema asigna dorsal automático del rango
4. Pago → Confirmación
5. Email de confirmación con dorsal asignado
```

### 3. Día de Carrera - Cronometraje
```
1. Salida: Registro tiempo inicial (chip/manual) → timing_readings
2. Checkpoints: Registro de lecturas → timing_readings
   - Lecturas automáticas (chip RFID): chip_code + reader_device_id
   - Lecturas manuales: dorsal + operator_user_id
3. Meta: Lectura final → timing_readings
4. Registro de estados especiales (Cronometraje Manual):
   - DNF (Did Not Finish): Corredor abandona → timing_reading con status_code='dnf'
   - DNS (Did Not Start): No sale a correr → timing_reading con status_code='dns'
   - DSQ (Disqualified): Descalificado → timing_reading con status_code='dsq'
   - Withdrawn: Retirado antes de salida → timing_reading con status_code='withdrawn'
   - Estas lecturas NO generan split_times, actualizan directamente race_results.status
5. Procesamiento:
   - Filtrar lecturas duplicadas por checkpoint
   - Procesar cambios de estado (dnf/dns/dsq/withdrawn) → actualizar race_results.status
   - Calcular split_times a partir de timing_readings (solo lecturas normales)
   - Calcular finish_time → race_results (solo si status='finished')
6. Cálculo automático de clasificaciones:
   - Solo para participantes con status='finished'
   - Clasificación general (overall_position)
   - Clasificación por sexo (gender_position)
   - Clasificación por categoría (category_position)
   - Pace promedio
7. Publicación resultados en vivo
```

### 4. Resultados y Clasificaciones
```
1. Ordenar por tiempo final
2. Calcular posiciones generales
3. Agrupar por género
4. Calcular posiciones por sexo (M/F)
5. Agrupar por categorías (edad + género)
6. Calcular posiciones por categoría
7. Generar diplomas/certificados
```

---

## 📊 Categorías Estándar

### Por Edad (ejemplo común)
- **Junior**: Sub-20 (< 20 años)
- **Senior**: 20-34 años
- **Veteranos A**: 35-44 años
- **Veteranos B**: 45-54 años
- **Veteranos C**: 55-64 años
- **Veteranos D**: 65+ años

### Por Género
- **Masculino**
- **Femenino**
- **Mixto** (para relevos)

### Combinadas
- M-Senior, F-Senior
- M-VetA, F-VetA
- etc.

---

## 🎨 Terminología UI (Usuario)

### Lo que el corredor ve:
- "Inscribirme" → registrarse
- "Mi Dorsal" → bib_number asignado
- "Mis Carreras" → races donde está inscrito
- "Resultados" → clasificación y tiempos
- "Mi Tiempo" → finish_time personal

### Lo que el organizador ve:
- "Mis Eventos" → races que organiza
- "Inscritos" → registrations
- "Asignar Dorsales" → manage bib_numbers
- "Cronometraje" → split times management
- "Publicar Resultados" → race_results

### Lo que el timer (operador de cronometraje) ve:
- "Cronometraje Manual" → interfaz para registrar lecturas
- "Checkpoints Activos" → puntos de control donde puede cronometrar
- "Lecturas Recientes" → últimas lecturas registradas
- "Validar Dorsal" → verificar que dorsal existe y está activo
- "Registrar Estado" → marcar corredor como DNF/DNS/DSQ/Retirado
- "Abandonos" → lista de corredores que no terminaron

#### Interfaz de Registro de Estados Especiales

La interfaz de cronometraje manual debe incluir un formulario accesible para registrar estados especiales (DNF/DNS/DSQ/Withdrawn).

**Diseño del Formulario:**
- **Accesibilidad**: Totalmente navegable con tecla Tab (orden lógico de campos)
- **Campos principales**:
  1. **Dorsal** (input numérico, autofocus)
     - Validación en tiempo real
     - Muestra info del corredor al validar (nombre, evento, última lectura)
  2. **Tipo de estado** (radio buttons o select)
     - DNF (Did Not Finish) - No terminó
     - DNS (Did Not Start) - No comenzó
     - DSQ (Disqualified) - Descalificado
     - Withdrawn - Retirado antes de salida
  3. **Motivo** (textarea, obligatorio)
     - Placeholder: "ej: Lesión rodilla km 15, Fuera de tiempo límite, etc."
     - Mínimo 10 caracteres
  4. **Checkpoint** (select opcional)
     - Solo si aplica (DNF/DSQ)
     - Indica dónde ocurrió el abandono/descalificación

**Flujo de Usuario:**
1. Ingresar dorsal → Tab
2. Sistema valida y muestra info del corredor
3. Seleccionar tipo de estado → Tab
4. Escribir motivo obligatorio → Tab
5. (Opcional) Seleccionar checkpoint → Tab
6. Confirmar con Enter o botón "Registrar"

**Información Contextual Mostrada:**
- Nombre completo del corredor
- Evento inscrito
- Última lectura (checkpoint, hora, km aproximado)
- Tiempo transcurrido en carrera
- Estado actual

**Validaciones:**
- Dorsal debe existir y estar inscrito en la carrera activa
- No permitir cambiar estado si ya tiene finish_time registrado
- Motivo obligatorio (min 10 caracteres, max 500)
- Confirmación con diálogo de advertencia antes de guardar
- Solo usuarios TIMER o superior pueden registrar estados

**Feedback Visual:**
- Verde: Dorsal válido encontrado
- Rojo: Dorsal no encontrado o inválido
- Amarillo: Advertencia si ya tiene lecturas en meta
- Toast de confirmación al guardar exitosamente

**Acciones Post-Registro:**
- Crear timing_reading con reading_type='status_change'
- Actualizar race_results.status inmediatamente
- Limpiar formulario para siguiente registro
- Opción de reversión (solo en ventana de 5 minutos)
- Mantener historial de cambios auditable

---

## 🏃 App Manual de Cronometraje - Especificación Completa

### Arquitectura y Persistencia

**Decisión Arquitectónica**: Progressive Web App (PWA) integrada en Camberas

**Justificación:**
- **Única base de código**: Ruta `/timing` dentro de Camberas, mismo backend/autenticación
- **Doble modo de acceso**:
  - **Instalable como PWA**: Cronometradores recurrentes → icono en pantalla de inicio, fullscreen, notificaciones
  - **Acceso web directo**: Voluntarios ocasionales → sin instalación previa desde navegador
- **Offline-first**: Service Workers + IndexedDB para funcionamiento 100% sin conexión
- **Actualizaciones instantáneas**: Sin pasar por App Store/Play Store
- **Cero costes adicionales**: Sin comisiones de stores ni certificados de desarrollador

**Ruta de acceso:**
```
https://camberas.com/timing          → Login de cronometradores
https://camberas.com/timing/record   → Registro de tiempos (pantalla principal)
https://camberas.com/timing/abandon  → Registro de retirados
https://camberas.com/timing/chat     → Mensajería interna
https://camberas.com/timing/sync     → Sincronización
```

**Objetivo**: Aplicación web progresiva para cronometraje manual en puntos de control, funcionando online y offline.

#### 1. Sistema de Autenticación y Permisos

**Acceso Restringido:**
- Solo pueden acceder:
  - **Organizador** de la carrera (role='organizer')
  - **Cronometradores** asignados (role='timer')
- Validación contra tabla `user_roles` y `timer_assignments`

**Flujo de Login:**
1. Usuario ingresa credenciales (email/password)
2. Sistema valida rol y asignación a carrera
3. Si válido:
   - Guardar sesión en localStorage (válida 5 días)
   - Guardar timestamp de login
   - Descargar datos offline
4. Si no tiene permisos: denegar acceso con mensaje claro

**Persistencia de Sesión (5 días):**
```javascript
localStorage.setItem('timing_session', JSON.stringify({
  user_id: '...',
  role: 'timer',
  race_id: '...',
  checkpoint_id: '...',
  logged_at: timestamp,
  expires_at: timestamp + 5_days
}));
```

**Beneficio Offline:**
- Funciona sin conexión durante 5 días
- No requiere re-autenticación constante en el punto de control
- Datos sincronizados cuando hay conexión

#### 2. Descarga y Almacenamiento Local de Datos

**Al validarse exitosamente, descargar y guardar:**

**Datos de Corredores (en IndexedDB o localStorage):**
```javascript
{
  race_id: uuid,
  runners: [
    {
      bib_number: number,
      first_name: string,
      last_name: string,
      event_name: string, // race_distance.name
      category: string,   // calculado: M-Senior, F-VetA, etc.
      gender: string,     // M/F
      team: string        // club/equipo
    }
  ],
  checkpoints: [
    {
      id: uuid,
      name: string,
      distance_km: number,
      checkpoint_order: number
    }
  ],
  downloaded_at: timestamp
}
```

**Estrategia de Almacenamiento:**
- **IndexedDB**: Para grandes volúmenes de corredores (>1000)
- **localStorage**: Para carreras pequeñas (<1000 corredores)
- Compresión opcional con LZ-string si es muy grande

#### 3. Asignación de Cronometradores

**Tabla necesaria: `timer_assignments`**
```sql
CREATE TABLE timer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  race_id UUID REFERENCES races(id) NOT NULL,
  checkpoint_id UUID REFERENCES race_checkpoints(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES profiles(id),
  notes TEXT,
  UNIQUE(user_id, race_id, checkpoint_id)
);
```

**Características:**
- Un TIMER puede estar asignado a **una o varias carreras**
- Puede estar asignado a **uno o varios checkpoints** de la misma carrera
- El organizador gestiona asignaciones desde panel de admin
- RLS: Solo organizador de la carrera puede crear/modificar asignaciones

#### 4. Selección de Carrera y Checkpoint

**Pantalla inicial post-login:**
1. Si solo tiene 1 carrera asignada: seleccionar automáticamente
2. Si tiene múltiples carreras: mostrar selector
3. Seleccionar checkpoint donde estará cronometrando:
   - Lista con nombre, km, orden
   - Marcar como "activo" para la sesión

**Guardar selección:**
```javascript
localStorage.setItem('active_timing_context', JSON.stringify({
  race_id: '...',
  checkpoint_id: '...',
  checkpoint_name: 'Meta',
  checkpoint_km: 21.1
}));
```

#### 5. Menú de Navegación (Bottom Tab Bar)

**Diseño Móvil tipo App:**

```
┌─────────────────────────────────────┐
│      [Icono] Cronómetro Manual      │
│      [Carrera] - [Checkpoint]       │
└─────────────────────────────────────┘
│                                     │
│        CONTENIDO PRINCIPAL          │
│                                     │
│                                     │
└─────────────────────────────────────┘
┌─────┬─────┬─────┬─────┬─────┬──────┐
│ 🔄  │ ⏱️  │ 🚫  │ 💬  │ ⚙️  │ 🚪   │
│Sync │Time │DNF  │Chat │Conf │Logout│
└─────┴─────┴─────┴─────┴─────┴──────┘
```

**Opciones del Menú:**

1. **🔄 Sincronizar** (`/timing/sync`)
   - Recargar corredores desde servidor
   - Subir lecturas pendientes (si hay conexión)
   - Indicador de última sincronización

2. **⏱️ Registrar Tiempo** (`/timing/record`) - **PANTALLA PRINCIPAL**
   - Input de dorsal (autofocus)
   - Botón grande con HORA ACTUAL (ej: "14:32:15")
   - Al presionar: registra dorsal + timestamp
   - Lista descendente de últimos registros arriba

3. **🚫 Retirados** (`/timing/withdrawals`)
   - Formulario: Dorsal + Motivo (DNF/DNS/DSQ/Withdrawn)
   - Accesible por Tab como especificado arriba

4. **💬 Mensajería** (`/timing/chat`)
   - Chat interno de carrera entre cronometradores
   - Mensajes de coordinación en tiempo real
   - Indica si hay mensajes no leídos

5. **⚙️ Configuración** (`/timing/settings`)
   - Ver checkpoint actual
   - Cambiar checkpoint si tiene múltiples asignaciones
   - Ver datos offline almacenados
   - Limpiar caché

6. **🚪 Logout**
   - Cerrar sesión
   - Opción de mantener datos offline o borrarlos
   - Volver a pantalla de login

#### 6. Pantalla Principal: Registro de Tiempos

**Layout:**
```
┌─────────────────────────────────────┐
│  ÚLTIMOS REGISTROS ▼                │
├─────────────────────────────────────┤
│ #245  Juan Pérez      14:32:15  ✓  │
│ #123  Ana García      14:31:58  ✓  │
│ #089  Luis Martín     14:30:42  ✓  │
│ [... lista descendente]             │
├─────────────────────────────────────┤
│                                     │
│  REGISTRAR DORSAL                   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  [ Dorsal ]  _______        │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │     [ 14:32:47 ]            │   │ <- Hora actual
│  │     REGISTRAR               │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Funcionalidad:**
1. Input de dorsal tiene autofocus
2. Al escribir dorsal + Enter o clic en botón:
   - Captura timestamp exacto
   - Valida dorsal contra datos locales
   - Si existe: muestra nombre + evento
   - Si no existe: registra solo dorsal + tiempo
   - Añade a lista superior (orden descendente)
3. Botón muestra hora actual en tiempo real (HH:MM:SS)
4. Al registrar: feedback visual (verde/✓)
5. Si hay conexión: envía inmediatamente a servidor
6. Si offline: encola para sincronización posterior

**Lista de Últimos Registros:**
- Muestra los últimos 50 registros del checkpoint actual
- Orden descendente (más reciente primero)
- Formato:
  - `#Dorsal`
  - `Nombre Apellido` (si disponible, sino solo dorsal)
  - `HH:MM:SS` (hora de registro)
  - `✓` (confirmado) o `⏳` (pendiente de sync)

**Caso Sin Datos de Corredor:**
- Si no hay datos offline del corredor (no descargados o invitado de última hora)
- Registrar igualmente: `Dorsal + Timestamp`
- Backend validará al sincronizar

#### 7. Sincronización y Modo Offline

**Estrategia:**
1. **Online**: Envío inmediato a edge function
2. **Offline**: Almacenar en cola local
3. **Reconexión**: Sincronización automática en background

**Cola de Sincronización:**
```javascript
{
  pending_readings: [
    {
      bib_number: 245,
      checkpoint_id: '...',
      timestamp: '2024-12-01T14:32:47Z',
      reading_type: 'manual',
      recorded_by: user_id,
      synced: false
    }
  ]
}
```

**Indicadores de Estado:**
- Badge en botón Sync: `(5 pendientes)`
- Icono de conexión en header: 🟢 Online / 🔴 Offline
- Último sync: "Hace 2 minutos"

#### 8. Mensajería Interna de Carrera

**Tabla: `race_chat_messages`**
```sql
CREATE TABLE race_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID REFERENCES races(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_system BOOLEAN DEFAULT false
);
```

**Funcionalidad:**
- Chat en tiempo real entre cronometradores y organizador
- Útil para coordinar: "Paso de cabeza en km 10", "Retraso en salida 5 min"
- Notificación de mensajes no leídos en tab
- Mensajes del sistema automáticos (ej: "Nueva lectura en Meta: #245")

#### 9. Opción de Logout

**Flujo de Cierre de Sesión:**
1. Usuario presiona botón Logout
2. Verificar si hay lecturas pendientes de sincronización
3. Si hay pendientes:
   - Mostrar diálogo: "Tienes 5 lecturas sin sincronizar. ¿Qué deseas hacer?"
   - Opciones:
     - "Sincronizar ahora" (si online)
     - "Mantener offline para sincronizar después"
     - "Descartar lecturas" (requiere confirmación)
4. Limpiar sesión de localStorage (o mantener datos según elección)
5. Redirigir a pantalla de login

**Seguridad:**
- Invalidar token de sesión
- Opcional: mantener datos offline hasta próximo login (para turnos de relevos)

---

---

## ⚠️ Pendientes de Implementar

### Alta Prioridad
1. **Tabla timing_readings**: Implementar tabla de lecturas raw antes de procesar split_times
2. **Rol TIMER**: Añadir rol 'timer' al enum app_role con permisos específicos
3. **Interfaz de Cronometraje Manual**: UI para usuarios TIMER registrar lecturas
4. **Edge Function RFID Ultra Receiver**: Listener TCP puerto 23 para recibir lecturas del equipo
5. **Edge Function SQL Server Import**: Sincronización de lecturas desde SQL Server
6. **Procesamiento de lecturas**: Lógica para convertir readings en split_times
7. **Categorías Automáticas**: Calcular categoría según edad + género
8. **Clasificación por Sexo**: Añadir gender_position a race_results
9. **Gestión de Chips**: Vincular chips RFID a dorsales en timing_readings
10. **DNF/DNS/DSQ**: Estados de resultados (No terminó/No salió/Descalificado)
11. **Tiempos Netos**: Diferencia entre tiempo gun y neto
12. **Vueltas/Laps**: Campo lap_number en timing_readings para circuitos
13. **Filtrado de duplicados**: Lógica para detectar y gestionar lecturas múltiples

### Media Prioridad
1. **Dashboard de Monitoreo**: Vista en tiempo real del estado de equipos Ultra conectados
2. **Gestión de Equipos**: CRUD de readers/dispositivos de cronometraje
3. **Webhooks**: Notificaciones push cuando se reciben lecturas
4. **Equipos/Clubes**: Clasificación por equipos
5. **Relevos**: Eventos con múltiples participantes por dorsal
6. **Diplomas**: Generación automática de certificados
7. **Récords**: Tracking de récords de carrera/evento

### Baja Prioridad
9. **Foto-finish**: Sistema de fotos en meta vinculadas a dorsales
10. **Estadísticas**: Análisis de rendimiento histórico
11. **Rankings**: Sistemas de puntuación entre carreras

---

## 🔧 Mejoras Técnicas Sugeridas

### Refactorización Futura (cuando convenga)
```sql
-- Añadir rol TIMER al enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'timer';

-- Renombrar tabla principal
ALTER TABLE race_distances RENAME TO race_events;

-- Añadir tabla de lecturas de cronometraje (CRÍTICO)
CREATE TABLE timing_readings (
  id uuid PRIMARY KEY,
  registration_id uuid REFERENCES registrations(id),
  race_id uuid REFERENCES races(id),
  checkpoint_id uuid REFERENCES race_checkpoints(id), -- nullable para cambios de estado
  bib_number integer NOT NULL,
  chip_code text, -- nullable para lecturas manuales
  timing_timestamp timestamptz NOT NULL, -- hora del crono
  reader_device_id text, -- identificador del lector (ej: "Ultra-25")
  operator_user_id uuid, -- usuario si es manual
  reading_timestamp timestamptz DEFAULT now(), -- cuando se registró
  reading_type text DEFAULT 'automatic', -- automatic, manual, status_change
  lap_number integer DEFAULT 1,
  is_processed boolean DEFAULT false,
  status_code text, -- null para lecturas normales, o: 'dnf', 'dns', 'dsq', 'withdrawn'
  notes text,
  
  -- Campos adicionales para RFID Ultra
  antenna_no integer, -- 1-4
  rssi integer, -- señal (negativo)
  reader_no integer, -- 1-3
  ultra_id integer, -- ID del equipo Ultra
  is_rewind boolean DEFAULT false, -- si viene de log
  log_id integer -- posición en log del Ultra
);

-- Añadir referencia en split_times a la lectura original
ALTER TABLE split_times 
ADD COLUMN timing_reading_id uuid REFERENCES timing_readings(id);

-- Añadir gender_position a race_results
ALTER TABLE race_results
ADD COLUMN gender_position integer;

-- Añadir tabla de equipos/dispositivos de cronometraje
CREATE TABLE timing_devices (
  id uuid PRIMARY KEY,
  device_name text NOT NULL,
  device_type text NOT NULL, -- 'rfid_ultra', 'manual', 'other'
  device_id text UNIQUE NOT NULL, -- identificador único (ej: "Ultra-25")
  ip_address text,
  port integer,
  status text DEFAULT 'offline', -- online, offline, error
  race_id uuid REFERENCES races(id),
  last_seen timestamptz,
  configuration jsonb, -- configuración específica del dispositivo
  created_at timestamptz DEFAULT now()
);

-- Añadir tabla de categorías
CREATE TABLE event_categories (
  id uuid PRIMARY KEY,
  event_id uuid REFERENCES race_events(id),
  name text, -- "M-Senior", "F-VetA"
  min_age int,
  max_age int,
  gender text
);

-- Tabla de chips (simplificada, chip_code ya está en timing_readings)
CREATE TABLE timing_chips (
  id uuid PRIMARY KEY,
  chip_code text UNIQUE,
  registration_id uuid REFERENCES registrations(id),
  status text, -- active, lost, damaged
  assigned_at timestamptz
);

-- Índices para optimizar queries de cronometraje
CREATE INDEX idx_timing_readings_checkpoint ON timing_readings(checkpoint_id, timing_timestamp);
CREATE INDEX idx_timing_readings_bib ON timing_readings(bib_number, race_id);
CREATE INDEX idx_timing_readings_processed ON timing_readings(is_processed, race_id);
CREATE INDEX idx_timing_readings_device ON timing_readings(reader_device_id, timing_timestamp);
```

### Optimizaciones de Queries
- Índices en `bib_number` para búsquedas rápidas
- Vistas materializadas para clasificaciones en vivo
- Cache de resultados publicados

---

## 📖 Recursos y Referencias

### Sistemas Profesionales de Referencia
- **ChronoRace**: Sistema italiano de cronometraje
- **LiveTrail**: Cronometraje trail running con GPS
- **MyLaps**: Hardware y software profesional
- **Chronotrack**: Sistema de chips RFID
- **RFID Race Timing Systems**: Fabricante del equipo Ultra (www.rfidtiming.com)

### Documentación Técnica
- **RFID Ultra Manual**: Firmware v1.40N - Protocolo de comunicación TCP/IP
- **RFID Ultra Software**: RFIDServer, OutReach, UDPDownload

### Estándares
- **IAAF**: Reglas de atletismo internacional
- **ITRA**: Reglamento trail running
- **UCI**: Normativa ciclismo MTB

### Protocolos de Comunicación
- **TCP/IP Socket**: Puerto 23 (Telnet) para RFID Ultra
- **MACH1**: Protocolo nativo RFID Race Timing Systems
- **LLRP**: Low Level Reader Protocol (estándar UHF RFID)

### Tecnologías UHF RFID
- **Frecuencias**: 860-960 MHz según región
- **Alcance**: Hasta 60m línea de vista con BAP PowerID
- **Anti-colisión**: Algoritmos para lectura simultánea de cientos de tags
- **Sesiones**: Session 0-3 para diferentes escenarios de lectura

---

## 💡 Notas para la IA

Cuando trabajes en features de cronometraje:

1. **Usa esta terminología** en conversaciones con el usuario
2. **Mapea correctamente**: 
   - "evento" = race_distances (por ahora)
   - "dorsal" = bib_number
   - "checkpoint" = race_checkpoints
   - "lectura" = timing_readings (raw data)
   - "tiempo intermedio" = split_times (processed data)
   - "equipo Ultra" = dispositivo RFID Race Timing Systems
3. **Arquitectura de datos**:
   - timing_readings es la fuente de verdad (lecturas raw)
   - split_times se CALCULA a partir de timing_readings
   - Nunca insertes split_times directamente, usa timing_readings
4. **Integraciones de cronometraje**:
   - **RFID Ultra**: Conectar vía TCP socket puerto 23, parsear formato CSV
   - **SQL Server**: Edge function con consultas periódicas, mapeo de campos
   - Ambas integraciones alimentan timing_readings
5. **Valida rangos de dorsales** al asignar
6. **Ordena splits** por checkpoint_order
7. **Calcula categorías** automáticamente si existe birth_date
8. **Diferencia estados**: pending, confirmed, cancelled, finished, dnf, dns, dsq
9. **Múltiples lecturas**: Un dorsal puede tener varias lecturas en el mismo checkpoint
   - Guardar todas en timing_readings con is_processed=false
   - Aplicar lógica de filtrado al procesar (ej: timestamp más cercano)
   - Generar un solo split_time por checkpoint (o múltiples si hay laps)
   - Para circuitos con vueltas: usar lap_number
10. **Tipos de lecturas**:
    - Automáticas (chip RFID): reading_type='automatic', chip_code presente, operator_user_id null
    - Manuales: reading_type='manual', operator_user_id presente (debe tener rol TIMER)
    - Cambios de estado: reading_type='status_change', status_code presente (dnf/dns/dsq/withdrawn)
11. **Gestión de estados especiales**:
    - DNF (Did Not Finish): Registrar timing_reading con status_code='dnf' en último checkpoint visto
    - DNS (Did Not Start): Registrar timing_reading con status_code='dns' (sin checkpoint)
    - DSQ (Disqualified): Registrar timing_reading con status_code='dsq' en checkpoint donde ocurrió
    - Withdrawn: Registrar timing_reading con status_code='withdrawn' (antes de la salida)
    - Estas lecturas actualizan race_results.status pero NO generan split_times
    - Incluir notas obligatorias explicando el motivo (ej: "Lesión en km 15", "Fuera de tiempo límite")
12. **Roles y permisos**:
    - Admin: acceso completo
    - Organizer: gestión de sus carreras
    - Timer: solo cronometraje manual (insertar timing_readings)
    - User: corredor estándar
13. **Conversión de timestamps**:
    - RFID Ultra usa segundos desde 01/01/1980
    - Convertir a timestamptz de PostgreSQL
    - Considerar zona horaria del evento
14. **Gestión de conexiones**:
    - RFID Ultra: mantener socket TCP abierto, reconnect automático
    - SQL Server: pooling de conexiones, queries parametrizadas
    - Implementar retry logic y timeouts
15. **Seguridad**:
    - Validar que dispositivo/operador tiene permisos para la carrera
    - Verificar que checkpoint existe y pertenece al evento
    - Sanitizar inputs de integraciones externas

---

## 🚀 Roadmap Sugerido

### Fase 1: Estabilización (actual)
- ✅ Carreras y eventos (race_distances)
- ✅ Inscripciones con dorsales
- ✅ Checkpoints y splits
- ✅ Resultados básicos
- ✅ GPS tracking

### Fase 2: Profesionalización del Cronometraje
- 🔲 Tabla timing_readings (lecturas raw)
- 🔲 Rol TIMER con permisos específicos
- 🔲 Integración RFID Ultra (TCP socket listener)
- 🔲 Integración SQL Server (importación)
- 🔲 Interfaz de cronometraje manual
- 🔲 Procesamiento automático de readings → split_times
- 🔲 Categorías automáticas
- 🔲 Clasificación por sexo (gender_position)
- 🔲 Gestión de dispositivos de cronometraje
- 🔲 Tiempos netos vs gun time
- 🔲 Estados avanzados (DNF/DNS/DSQ)

### Fase 3: Escalado y Funcionalidades Avanzadas
- 🔲 Dashboard de monitoreo en tiempo real
- 🔲 Webhooks y notificaciones push
- 🔲 Clasificaciones por equipos
- 🔲 Sistema de récords
- 🔲 Diplomas automáticos
- 🔲 Rankings multi-carrera
- 🔲 Backup automático de lecturas
- 🔲 Análisis de rendimiento de equipos
- 🔲 Sincronización bidireccional SQL Server

---

**Última actualización**: 2025-12-01
**Versión**: 1.0
**Autor**: Camberas Team

---

## 🗺️ Sistema de Seguimiento en Vivo - Arquitectura

### Objetivo
Sistema web para seguimiento en tiempo real de participantes combinando datos GPS de apps móviles y tiempos registrados en puntos de cronometraje.

### Componentes del Sistema

#### 1. **Mapa de Seguimiento en Vivo** (`/live-gps/:raceId`)

**Elementos visuales:**
```
┌─────────────────────────────────────────────────┐
│ 🗺️ MAPA PRINCIPAL (Mapbox GL)                  │
│                                                 │
│  • Ruta GPX de la carrera (línea)             │
│  • Checkpoints (📍 iconos fijos)              │
│  • Corredores (🏃 iconos móviles)             │
│  • Tooltips con info al hover                  │
│                                                 │
│ ┌─────────────────┐                            │
│ │ PANEL LATERAL   │                            │
│ │                 │                            │
│ │ 🔍 Buscar       │                            │
│ │ 📊 Filtros      │                            │
│ │ ━━━━━━━━━━━━━  │                            │
│ │ TOP 10         │                            │
│ │ 1. 🏃 #123     │                            │
│ │ 2. 🏃 #045     │                            │
│ │ 3. 🏃 #678     │                            │
│ │ ...            │                            │
│ └─────────────────┘                            │
└─────────────────────────────────────────────────┘
```

**Funcionalidades:**
- ✅ Mapa interactivo con ruta de la carrera
- ✅ Marcadores de corredores actualizados en tiempo real
- ✅ Click en corredor → panel con detalles y split times
- ✅ Filtros: por evento, categoría, rango de dorsales
- ✅ Búsqueda por dorsal o nombre
- ✅ Toggle capa de altimetría
- ✅ Modo fullscreen

#### 2. **Fuentes de Datos**

##### A. Datos GPS (tabla `gps_tracking`)
```typescript
interface GPSPoint {
  id: string;
  registration_id: string;
  race_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  accuracy?: number;
  battery_level?: number;
  timestamp: string;
}
```

**Origen:**
- App móvil del corredor (RunnerGPSTracker)
- Frecuencia configurable: 10-60 segundos
- Se envía solo si `gps_tracking_enabled = true` en `race_distances`

##### B. Tiempos de Checkpoint (tabla `split_times`)
```typescript
interface SplitTime {
  id: string;
  race_result_id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  distance_km: number;
  split_time: Interval; // Tiempo desde salida
}
```

**Origen:**
- App de cronometraje manual `/timing/record`
- Lectores RFID (futuro)
- Sistema foto-finish (futuro)

#### 3. **Arquitectura de Datos en Tiempo Real**

```
┌──────────────────────┐
│  RUNNER GPS APP      │
│  (React Native/PWA)  │
└──────────┬───────────┘
           │ POST /gps_tracking
           ▼
┌──────────────────────┐
│  SUPABASE            │
│  ├─ gps_tracking     │◄───── INSERT con RLS
│  ├─ split_times      │
│  └─ registrations    │
└──────────┬───────────┘
           │ Realtime Subscription
           ▼
┌──────────────────────┐
│  WEB TRACKING        │
│  camberas.com/live   │
│  /gps/:raceId        │
└──────────────────────┘
```

**Realtime con Supabase:**
```typescript
// Subscribe a GPS updates
const channel = supabase
  .channel(`race:${raceId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'gps_tracking',
      filter: `race_id=eq.${raceId}`
    },
    (payload) => {
      updateRunnerPosition(payload.new);
    }
  )
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'split_times',
      filter: `race_result_id=in.(${resultIds})`
    },
    (payload) => {
      updateRunnerSplits(payload.new);
    }
  )
  .subscribe();
```

#### 4. **Panel de Información del Corredor**

Al hacer click en un marcador o en la lista:

```
┌────────────────────────────────────┐
│  🏃 DORSAL #123                    │
│  Juan Pérez García                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                    │
│  📊 Posición: 15º / 450            │
│  🏆 Categoría: 3º M-Senior         │
│  ⏱️  Tiempo actual: 2h 34m 18s     │
│  📍 KM 32.4 / 42.2                 │
│  🏃 Ritmo: 5:45 min/km             │
│  🔋 Batería: 68%                   │
│                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  📌 PASOS POR CHECKPOINTS          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ✅ Salida     │ 00:00:00          │
│  ✅ KM 10      │ 00:58:23 (6º)     │
│  ✅ KM 21      │ 02:04:15 (10º)    │
│  ⏳ KM 32      │ En ruta...        │
│  ⏹️  Meta       │ --:--:--          │
│                                    │
│  [📈 Ver Gráfico] [🔔 Notificar]  │
└────────────────────────────────────┘
```

#### 5. **Iconografía y Colores**

**Estados del corredor:**
```typescript
enum RunnerStatus {
  ACTIVE = 'active',        // 🏃 Verde - corriendo
  CHECKPOINT = 'checkpoint', // 📍 Azul - en checkpoint
  SLOW = 'slow',            // 🚶 Amarillo - ritmo muy lento
  STOPPED = 'stopped',      // 🛑 Naranja - parado >5min
  DNF = 'dnf',              // ❌ Rojo - retirado
  FINISHED = 'finished'     // 🏁 Gris - finalizó
}
```

**Colores por evento:**
```typescript
const eventColors = {
  '10K': '#10b981',    // Verde
  '21K': '#3b82f6',    // Azul
  '42K': '#8b5cf6',    // Morado
  'Ultra': '#ef4444'   // Rojo
};
```

#### 6. **Optimizaciones de Rendimiento**

**Clustering de marcadores:**
```typescript
// Cuando hay >100 corredores visibles, agrupar
if (runners.length > 100) {
  return <MarkerClusterGroup>{markers}</MarkerClusterGroup>;
}
```

**Throttling de updates:**
```typescript
// Limitar updates del mapa a 1 por segundo
const updateMap = throttle((gpsData) => {
  setRunnerPositions(gpsData);
}, 1000);
```

**Viewport culling:**
```typescript
// Solo renderizar corredores en viewport actual
const visibleRunners = runners.filter(runner => 
  mapBounds.contains([runner.latitude, runner.longitude])
);
```

#### 7. **Interpolación de Posiciones**

Para movimiento suave entre updates GPS:

```typescript
function interpolatePosition(
  lastPos: GPSPoint,
  currentPos: GPSPoint,
  progress: number // 0-1
): [number, number] {
  const lat = lastPos.latitude + 
    (currentPos.latitude - lastPos.latitude) * progress;
  const lng = lastPos.longitude + 
    (currentPos.longitude - lastPos.longitude) * progress;
  return [lat, lng];
}
```

#### 8. **Esquema de Base de Datos**

**Relaciones clave:**
```sql
gps_tracking
├─ registration_id → registrations.id
├─ race_id → races.id
└─ timestamp (index)

split_times
├─ race_result_id → race_results.id
└─ checkpoint_order (index)

race_results
└─ registration_id → registrations.id

registrations
├─ user_id → profiles.id
├─ race_id → races.id
├─ race_distance_id → race_distances.id
└─ bib_number (unique per race)
```

**Query principal para panel:**
```sql
SELECT 
  r.id as registration_id,
  r.bib_number,
  r.race_distance_id,
  p.first_name,
  p.last_name,
  p.gender,
  p.birth_date,
  rd.name as event_name,
  rr.overall_position,
  rr.category_position,
  rr.finish_time,
  rr.status,
  (SELECT row_to_json(gps.*) 
   FROM gps_tracking gps 
   WHERE gps.registration_id = r.id 
   ORDER BY timestamp DESC 
   LIMIT 1) as last_gps,
  (SELECT json_agg(st.* ORDER BY st.checkpoint_order) 
   FROM split_times st 
   WHERE st.race_result_id = rr.id) as splits
FROM registrations r
JOIN profiles p ON p.id = r.user_id
JOIN race_distances rd ON rd.id = r.race_distance_id
LEFT JOIN race_results rr ON rr.registration_id = r.id
WHERE r.race_id = $1
  AND r.status = 'confirmed';
```

#### 9. **Rutas de la Aplicación**

```
camberas.com/live/gps/:raceId          → Mapa seguimiento en vivo
camberas.com/live/gps/:raceId/:bibNumber → Vista individual
camberas.com/live/results/:raceId      → Resultados en vivo (tabla)
camberas.com/live/stats/:raceId        → Estadísticas en tiempo real
```

#### 10. **APIs y Edge Functions Necesarias**

**GET /live/runners/:raceId**
```typescript
// Devuelve snapshot actual de todos los corredores
{
  "runners": [
    {
      "registration_id": "uuid",
      "bib_number": 123,
      "name": "Juan Pérez",
      "event": "42K",
      "position": 15,
      "last_gps": {
        "latitude": 40.4168,
        "longitude": -3.7038,
        "timestamp": "2024-12-01T10:30:15Z"
      },
      "last_checkpoint": {
        "name": "KM 21",
        "split_time": "02:04:15"
      }
    }
  ]
}
```

**POST /live/notify/:registrationId**
```typescript
// Notificar a familiares cuando pasa por checkpoint
{
  "checkpoint_name": "Meta",
  "split_time": "03:45:23",
  "position": 142,
  "photo_url": "https://..."
}
```

#### 11. **Métricas y Analytics**

Dashboard para organizador:

```
┌─────────────────────────────────────┐
│  📊 ESTADÍSTICAS EN VIVO            │
│                                     │
│  👥 Corredores activos: 387 / 450  │
│  🏃 En ruta: 352                    │
│  🏁 Finalizados: 35                 │
│  ❌ Retirados: 12                   │
│                                     │
│  📈 Ritmo promedio: 6:15 min/km     │
│  ⏱️  Tiempo estimado líder: 3h 12m  │
│  🔋 Batería media GPS: 72%          │
│                                     │
│  📍 CHECKPOINT KM 21                │
│  ├─ Pasados: 248                    │
│  ├─ Esperados: 139                  │
│  └─ Ritmo paso: 18 corr/min         │
└─────────────────────────────────────┘
```

---

## 📱 Implementación Técnica PWA

### Configuración de Progressive Web App

**Tecnologías necesarias:**
- **vite-plugin-pwa**: Plugin para generar Service Worker y manifest
- **IndexedDB**: Almacenamiento local de datos (corredores, lecturas pendientes)
- **Service Workers**: Cache de assets y estrategias offline
- **Web Push API**: Notificaciones (opcional, limitado en iOS)

**Manifest (PWA):**
```json
{
  "name": "Camberas Timing - Cronometraje Profesional",
  "short_name": "Timing",
  "description": "App de cronometraje para operadores de carrera",
  "start_url": "/timing",
  "display": "standalone",
  "background_color": "#1a202c",
  "theme_color": "#1a202c",
  "orientation": "portrait",
  "scope": "/timing",
  "icons": [
    { "src": "/timing-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/timing-icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/timing-icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Service Worker - Estrategia de Cache:**
- **NetworkFirst** para API calls: intenta online, fallback a cache
- **CacheFirst** para assets estáticos: CSS, JS, imágenes
- **StaleWhileRevalidate** para datos de corredores: muestra cache, actualiza en background

**Instalación del usuario:**
1. Acceder a `camberas.com/timing` desde navegador móvil
2. Sistema muestra banner "Instalar Camberas Timing"
3. Usuario acepta → se añade icono a pantalla de inicio
4. Próximos accesos: abre como app nativa fullscreen

**Compatibilidad:**
- ✅ Android Chrome: Soporte completo PWA + notificaciones
- ✅ iOS Safari 16.4+: Soporte PWA + notificaciones limitadas
- ✅ Desktop: Instalable en Chrome/Edge/Safari

---

## 📺 Sistema de Broadcasting en Vivo (tipo Singular.live)

### Objetivo
Sistema web para producción de transmisiones en directo con overlays (gráficos) en tiempo real, integrado nativamente con el sistema de cronometraje de Camberas. Permite crear y controlar gráficos profesionales que se muestran sobre el video de la carrera en OBS/vMix.

---

### **1. Arquitectura del Sistema de Broadcasting**

#### **Estructura de 3 Capas**

```
┌─────────────────────────────────────────────┐
│  CAPA DE CONTROL                            │
│  camberas.com/broadcast/control/:raceId     │
│  (Panel del director de transmisión)        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ Supabase Realtime
┌─────────────────────────────────────────────┐
│  CAPA DE DATOS (Supabase)                   │
│  • broadcast_overlays (configuración)       │
│  • broadcast_commands (acciones en vivo)    │
│  • gps_tracking (posiciones)                │
│  • race_results (clasificaciones)           │
│  • split_times (tiempos)                    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ Supabase Realtime
┌─────────────────────────────────────────────┐
│  CAPA DE VISUALIZACIÓN                      │
│  camberas.com/broadcast/overlay/:raceId     │
│  (Pantalla transparente para OBS/vMix)      │
└─────────────────────────────────────────────┘
```

**Flujo de trabajo:**
1. **Director de transmisión** usa el panel de control para seleccionar y configurar overlays
2. Los **comandos** se envían a Supabase vía Realtime
3. La **pantalla de overlay** (abierta en OBS como fuente Browser) recibe los comandos instantáneamente
4. Los **overlays** se muestran/ocultan/actualizan con animaciones profesionales
5. Los **datos en vivo** (GPS, tiempos, clasificación) se actualizan automáticamente

---

### **2. Tablas de Base de Datos Necesarias**

#### **2.1. `broadcast_overlays` - Configuración de Overlays**

```sql
CREATE TABLE broadcast_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES races(id) NOT NULL,
  overlay_type text NOT NULL, -- 'leaderboard', 'runner_card', 'split_comparison', 'map'
  name text NOT NULL, -- "Top 10 General", "Líder Actual", etc.
  position jsonb NOT NULL, -- {x: 100, y: 50, width: 400, height: 300}
  styling jsonb, -- colores, fuentes, animaciones
  data_config jsonb, -- configuración específica del overlay
  is_visible boolean DEFAULT false,
  z_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índice para consultas rápidas por carrera
CREATE INDEX idx_broadcast_overlays_race ON broadcast_overlays(race_id);

-- RLS policies
ALTER TABLE broadcast_overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers can manage their race overlays"
ON broadcast_overlays FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM races
    WHERE races.id = broadcast_overlays.race_id
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view overlays"
ON broadcast_overlays FOR SELECT
USING (true);
```

**Campos importantes:**
- `overlay_type`: Define qué tipo de gráfico es
- `position`: Coordenadas x, y, ancho, alto en píxeles
- `styling`: JSON con colores, fuentes, sombras, etc.
- `data_config`: Configuración específica (ej: top N corredores, dorsal a seguir)
- `is_visible`: Si está visible actualmente en pantalla
- `z_index`: Orden de capas (overlays superpuestos)

#### **2.2. `broadcast_commands` - Comandos en Tiempo Real**

```sql
CREATE TABLE broadcast_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES races(id) NOT NULL,
  command_type text NOT NULL, -- 'show', 'hide', 'update', 'animate'
  target_overlay_id uuid REFERENCES broadcast_overlays(id),
  payload jsonb, -- datos del comando
  executed_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Índice para consultas por carrera y timestamp
CREATE INDEX idx_broadcast_commands_race_time ON broadcast_commands(race_id, executed_at DESC);

-- RLS policies
ALTER TABLE broadcast_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers can create commands for their races"
ON broadcast_commands FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM races
    WHERE races.id = broadcast_commands.race_id
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view commands"
ON broadcast_commands FOR SELECT
USING (true);
```

**Tipos de comandos:**
- `show`: Mostrar un overlay con animación de entrada
- `hide`: Ocultar un overlay con animación de salida
- `update`: Actualizar datos de un overlay visible
- `animate`: Aplicar animación especial (highlight, pulse, etc.)

**Ejemplo de payload:**
```json
{
  "animation": "slide-in-left",
  "duration": 500,
  "data": {
    "bibNumber": 245,
    "highlightPosition": 3
  }
}
```

#### **2.3. `broadcast_presets` - Configuraciones Guardadas**

```sql
CREATE TABLE broadcast_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid REFERENCES races(id) NOT NULL,
  name text NOT NULL, -- "Setup Salida", "Setup Meta", "Comparación Líderes"
  description text,
  overlays jsonb NOT NULL, -- array de configuraciones de overlays
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- RLS policies
ALTER TABLE broadcast_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers can manage their race presets"
ON broadcast_presets FOR ALL
USING (
  has_role(auth.uid(), 'organizer') AND
  EXISTS (
    SELECT 1 FROM races
    WHERE races.id = broadcast_presets.race_id
    AND races.organizer_id = auth.uid()
  )
);
```

**Utilidad:**
- Guardar configuraciones completas de overlays
- Cambiar rápidamente entre setups (ej: "salida", "km 10", "meta")
- Reutilizar configuraciones en eventos similares

---

### **3. Tipos de Overlays Disponibles**

#### **3.1. Leaderboard (Clasificación en Vivo)**

Muestra el Top N de corredores con su posición, dorsal, nombre y tiempo.

**Configuración:**
```typescript
{
  type: 'leaderboard',
  config: {
    topN: 10, // Número de corredores a mostrar
    showBib: true,
    showTime: true,
    showPace: true,
    showCategory: false,
    updateFrequency: 5000, // Actualización cada 5 segundos
    animateChanges: true, // Animar cambios de posición
    highlightTop3: true // Destacar podio
  }
}
```

**Diseño visual:**
```
┌──────────────────────────────────┐
│  🏆 CLASIFICACIÓN GENERAL        │
├──────────────────────────────────┤
│  1  #245  PÉREZ, Juan   2:34:18 │
│  2  #123  GARCÍA, Ana   2:35:42 │
│  3  #678  LÓPEZ, Luis   2:37:09 │
│  4  #089  MARTÍN, Eva   2:38:51 │
│  5  #456  RUIZ, Carlos  2:40:23 │
│  ...                             │
└──────────────────────────────────┘
```

#### **3.2. Runner Card (Tarjeta Individual)**

Muestra información detallada de un corredor específico.

**Configuración:**
```typescript
{
  type: 'runner_card',
  config: {
    bibNumber: 245, // Dorsal del corredor
    showPhoto: true,
    showSplits: true, // Tiempos intermedios
    showLivePosition: true, // Mini mapa con posición GPS
    autoUpdate: true,
    showBattery: false // Batería del GPS
  }
}
```

**Diseño visual:**
```
┌───────────────────────────────────┐
│  🏃 #245  JUAN PÉREZ GARCÍA      │
│  ───────────────────────────────  │
│  📊 Posición: 1º / 450            │
│  🏆 Categoría: 1º M-Senior        │
│  ⏱️  Tiempo: 2:34:18              │
│  📍 KM 32.4 / 42.2                │
│  🏃 Ritmo: 5:45 min/km            │
│  ───────────────────────────────  │
│  SPLITS:                          │
│  ✓ KM 10  00:58:23  (6º)         │
│  ✓ KM 21  02:04:15  (3º)         │
│  ⏳ KM 32  En ruta...             │
└───────────────────────────────────┘
```

#### **3.3. Split Comparison (Comparación de Tiempos)**

Compara tiempos de varios corredores en un checkpoint específico.

**Configuración:**
```typescript
{
  type: 'split_comparison',
  config: {
    bibNumbers: [245, 123, 678], // Dorsales a comparar
    checkpointId: 'km-21', // Checkpoint de comparación
    showDifference: true, // Mostrar diferencias
    highlightLeader: true, // Destacar el más rápido
    showPace: true
  }
}
```

**Diseño visual:**
```
┌─────────────────────────────────────┐
│  📊 PASO POR KM 21                  │
├─────────────────────────────────────┤
│  #245  PÉREZ     02:04:15  🏆       │
│  #123  GARCÍA    02:05:38  +1:23   │
│  #678  LÓPEZ     02:06:51  +2:36   │
└─────────────────────────────────────┘
```

#### **3.4. Live Map (Mapa en Vivo)**

Mapa con posiciones GPS de corredores.

**Configuración:**
```typescript
{
  type: 'live_map',
  config: {
    followBib: 245, // Seguir corredor específico (null = vista completa)
    showTop10: true, // Mostrar solo top 10
    showRoute: true, // Mostrar ruta GPX
    zoom: 14,
    showLabels: true // Mostrar dorsales en marcadores
  }
}
```

#### **3.5. Custom Text (Texto Personalizado)**

Texto libre configurable (sponsors, información, etc.)

**Configuración:**
```typescript
{
  type: 'custom_text',
  config: {
    text: 'Próxima salida: 10:30',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.7)',
    textAlign: 'center'
  }
}
```

---

### **4. Componentes React del Sistema**

#### **4.1. Panel de Control (`/broadcast/control/:raceId`)**

```
src/pages/BroadcastControl.tsx
├─ BroadcastControlPanel
│  ├─ Header (carrera, estado conexión)
│  ├─ OverlaySelector (galería de tipos)
│  ├─ LiveDataPreview (preview datos en vivo)
│  ├─ OverlayConfigurator
│  │  ├─ PositionEditor (arrastrar/redimensionar)
│  │  ├─ StyleEditor (colores, fuentes)
│  │  └─ DataConfigEditor (opciones específicas)
│  ├─ PresetsManager
│  │  ├─ PresetList (cargar guardados)
│  │  └─ SavePresetDialog
│  └─ CommandPanel
│     ├─ ShowButton
│     ├─ HideButton
│     ├─ UpdateButton
│     └─ AnimateButton
```

**Funcionalidades del panel:**
- Crear/editar overlays (tipo, posición, estilo, datos)
- Vista previa en miniatura de cada overlay
- Comandos con un clic: Show/Hide/Animate
- Guardar/cargar presets completos
- Monitor de estado de la conexión Realtime
- Preview en tiempo real de datos actualizados

#### **4.2. Pantalla de Overlay (`/broadcast/overlay/:raceId`)**

```
src/pages/BroadcastOverlay.tsx
├─ BroadcastOverlayRenderer (fondo transparente)
│  ├─ ConnectionStatus (indicador discreto)
│  ├─ OverlayContainer (por cada overlay)
│  │  ├─ LeaderboardOverlay
│  │  ├─ RunnerCardOverlay
│  │  ├─ SplitComparisonOverlay
│  │  ├─ LiveMapOverlay
│  │  └─ CustomTextOverlay
│  └─ TransitionEngine
│     ├─ SlideIn/Out
│     ├─ FadeIn/Out
│     ├─ ScaleIn/Out
│     └─ CustomAnimations
```

**Características técnicas:**
- **Fondo 100% transparente**: CSS `background: transparent`
- **Sin barras de navegación**: Modo fullscreen
- **Optimizado para 60fps**: RequestAnimationFrame
- **Dimensiones estándar**: 1920x1080 (Full HD)
- **Latencia mínima**: < 200ms con Supabase Realtime

---

### **5. Sistema de Comandos en Tiempo Real**

#### **5.1. Desde el Panel de Control**

```typescript
// src/hooks/useBroadcastControl.ts
const useBroadcastControl = (raceId: string) => {
  const showOverlay = async (overlayId: string, animation = 'slide-in-left') => {
    await supabase.from('broadcast_commands').insert({
      race_id: raceId,
      command_type: 'show',
      target_overlay_id: overlayId,
      payload: {
        animation,
        duration: 500
      },
      created_by: user.id
    });
  };

  const hideOverlay = async (overlayId: string, animation = 'slide-out-right') => {
    await supabase.from('broadcast_commands').insert({
      race_id: raceId,
      command_type: 'hide',
      target_overlay_id: overlayId,
      payload: {
        animation,
        duration: 500
      },
      created_by: user.id
    });
  };

  const updateOverlay = async (overlayId: string, newData: any) => {
    await supabase.from('broadcast_commands').insert({
      race_id: raceId,
      command_type: 'update',
      target_overlay_id: overlayId,
      payload: { data: newData },
      created_by: user.id
    });
  };

  return { showOverlay, hideOverlay, updateOverlay };
};
```

#### **5.2. En la Pantalla de Overlay**

```typescript
// src/hooks/useBroadcastOverlay.ts
const useBroadcastOverlay = (raceId: string) => {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [liveData, setLiveData] = useState<LiveData>();

  useEffect(() => {
    // Cargar overlays iniciales
    const loadOverlays = async () => {
      const { data } = await supabase
        .from('broadcast_overlays')
        .select('*')
        .eq('race_id', raceId);
      setOverlays(data || []);
    };
    loadOverlays();

    // Suscripción a comandos
    const commandChannel = supabase
      .channel(`broadcast-commands:${raceId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'broadcast_commands',
        filter: `race_id=eq.${raceId}`
      }, (payload) => {
        handleCommand(payload.new);
      })
      .subscribe();

    // Suscripción a datos en vivo (GPS, resultados)
    const dataChannel = supabase
      .channel(`broadcast-data:${raceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gps_tracking',
        filter: `race_id=eq.${raceId}`
      }, () => {
        updateLiveData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(commandChannel);
      supabase.removeChannel(dataChannel);
    };
  }, [raceId]);

  const handleCommand = (command: BroadcastCommand) => {
    switch(command.command_type) {
      case 'show':
        animateIn(command.target_overlay_id, command.payload);
        break;
      case 'hide':
        animateOut(command.target_overlay_id, command.payload);
        break;
      case 'update':
        updateOverlay(command.target_overlay_id, command.payload.data);
        break;
      case 'animate':
        applyAnimation(command.target_overlay_id, command.payload.animation);
        break;
    }
  };

  const animateIn = (overlayId: string, payload: any) => {
    setOverlays(prev => prev.map(overlay => 
      overlay.id === overlayId
        ? { ...overlay, is_visible: true, animation: payload.animation }
        : overlay
    ));
  };

  const animateOut = (overlayId: string, payload: any) => {
    setOverlays(prev => prev.map(overlay => 
      overlay.id === overlayId
        ? { ...overlay, is_visible: false, animation: payload.animation }
        : overlay
    ));
  };

  return { overlays, liveData };
};
```

---

### **6. Integración con OBS/vMix**

#### **6.1. Configuración en OBS Studio**

1. **Añadir fuente Browser:**
   - Fuentes → Browser
   - URL: `https://camberas.com/broadcast/overlay/:raceId`
   - Ancho: 1920
   - Alto: 1080
   - FPS: 60
   - ✅ Activar "Shutdown source when not visible"
   - ✅ Activar "Refresh browser when scene becomes active"

2. **Configuración de Transparencia:**
   - En propiedades de Browser, CSS personalizado:
   ```css
   body {
     background: transparent !important;
     margin: 0;
     padding: 0;
     overflow: hidden;
   }
   ```

3. **Optimización:**
   - No requiere chroma key (fondo nativo transparente)
   - Latencia típica: 100-200ms
   - GPU rendering automático

#### **6.2. Configuración en vMix**

Similar a OBS, usar "Input → Web Browser":
- URL: `https://camberas.com/broadcast/overlay/:raceId`
- Resolución: 1920x1080
- Transparencia: Automática

---

### **7. Flujo de Trabajo Típico**

#### **Antes del Evento:**

1. **Crear overlays básicos:**
   - Top 10 General
   - Tarjetas de líderes por categoría
   - Mapa en vivo
   - Textos con sponsors

2. **Configurar posiciones:**
   - Usar editor visual de posición
   - Ajustar tamaños y fuentes
   - Previsualizar en diferentes resoluciones

3. **Guardar presets:**
   - "Setup Salida" (info general, sponsors)
   - "Setup Carrera" (clasificación, mapa)
   - "Setup Meta" (llegadas, podio)

#### **Durante el Evento:**

1. **Salida:**
   - Cargar preset "Setup Salida"
   - Mostrar info de la carrera
   - Mostrar sponsors principales

2. **Durante la carrera:**
   - Cargar preset "Setup Carrera"
   - Mostrar clasificación general (actualización automática)
   - Mostrar tarjeta del líder
   - Alternar con mapa en vivo

3. **Meta:**
   - Cargar preset "Setup Meta"
   - Mostrar llegadas en tiempo real
   - Comparar tiempos de podio
   - Celebrar ganadores

#### **Ejemplo de Secuencia:**

```
Minuto 0: Show "Título Carrera" + "Sponsors"
Minuto 5: Hide "Título", Show "Top 10"
Minuto 10: Update "Top 10" (automático cada 5s)
Minuto 15: Show "Líder Actual" (tarjeta individual)
Minuto 20: Hide "Líder", Show "Mapa en Vivo"
Minuto 25: Hide "Mapa", Show "Top 10"
...
Final: Show "Podio" + "Tiempo Ganador"
```

---

### **8. Animaciones Disponibles**

#### **Transiciones de Entrada:**
- `slide-in-left`: Deslizar desde izquierda
- `slide-in-right`: Deslizar desde derecha
- `slide-in-top`: Deslizar desde arriba
- `slide-in-bottom`: Deslizar desde abajo
- `fade-in`: Aparecer gradualmente
- `scale-in`: Crecer desde el centro
- `bounce-in`: Entrada con rebote

#### **Transiciones de Salida:**
- `slide-out-left`, `slide-out-right`, `slide-out-top`, `slide-out-bottom`
- `fade-out`: Desaparecer gradualmente
- `scale-out`: Reducir hacia el centro
- `bounce-out`: Salida con rebote

#### **Animaciones Especiales:**
- `pulse`: Pulsación para llamar atención
- `highlight`: Resaltar cambio de posición
- `shake`: Sacudida para alertas
- `glow`: Efecto de brillo

**Configuración de animación:**
```typescript
{
  animation: 'slide-in-left',
  duration: 500, // milisegundos
  easing: 'ease-out', // ease, ease-in, ease-out, ease-in-out
  delay: 0 // retraso antes de iniciar
}
```

---

### **9. Estructura de Archivos Completa**

```
src/
├── pages/
│   ├── BroadcastControl.tsx      # Panel de control principal
│   └── BroadcastOverlay.tsx      # Pantalla de overlay para OBS
├── components/
│   └── broadcast/
│       ├── overlays/
│       │   ├── LeaderboardOverlay.tsx
│       │   ├── RunnerCardOverlay.tsx
│       │   ├── SplitComparisonOverlay.tsx
│       │   ├── LiveMapOverlay.tsx
│       │   └── CustomTextOverlay.tsx
│       ├── control/
│       │   ├── OverlaySelector.tsx
│       │   ├── OverlayConfigurator.tsx
│       │   ├── PositionEditor.tsx
│       │   ├── StyleEditor.tsx
│       │   ├── DataConfigEditor.tsx
│       │   ├── PresetsManager.tsx
│       │   └── CommandPanel.tsx
│       └── animations/
│           ├── SlideIn.tsx
│           ├── SlideOut.tsx
│           ├── FadeIn.tsx
│           ├── FadeOut.tsx
│           ├── ScaleIn.tsx
│           └── Bounce.tsx
├── hooks/
│   ├── useBroadcastControl.ts
│   ├── useBroadcastOverlay.ts
│   └── useLiveRaceData.ts (ya existe)
└── types/
    └── broadcast.ts
```

---

### **10. Ventajas sobre Singular.live**

| Característica | Singular.live | Camberas Broadcasting |
|----------------|---------------|----------------------|
| **Coste** | Licencia mensual ($$$) | Incluido sin coste adicional |
| **Integración** | API externa | Nativo con cronometraje |
| **Latencia** | ~500ms | < 200ms |
| **Datos en vivo** | Requiere configuración | Automático desde GPS + checkpoints |
| **Personalización** | Plantillas limitadas | 100% personalizable con React |
| **Hosting** | Cloud externo | Autohosteado |
| **Curva aprendizaje** | Interface compleja | Interface intuitiva |
| **Open Source** | ❌ | ✅ |

---

### **11. Casos de Uso**

#### **11.1. Transmisión en Directo**
- YouTube Live
- Twitch
- Facebook Live
- Streaming a web propia

**Setup:**
- OBS con overlay de Camberas
- Cámara en meta o puntos clave
- Comentarista con panel de control
- Datos actualizados en tiempo real

#### **11.2. Pantallas Gigantes en Evento**
- Pantalla LED en zona de salida
- Pantalla en meta con llegadas
- Pantallas en avituallamientos con paso de corredores

**Setup:**
- Navegador en fullscreen apuntando a overlay
- Actualización automática de datos
- Sin operador necesario

#### **11.3. Producción Profesional de TV**
- Integración con estudios profesionales
- Múltiples cámaras
- Gráficos complejos sincronizados

**Setup:**
- vMix con múltiples overlays
- Control remoto desde regía
- Presets por segmento del programa

#### **11.4. Eventos Virtuales/Híbridos**
- Carreras virtuales con participantes remotos
- Webinars con datos en vivo
- Conferencias con pantallas interactivas

---

### **12. Rutas del Sistema**

```
camberas.com/broadcast/control/:raceId     → Panel de control (organizer)
camberas.com/broadcast/overlay/:raceId     → Pantalla overlay (OBS/vMix)
camberas.com/broadcast/preview/:raceId     → Preview sin transparencia (testing)
```

---

### **13. Métricas y Monitorización**

**Panel de estadísticas del broadcast:**
```
┌─────────────────────────────────────┐
│  📺 BROADCAST - Maratón Valencia    │
│                                     │
│  🟢 Estado: En vivo                 │
│  👁️  Viewers: 3                     │
│  📊 Overlays activos: 2/8           │
│  ⏱️  Latencia media: 150ms          │
│                                     │
│  OVERLAYS VISIBLES:                 │
│  • Top 10 General                   │
│  • Mapa en Vivo                     │
│                                     │
│  COMANDOS RECIENTES:                │
│  23:45:12 - Show "Top 10"           │
│  23:44:58 - Hide "Líder"            │
│  23:44:32 - Update "Mapa"           │
└─────────────────────────────────────┘
```

---

## 🔗 Relación con Sistema de Seguimiento GPS

El sistema de broadcasting se integra perfectamente con el sistema de seguimiento GPS en vivo:

```
GPS Tracking (/live/gps/:raceId)
       ↓
  Datos en tiempo real
       ↓
Broadcasting System
       ↓
  Overlays en OBS
       ↓
  Transmisión en vivo
```

**Datos compartidos:**
- Posiciones GPS de corredores
- Clasificación en tiempo real
- Split times actualizados
- Estado de batería de dispositivos
- Estimaciones de llegada

---

## 📧 Sistema de Comunicación con Usuarios y Organizadores

### Objetivo
Proporcionar múltiples canales de comunicación efectiva entre la plataforma, organizadores y corredores para garantizar una experiencia óptima antes, durante y después de las carreras.

---

### ✅ Funcionalidades Implementadas

#### 1. **Sistema de Emails Transaccionales (Resend)**

Sistema de notificaciones automáticas por email para eventos críticos del ciclo de vida de una inscripción.

**Emails implementados:**
- **Confirmación de registro**: Email inmediato al completar inscripción
- **Confirmación de pago**: Notificación tras procesamiento de pago exitoso
- **Confirmación de cancelación**: Email con detalles de cancelación y reembolso (si aplica)
- **Recordatorios de carrera**: Notificaciones automáticas X días antes del evento
- **Recuperación de contraseña**: Link seguro para reseteo de password
- **Email de bienvenida**: Email al registrarse en la plataforma

**Tecnología:**
- Servicio: Resend (resend.com)
- Edge Functions: `send-registration-confirmation`, `send-payment-confirmation`, `send-cancellation-confirmation`, `send-race-reminders`, `send-password-reset`, `send-welcome-email`
- Requiere: `RESEND_API_KEY` en secrets

**Características:**
- Templates HTML responsivos
- Contenido personalizado según datos del usuario/carrera
- Tracking de envíos (opcional)
- Rate limiting automático

#### 2. **Mensajería Interna de Cronometraje**

Chat especializado para coordinación entre operadores de cronometraje durante eventos en vivo.

**Tabla: `race_chat_messages`**
```sql
CREATE TABLE race_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID REFERENCES races(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_system BOOLEAN DEFAULT false
);
```

**Características:**
- Chat en tiempo real entre cronometradores y organizador
- Mensajes del sistema automáticos (ej: "Nueva lectura en Meta: #245")
- Notificación de mensajes no leídos
- Útil para coordinar: "Paso de cabeza en km 10", "Retraso en salida 5 min"
- Visible solo para TIMER y ORGANIZER de la carrera

**Acceso:**
- Ruta: `/timing/chat` (dentro de la app de cronometraje manual)
- Permisos: Solo usuarios TIMER y ORGANIZER asignados a la carrera

---

### 🔧 Funcionalidades por Implementar

#### 3. **Mensajería Directa Organizador-Corredor** ⏳

> **ESTADO**: POSPUESTO PARA FUTURO INMEDIATO  
> **RAZÓN**: Se implementó inicialmente pero se decidió revertir para priorizar otras funcionalidades core.  
> **PRÓXIMOS PASOS**: Implementar cuando el sistema de cronometraje y resultados esté completamente estabilizado.

Sistema de chat 1-1 para comunicación privada entre organizador y participante.

**Casos de uso:**
- Consultas específicas sobre inscripción
- Solicitudes de información adicional (certificados médicos, etc.)
- Resolución de incidencias personalizadas
- Comunicación post-carrera (fotos, diplomas, etc.)

**Tablas propuestas:**
```sql
-- Conversaciones individuales
CREATE TABLE direct_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID REFERENCES races(id) NOT NULL,
  organizer_id UUID REFERENCES profiles(id) NOT NULL,
  runner_id UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  unread_count_organizer INTEGER DEFAULT 0,
  unread_count_runner INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' -- active, archived, closed
);

-- Mensajes del chat directo
CREATE TABLE direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES direct_conversations(id) NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ
);
```

**Funcionalidades:**
- Chat estilo WhatsApp/Telegram
- Historial persistente de conversación
- Indicadores de "mensaje leído"
- Notificaciones push (opcional)
- Búsqueda de conversaciones por dorsal/nombre
- Filtros: pendientes, archivadas, por carrera

**Rutas:**
- `/organizer/messages` - Lista de conversaciones (organizador)
- `/messages` - Mis conversaciones con organizadores (corredor)
- `/messages/:conversationId` - Chat individual

#### 4. **Formularios de Contacto**

Formularios clásicos para consultas generales sin necesidad de autenticación.

##### 4.1 **Formulario de Contacto para Usuarios (Corredores)**

**Ubicación:** `/contacto` o footer de la web

**Campos:**
- Nombre completo (obligatorio)
- Email (obligatorio)
- Asunto (select con opciones)
  - Consulta sobre inscripción
  - Problema técnico
  - Sugerencia
  - Otro
- Mensaje (textarea, obligatorio, min 20 caracteres)
- Carrera relacionada (opcional, select)

**Funcionalidad:**
- Envío de email al equipo de soporte/admin
- Copia del mensaje al usuario
- No requiere autenticación
- Rate limiting para prevenir spam (max 3 mensajes/hora por IP)

##### 4.2 **Formulario de Contacto para Organizadores**

**Ubicación:** `/organizadores/contacto` o sección específica para organizadores

**Campos:**
- Nombre de la organización (obligatorio)
- Nombre del contacto (obligatorio)
- Email (obligatorio)
- Teléfono (opcional)
- Tipo de consulta (select)
  - Solicitar cuenta de organizador
  - Información sobre servicios de cronometraje
  - Contratar broadcasting
  - Soporte técnico
  - Otro
- Número de eventos anuales (select: 1-2, 3-5, 6-10, >10)
- Mensaje (textarea, obligatorio)

**Funcionalidad:**
- Envío a email de ventas/admins
- Priorización automática según tipo de consulta
- Creación de lead en sistema (opcional)
- Auto-respuesta con información relevante

**Edge Functions:**
- `send-contact-form` - Procesar y enviar formulario de contacto
- `send-organizer-inquiry` - Procesar consultas de organizadores

---

### 🔮 Funcionalidades Futuras (No Inmediatas)

#### 5. **Newsletter y Marketing (Resend Audiences)**

Sistema de campañas de email marketing para engagement y retención.

**Características:**
- Campañas segmentadas por tipo de usuario:
  - Corredores trail vs carretera
  - Por ubicación geográfica
  - Por nivel (principiante, intermedio, avanzado)
- Estadísticas de apertura y clicks
- Templates de newsletters
- Gestión de suscripciones/unsuscribe

**Casos de uso:**
- Anuncio de nuevas carreras
- Recordatorio de inscripciones que cierran pronto
- Contenido educativo (entrenamientos, nutrición)
- Ofertas y descuentos especiales

---

### ❌ Funcionalidades Descartadas

#### **Chat de Soporte en Vivo con IA**

**Motivo del descarte:** 
Las preguntas de los usuarios pueden ser genéricas y salir del ámbito específico de Camberas. Un chatbot podría dar respuestas incorrectas o fuera de contexto, generando frustración.

**Alternativa implementada:**
- Formularios de contacto tradicionales
- FAQs por carrera (ya implementado)
- FAQs para organizadores (ya implementado)

#### **SMS Transaccionales (Twilio)**

**Motivo del descarte:**
- Coste elevado por mensaje
- Bajo ROI para notificaciones no críticas
- Email es suficiente para la mayoría de comunicaciones

**Casos excepcionales:** 
Si un organizador lo requiere específicamente para eventos masivos, se puede implementar a demanda.

#### **Sistema de Anuncios Internos (Banners)**

**Motivo del descarte:**
- Puede resultar intrusivo
- Email y notificaciones in-app son suficientes

**Alternativa:**
- Usar toast notifications para mensajes urgentes
- Dashboard con sección de "Novedades" (opcional)

#### **Webhooks Salientes**

**Motivo del descarte:**
- Complejidad técnica para usuarios no técnicos
- Bajo volumen de solicitudes de integraciones externas
- Se puede implementar a demanda para clientes enterprise

**Casos excepcionales:**
Organizadores con sistemas propios que necesiten sincronización automática.

---

### 📊 Arquitectura de Comunicaciones

```
┌─────────────────────────────────────────────┐
│         USUARIOS / CORREDORES               │
└─────────┬───────────────────────────────────┘
          │
          ├─> Emails transaccionales (Resend)
          │   • Confirmaciones
          │   • Recordatorios
          │   • Recuperación password
          │
          ├─> Formulario de contacto
          │   • Consultas generales
          │   • Sin autenticación
          │
          └─> Mensajería directa (futuro)
              • Chat 1-1 con organizador
              • Consultas específicas

┌─────────────────────────────────────────────┐
│           ORGANIZADORES                     │
└─────────┬───────────────────────────────────┘
          │
          ├─> Mensajería interna cronometraje
          │   • Coordinación en vivo
          │   • Chat entre TIMERS
          │
          ├─> Formulario de contacto
          │   • Solicitar cuenta
          │   • Contratar servicios
          │
          └─> Mensajería directa (futuro)
              • Chat 1-1 con corredores
              • Gestión de incidencias

┌─────────────────────────────────────────────┐
│         ADMINISTRADORES                     │
└─────────┬───────────────────────────────────┘
          │
          ├─> Reciben formularios de contacto
          ├─> Reciben consultas de organizadores
          └─> Gestionan soporte
```

---

### 🔐 Seguridad y RLS

**Políticas de acceso:**

```sql
-- race_chat_messages: solo TIMER y ORGANIZER de la carrera
CREATE POLICY "Timer y organizer pueden ver mensajes de su carrera"
ON race_chat_messages FOR SELECT
USING (
  race_id IN (
    SELECT race_id FROM races WHERE organizer_id = auth.uid()
    UNION
    SELECT race_id FROM timer_assignments WHERE user_id = auth.uid()
  )
);

-- direct_conversations: solo participantes de la conversación
CREATE POLICY "Users can view their own conversations"
ON direct_conversations FOR SELECT
USING (
  auth.uid() = organizer_id OR auth.uid() = runner_id
);

-- direct_messages: solo participantes de la conversación
CREATE POLICY "Users can view messages in their conversations"
ON direct_messages FOR SELECT
USING (
  conversation_id IN (
    SELECT id FROM direct_conversations 
    WHERE auth.uid() = organizer_id OR auth.uid() = runner_id
  )
);
```

---

### 📈 Métricas de Comunicación

**KPIs a trackear:**
- Tasa de apertura de emails transaccionales
- Tiempo de respuesta en mensajería directa
- Número de formularios de contacto por semana
- Satisfacción del usuario (opcional: rating post-respuesta)
- Mensajes de cronometraje en eventos en vivo

---

**Última actualización**: 2025-12-02
**Versión**: 1.2
**Autor**: Camberas Team

---