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