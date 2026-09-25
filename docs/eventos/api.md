# API de eventos Camberas · contrato v1

Todo lo que la plantilla web y el widget de inscripción necesitan. Un solo esquema (`evento.schema.json`) para los cinco tipos de carrera probados.

## Endpoints públicos (sin autenticación, CORS por dominio del tenant)

| Método | Ruta | Devuelve | Caché |
|---|---|---|---|
| GET | `/v1/eventos/{slug}` | El evento completo según `evento.schema.json` | 5 min (CDN) |
| GET | `/v1/eventos/{slug}/estado` | `{ estado, plazasDisponibles, tarifaActual: {id, precio, hasta}, cierre }` | sin caché (tiempo real) |
| GET | `/v1/eventos/{slug}/clasificaciones?prueba=GT40` | Clasificación (cuando exista) | 30 s el día de carrera |
| GET | `/v1/tenants/{tenant}` | Marca, logo, colores, contacto por defecto, lista de eventos | 1 h |

`GET /eventos/{slug}` es lo que hoy es `race.json`. La plantilla lo pide en build (Vite/TanStack: `loader`) y guarda una copia estática de respaldo en el repo; `/estado` se pide en el navegador al cargar, para pintar "quedan 37 plazas" y la tarifa vigente sin republicar la web.

## Endpoints del widget (inscripción)

| Método | Ruta | Cuerpo / Devuelve |
|---|---|---|
| POST | `/v1/eventos/{slug}/presupuesto` | Entrada: `{ prueba, modalidad, respuestas: {campoId: valor}, extras: {extraId: valor}, cupon? , fechaNacimiento, federado? }` → `{ lineas: [{concepto, importe}], total, tarifaAplicada, avisos[] }`. Calcula tarifa por periodo, condiciones (federado, residente, edad), extras, descuentos y cupón. |
| POST | `/v1/inscripciones` | `{ evento, prueba, modalidad, inscritos: [Inscrito], equipo?: {nombre, capitan}, extras, cupon, consentimientos }` → `{ inscripcionId, total, pago: {proveedor, url \| clientSecret} }`. En equipo, `inscritos` lleva N miembros y un solo pago. |
| GET | `/v1/inscripciones/{id}` | Estado: `pendiente_pago \| pagada \| anulada` + resumen (sin datos personales completos) |
| POST | `/v1/pagos/webhook/{proveedor}` | Confirmación del TPV (Redsys/Stripe). Marca la inscripción como pagada y dispara email. |

### `Inscrito` (campos básicos, iguales a los que hoy pide uno.es)

```
nombre, apellidos, dni, sexo (M/F), fechaNacimiento, email, movil, localidad, comunidadAutonoma,
club?, respuestas: { campoId: valor }        // campos definidos en evento.inscripcion.campos
tutor?: { nombre, dni, email, telefono, autorizacion: true }   // si menor y evento.inscripcion.menores.tutor
```

En equipos (`modalidad: equipo`) email y móvil solo se piden al capitán (`porInscrito: false` en el campo).

## Reglas que el backend calcula (no la web)

1. **Tarifa vigente**: primer periodo de la tarifa cuya ventana `desde/hasta` contiene la fecha actual; si ninguno, la inscripción está cerrada para esa tarifa.
2. **Condiciones**: `federado`, `residente`, `socio`, `edadMin/Max` se evalúan con las respuestas; si una tarifa tiene condición y no se cumple, se ofrece la siguiente aplicable.
3. **Edad**: según `categoria.criterio` (`edad_dia_prueba` por defecto; `anio_nacimiento` en infantiles tipo Guardia Civil).
4. **Extras con límite** (camiseta a los primeros 400): se descuenta al confirmar el pago, no al abrir el formulario.
5. **Plazas**: `limiteDorsales` global y `pruebas[].plazas` por prueba; una reserva vive 15 min mientras se paga.
6. **Descuento online** (Ademco): se modela como tarifa distinta para `modalidad: presencial`, no como descuento en tiempo de cálculo.

## Widget `<camberas-inscripcion>`

```html
<div id="camberas-inscripcion" data-evento="gurriana-trail-2027" data-prueba="GT40"></div>
<script src="https://app.camberas.com/embed/v1.js" async></script>
```

- Web Component con Shadow DOM; sin iframe salvo el campo de tarjeta del proveedor de pago (PCI).
- Lee `/eventos/{slug}` y `/estado`, pinta pruebas → tarifa → formulario → extras → resumen (`/presupuesto`) → pago.
- Atributos: `data-prueba` (preselección), `data-color`, `data-idioma`, `data-modo="boton|inline"`.
- Eventos DOM: `camberas:inscrito` `{inscripcionId}` para que la web del cliente haga lo que quiera (analytics, mensaje).
- Al volver del TPV (redirección) el widget lee `?camberas_inscripcion=ID` de la URL y muestra el estado.

## Mapeo desde uno.es (Joomla · Events Booking)

| uno.es (EB) | Esquema Camberas |
|---|---|
| `first_name, last_name, eb_DNI, eb_sexo, fechanacimiento, email, phone, eb_Localidad, eb_Region, Club` | `Inscrito` básico |
| Campos custom `Modalida_*`, `Categorias*`, `empadronado*`, `SocioAdemco` | `inscripcion.campos[]` (tipo `opcion` / `si_no`) |
| `tallacamiseta_*` | `inscripcion.extras[]` tipo `talla` |
| `ConCamiseta = Si +7€` | `inscripcion.extras[]` tipo `opcion` con `precio` |
| `eb_Nombre_Tutor, dniPadre, emailpadre, eb_TelefonoPadre, eb_Autoriza` | `Inscrito.tutor` (activado por `menores.tutor`) |
| `coupon_code` | `descuentos[] tipo cupon` + campo `cupon` en `/presupuesto` |
| `individual-registration` / `group-registration` (N bloques `_1.._10`) | `modalidades` + `equipo.tamano`; un único `POST /inscripciones` con N inscritos |
| Precio por fechas (texto libre en la descripción) | `tarifas[].periodos[]` estructurado |
| `ticket_type_values` | `prueba` + `tarifa.id` |
