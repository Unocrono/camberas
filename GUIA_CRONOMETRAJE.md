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
└── race_results               └── race_results
    └── split_times                └── split_times
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

#### `split_times` - Tiempos Intermedios
```sql
- id
- race_result_id
- checkpoint_name
- checkpoint_order
- split_time (interval) -- tiempo acumulado desde salida
- distance_km
- lap_number (futuro) -- para carreras con vueltas
- timestamp (futuro) -- momento exacto de lectura

NOTA: No hay constraint único en (race_result_id, checkpoint_order)
Esto permite múltiples registros del mismo checkpoint:
- Circuitos con vueltas
- Lecturas duplicadas a filtrar
- Puntos de paso/retorno
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
1. Salida: Registro tiempo inicial (chip/manual)
2. Checkpoints: Registro de splits
3. Meta: Tiempo final
4. Cálculo automático:
   - Clasificación general
   - Clasificación por categoría
   - Pace promedio
5. Publicación resultados en vivo
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
1. **Categorías Automáticas**: Calcular categoría según edad + género
2. **Gestión de Chips**: Tabla de chips RFID vinculados a dorsales
3. **DNF/DNS/DSQ**: Estados de resultados (No terminó/No salió/Descalificado)
4. **Tiempos Netos**: Diferencia entre tiempo gun y neto
5. **Vueltas/Laps**: Campo lap_number en split_times para circuitos
6. **Filtrado de duplicados**: Lógica para detectar y gestionar lecturas múltiples

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

-- Añadir tabla de categorías
CREATE TABLE event_categories (
  id uuid PRIMARY KEY,
  event_id uuid REFERENCES race_events(id),
  name text, -- "M-Senior", "F-VetA"
  min_age int,
  max_age int,
  gender text
);

-- Añadir tabla de chips
CREATE TABLE timing_chips (
  id uuid PRIMARY KEY,
  chip_code text UNIQUE,
  registration_id uuid REFERENCES registrations(id),
  status text -- active, lost, damaged
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
3. **Valida rangos de dorsales** al asignar
4. **Ordena splits** por checkpoint_order
5. **Calcula categorías** automáticamente si existe birth_date
6. **Diferencia estados**: pending, confirmed, cancelled, finished, dnf, dns, dsq
7. **Múltiples lecturas**: Un dorsal puede tener varias lecturas en el mismo checkpoint
   - Para circuitos con vueltas: añadir lap_number
   - Para lecturas duplicadas: filtrar por timestamp más cercano
   - Para ida/vuelta: distinguir por dirección o lap_number

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