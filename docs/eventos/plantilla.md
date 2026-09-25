# Plantilla web multi-tenant · qué se pinta y cuándo

La web de Gurriana es la plantilla base. Cada sección se renderiza solo si el evento trae los datos; nada se inventa. Menú y secciones se generan desde el mismo JSON.

## Menú (se construye solo)

| Grupo | Aparece si | Subenlaces |
|---|---|---|
| Recorridos / Pruebas | siempre | una entrada por `pruebas[]` (id → `#gt40`, `#k6`, `#r12`…) |
| Inscripción | siempre | Precios y plazos · Qué incluye (`inscripcion.incluye`) · Bajas (`devolucion`) · Equipos (`modalidades ∋ equipo`) · Dorsal solidario (`∋ solidario`) |
| Reglamento | `reglamento` o `documentos[tipo=reglamento]` | Material (`materialObligatorio`) · Categorías (`categorias`) · Cortes (`avituallamientos[].corte`) · Marcaje (`reglamento.marcaje`) · Reclamaciones |
| Día de carrera | `programa` o `dorsales` | Programa · Dorsales · Salida y meta · Sanitario (`sanitario`) |
| Info práctica | `infoPractica` con algún campo | Cómo llegar · Alojamiento · Espectadores · FAQ |
| Más | siempre | Clasificaciones (`clasificaciones`) · Galería (`fotos`) · Medioambiente (`medioAmbiente`) · Causa solidaria (`beneficiario`) · Patrocinadores · Contacto |

Regla del menú: un grupo con un solo subenlace se convierte en enlace directo; un grupo sin subenlaces desaparece.

## Secciones y su condición

| Sección | Condición | Notas de plantilla |
|---|---|---|
| Hero | siempre | Fecha, lugar, pruebas con hora de salida, estado (`abierta/agotada/…`) y CTA. Sin foto: `marca.colorMarca` + textura del logo si `heroTexturaLogo`. |
| Franja de cifras | siempre | Nº de pruebas, `limiteDorsales`, `altMax` (si hay), cierre. Se calculan; no se escriben. |
| Cinta de meta | siempre | Único degradado permitido (libro de diseño). |
| Causa solidaria | `beneficiario` | Nombre, texto, logo, enlace. Guardia Civil. |
| Recorridos | siempre | Tarjeta por prueba: cifras (distancia, D+, altMax, límite) → solo las que existan. Perfil de altimetría solo si hay `altMax/altMin` y avituallamientos con km. Terreno si `terreno`. Track si `track`. |
| Avituallamientos por prueba | `pruebas[].avituallamientos` | Dentro de la tarjeta de la prueba. |
| Tabla de edades / categorías | `pruebas[].edad` o `categorias` | Infantiles (Guardia Civil) y máster (Entre Viñedos). |
| Inscripción · precios | siempre | Si una tarifa tiene varios `periodos`, tabla de periodos con el vigente resaltado (Las Arenas). Si hay `condicion.federado`, dos columnas (Gurriana). |
| Inscripción · equipos | `modalidades ∋ equipo` | Texto de "grupos de N, un pago" y botón propio (Entre Viñedos). |
| Inscripción · dorsal solidario | `modalidades ∋ solidario` | Importes libres (Guardia Civil). |
| Inscripción · presencial | `modalidades ∋ presencial` | Precio del día y dónde (Ademco, Entre Viñedos). |
| Widget de inscripción | `estado = abierta` | `<camberas-inscripcion>`; si `pasarela.proveedor ≠ camberas`, botón externo a `pasarela.url`. |
| Reglamento | `reglamento` | Tarjetas solo para las claves presentes. |
| Día de carrera | `programa` o `dorsales` | Programa cronológico generado de `programa[]`. |
| Premios | `premios` | Guardia Civil. |
| Servicios | `servicios` | Grid de iconos (Las Arenas, Guardia Civil). |
| Camiseta | `camiseta` | Con imagen si `camiseta.imagen`; aviso de límite si `camiseta.limite` (Ademco: primeros 400). |
| Sanitario | `sanitario` | Gurriana. |
| Medioambiente | `medioAmbiente` | Gurriana. |
| Info práctica | `infoPractica` | Solo las claves presentes. |
| Clasificaciones | `clasificaciones` | Enlace en vivo si `tiempoReal`; años anteriores. |
| Galería | `fotos` | Botón desactivado si `disponible = false`. |
| Patrocinadores | `patrocinadores` | Agrupados por `nivel`: organiza · principal · institucional · beneficiario · colaborador. Logos si `logo`; si no, chips de texto (Gurriana). |
| Footer / contacto | siempre | `contacto`, `documentos`, `servicios_tecnicos`. |

## Acceso a datos en la plantilla

```ts
// src/data/useEvento.ts
import respaldo from "./evento.json";              // copia estática (build) — mismo esquema
export function useEvento() { return evento; }     // hoy: JSON local
// mañana: loader de TanStack Start → fetch(`${API}/v1/eventos/${SLUG}`) con fallback a `respaldo`
// + useEstado(): fetch(`${API}/v1/eventos/${SLUG}/estado`) en cliente, revalidando cada 60 s
```

Migración desde el `race.json` actual de Gurriana: es un subconjunto del esquema; el mapeo está hecho en `eventos/gurriana-trail-2027.json`. Cambios de nombre: `federacion`, `lugar` (objeto), `inscripcion.tarifas[]` en vez de `precioFederado/NoFederado` por prueba, `apoyos[]` → `patrocinadores[] nivel institucional`, `medioAmbiente.lic` → `espacio`.

## Marca por tenant

`marca.colorMarca` (forest en Gurriana, verde GC en la Guardia Civil), `marca.colorAccion` (lime / amarillo), `colorSecundario`. La plantilla los inyecta como `--forest`, `--lime`, `--sky` en `styles.css`; el resto del libro de diseño (tipografía, espaciado, componentes) es común. Si `marca` falta, se usa el libro de diseño Camberas.
