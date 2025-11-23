# Guía de Tamaños de Imágenes - Camberas

## 📸 Especificaciones de Imágenes

### Imágenes de Carreras (races)

#### **Imagen Principal de Carrera** (`image_url`)
- **Tamaño recomendado**: 800x600 píxeles (ratio 4:3)
- **Tamaño mínimo**: 600x450 píxeles
- **Tamaño máximo**: 1200x900 píxeles
- **Formato**: JPG o PNG
- **Peso máximo**: 500 KB
- **Uso**: Se muestra en las tarjetas de carreras en la página principal y listado

#### **Imagen de Portada** (`cover_image_url`)
- **Tamaño recomendado**: 1920x800 píxeles (ratio 2.4:1 - panorámica)
- **Tamaño mínimo**: 1600x667 píxeles
- **Tamaño máximo**: 2400x1000 píxeles
- **Formato**: JPG
- **Peso máximo**: 800 KB
- **Uso**: Hero image en la página de detalle de la carrera

#### **Logo de Carrera** (`logo_url`)
- **Tamaño recomendado**: 400x400 píxeles (cuadrado)
- **Tamaño mínimo**: 200x200 píxeles
- **Tamaño máximo**: 600x600 píxeles
- **Formato**: PNG con transparencia preferiblemente
- **Peso máximo**: 200 KB
- **Uso**: Se muestra en la esquina superior de la página de detalle

#### **Cartel de Carrera** (`poster_url`)
- **Tamaño recomendado**: 800x1200 píxeles (ratio 2:3 - vertical)
- **Tamaño mínimo**: 600x900 píxeles
- **Tamaño máximo**: 1200x1800 píxeles
- **Formato**: JPG o PNG
- **Peso máximo**: 600 KB
- **Uso**: Cartel promocional de la carrera

---

### Imágenes de Distancias (race_distances)

#### **Imagen de Distancia** (`image_url`)
- **Tamaño recomendado**: 800x480 píxeles (ratio 5:3)
- **Tamaño mínimo**: 600x360 píxeles
- **Tamaño máximo**: 1200x720 píxeles
- **Formato**: JPG o PNG
- **Peso máximo**: 400 KB
- **Uso**: Se muestra en las tarjetas de cada distancia dentro del detalle de carrera

---

## 🎨 Recomendaciones Generales

### Calidad de Imagen
- **Resolución mínima**: 72 DPI para web
- **Optimización**: Usar herramientas de compresión para reducir peso sin perder calidad
- **Colores**: Perfil de color sRGB para mejor compatibilidad web

### Composición
- **Carreras**: Imágenes de paisajes montañosos, corredores en acción, vistas panorámicas
- **Distancias**: Fotografías que representen el nivel/dificultad de cada distancia
- **Logos**: Diseños claros, legibles, que funcionen bien en fondos claros y oscuros

### Herramientas Recomendadas

#### Editores Online Gratuitos
1. **Photopea** (https://www.photopea.com/)
   - Editor similar a Photoshop
   - Permite recortar, redimensionar y optimizar
   
2. **Canva** (https://www.canva.com/)
   - Plantillas prediseñadas
   - Fácil de usar para recortes y ajustes

3. **TinyPNG** (https://tinypng.com/)
   - Compresión de imágenes sin pérdida visible de calidad
   - Reduce el peso de archivos JPG y PNG

#### Recorte Rápido por Ratio
- **4:3 (Carreras)**: Landscape clásico, ideal para tarjetas
- **5:3 (Distancias)**: Slightly wider, muestra más contexto
- **2.4:1 (Portadas)**: Ultra panorámica para hero sections
- **1:1 (Logos)**: Cuadrado para máxima versatilidad

---

## 📋 Checklist antes de Subir

- [ ] La imagen está en el tamaño recomendado
- [ ] El peso del archivo es menor al máximo especificado
- [ ] La imagen es nítida y de buena calidad
- [ ] Los elementos importantes están centrados (no en los bordes)
- [ ] El formato es correcto (JPG/PNG según especificaciones)
- [ ] La imagen se ve bien tanto en desktop como en móvil

---

## 🔧 Próximas Mejoras Planificadas

- Herramienta de recorte integrada en Camberas
- Redimensionamiento automático al subir
- Vista previa antes de guardar
- Sugerencias de encuadre según tipo de imagen