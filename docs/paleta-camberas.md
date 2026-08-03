# Paleta Camberas

Paleta oficial de la casa, nacida de las ilustraciones (covers por defecto de las
tarjetas, planes, pórtico Camberas Timing). Referencia para web, app, dorsales,
cartelería y cualquier pieza nueva. **Ampliar aquí, no inventar colores sueltos.**

## Colores principales

| Nombre | Hex | Uso |
|---|---|---|
| **Verde tinta** | `#0E2419` | Trazos y figuras de las ilustraciones, texto principal, fondos oscuros |
| **Verde Camberas** | `#235940` | Color de marca (logo, faldón de dorsales, botones primarios web) |
| **Naranja Camberas** | `#EC7C2B` | Color de acción: botones CTA, acentos, banda del pórtico, corona del capo |
| **Crema** | `#FAF6EC` | Líneas y detalles sobre verde, fondos de tarjeta claros, texto sobre oscuro |

## Verdes de colina (siempre en este orden, de delante a atrás)

| Nombre | Hex | Uso |
|---|---|---|
| **Colina clara** | `#3CA15B` | Primera colina |
| **Colina media** | `#2E8B4A` | Segunda colina |
| **Colina oscura** | `#1E5B38` | Tercera colina / fondos de pie de página |

## Cielos (fondos de ilustración)

| Nombre | Hex | Uso |
|---|---|---|
| **Arena** | `#FCEBD6` | Cielo de Trail y Quedada; fondos cálidos claros |
| **Lima pálido** | `#E9F6C6` | Cielo de MTB y Grupetta |
| **Verde crema** | `#EDF4DE` | Cielo del pórtico (Profesional) |

## Acentos

| Nombre | Hex | Uso |
|---|---|---|
| **Lima** | `#C8E85C` | Sol sobre cielos verdes, acentos frescos |
| **Sol melocotón** | `#F6C89A` | Sol sobre cielo arena |

## Notas de uso

- **El naranja es el color de acción**: una sola llamada principal por pantalla.
- Sobre **verde tinta**, el texto va en **crema**; sobre **arena**, en **verde tinta**.
- Las colinas siempre en sus tres tonos y su orden — son la firma de la casa.
- Variantes históricas aún presentes en el código (converger hacia esta paleta
  cuando se toquen): `#EE7C2B` (naranja del faldón en BibDesigner) y
  `#FDF7E9` (crema del faldón en BibDesigner).

## Dónde se usa hoy

- `src/assets/cover-{trail,mtb,quedada,grupetta}.svg` — covers por defecto
- `src/assets/plan-{grupetta,quedada,profesional}.svg` — ilustraciones de Planes
- `src/components/bib-designer/BibDesigner.tsx` — faldón Camberas de los dorsales
- Tema web (`src/index.css`): primary = verde Camberas, secondary = naranja
