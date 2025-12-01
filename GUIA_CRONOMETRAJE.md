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
- **Manual**: Registro de tiempos por observador
- **Chip RFID**: Detección automática en cada checkpoint
- **GPS**: Tracking en tiempo real (implementado)
- **Foto-finish**: Para llegadas muy ajustadas

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
- reading_type (automatic, manual)
- lap_number (para circuitos con vueltas)
- is_processed (si ya se convirtió en split_time)
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
4. Procesamiento:
   - Filtrar lecturas duplicadas por checkpoint
   - Calcular split_times a partir de timing_readings
   - Calcular finish_time → race_results
5. Cálculo automático de clasificaciones:
   - Clasificación general (overall_position)
   - Clasificación por sexo (gender_position)
   - Clasificación por categoría (category_position)
   - Pace promedio
6. Publicación resultados en vivo
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

---

## ⚠️ Pendientes de Implementar

### Alta Prioridad
1. **Tabla timing_readings**: Implementar tabla de lecturas raw antes de procesar split_times
2. **Procesamiento de lecturas**: Lógica para convertir readings en split_times
3. **Categorías Automáticas**: Calcular categoría según edad + género
4. **Gestión de Chips**: Vincular chips RFID a dorsales en timing_readings
5. **DNF/DNS/DSQ**: Estados de resultados (No terminó/No salió/Descalificado)
6. **Tiempos Netos**: Diferencia entre tiempo gun y neto
7. **Vueltas/Laps**: Campo lap_number en timing_readings para circuitos
8. **Filtrado de duplicados**: Lógica para detectar y gestionar lecturas múltiples

### Media Prioridad
5. **Equipos/Clubes**: Clasificación por equipos
6. **Relevos**: Eventos con múltiples participantes por dorsal
7. **Diplomas**: Generación automática de certificados
8. **Récords**: Tracking de récords de carrera/evento

### Baja Prioridad
9. **Foto-finish**: Sistema de fotos en meta vinculadas a dorsales
10. **Estadísticas**: Análisis de rendimiento histórico
11. **Rankings**: Sistemas de puntuación entre carreras

---

## 🔧 Mejoras Técnicas Sugeridas

### Refactorización Futura (cuando convenga)
```sql
-- Renombrar tabla principal
ALTER TABLE race_distances RENAME TO race_events;

-- Añadir tabla de lecturas de cronometraje (CRÍTICO)
CREATE TABLE timing_readings (
  id uuid PRIMARY KEY,
  registration_id uuid REFERENCES registrations(id),
  race_id uuid REFERENCES races(id),
  checkpoint_id uuid REFERENCES race_checkpoints(id),
  bib_number integer NOT NULL,
  chip_code text, -- nullable para lecturas manuales
  timing_timestamp timestamptz NOT NULL, -- hora del crono
  reader_device_id text, -- identificador del lector
  operator_user_id uuid, -- usuario si es manual
  reading_timestamp timestamptz DEFAULT now(), -- cuando se registró
  reading_type text DEFAULT 'automatic', -- automatic, manual
  lap_number integer DEFAULT 1,
  is_processed boolean DEFAULT false,
  notes text
);

-- Añadir referencia en split_times a la lectura original
ALTER TABLE split_times 
ADD COLUMN timing_reading_id uuid REFERENCES timing_readings(id);

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

### Estándares
- **IAAF**: Reglas de atletismo internacional
- **ITRA**: Reglamento trail running
- **UCI**: Normativa ciclismo MTB

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
3. **Arquitectura de datos**:
   - timing_readings es la fuente de verdad (lecturas raw)
   - split_times se CALCULA a partir de timing_readings
   - Nunca insertes split_times directamente, usa timing_readings
4. **Valida rangos de dorsales** al asignar
5. **Ordena splits** por checkpoint_order
6. **Calcula categorías** automáticamente si existe birth_date
7. **Diferencia estados**: pending, confirmed, cancelled, finished, dnf, dns, dsq
8. **Múltiples lecturas**: Un dorsal puede tener varias lecturas en el mismo checkpoint
   - Guardar todas en timing_readings con is_processed=false
   - Aplicar lógica de filtrado al procesar (ej: timestamp más cercano)
   - Generar un solo split_time por checkpoint (o múltiples si hay laps)
   - Para circuitos con vueltas: usar lap_number
9. **Tipos de lecturas**:
   - Automáticas (chip RFID): chip_code presente, operator_user_id null
   - Manuales: operator_user_id presente, chip_code puede ser null

---

## 🚀 Roadmap Sugerido

### Fase 1: Estabilización (actual)
- ✅ Carreras y eventos (race_distances)
- ✅ Inscripciones con dorsales
- ✅ Checkpoints y splits
- ✅ Resultados básicos
- ✅ GPS tracking

### Fase 2: Profesionalización
- 🔲 Categorías automáticas
- 🔲 Gestión de chips RFID
- 🔲 Tiempos netos vs gun time
- 🔲 Estados avanzados (DNF/DNS/DSQ)

### Fase 3: Escalado
- 🔲 Clasificaciones por equipos
- 🔲 Sistema de récords
- 🔲 Diplomas automáticos
- 🔲 Rankings multi-carrera

---

**Última actualización**: 2025-12-01
**Versión**: 1.0
**Autor**: Camberas Team