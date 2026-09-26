/**
 * Plantillas de los emails a inscritos (acción masiva del panel).
 *
 * La plantilla es texto con variables y bloques; el diseño lo pone la edge
 * function reenviar-comprobantes, que es quien renderiza de verdad (también
 * la vista previa del editor). Aquí solo viven los catálogos que enseña el
 * panel y las tres plantillas de fábrica, iguales a las que siembra
 * 20260923220000_plantillas_email.sql y a las de respaldo de la función:
 * sirven para que el panel funcione aunque la migración no esté aplicada.
 */

export interface PlantillaEmail {
  id?: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  asunto: string;
  titulo: string;
  cuerpo: string;
  etiqueta_mensaje: string | null;
  omitir_uno: boolean;
  es_sistema?: boolean;
  activa?: boolean;
  orden: number;
  asunto_original?: string | null;
  titulo_original?: string | null;
  cuerpo_original?: string | null;
  updated_at?: string;
}

export const PLANTILLAS_BASE: PlantillaEmail[] = [
  {
    clave: "comprobante",
    nombre: "Comprobante de inscripción",
    descripcion: "Sus datos, su dorsal (si lo tiene), el importe pagado y el enlace «Ver mi dorsal». No se manda a las importadas de uno.es salvo que se pida.",
    asunto: "Comprobante de inscripción: {carrera}",
    titulo: "Comprobante de inscripción",
    cuerpo: "Hola {nombre},\n\nTe reenviamos, a petición de la organización, el comprobante de tu inscripción en **{carrera}**.\n\n[[resumen_inscripcion]]\n\n[[boton_mi_dorsal]]\n> Es tu código para la **recogida de dorsales**: enséñalo en el móvil.\n\n[[datos_inscripcion]]\n\n> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.",
    etiqueta_mensaje: null,
    omitir_uno: true,
    orden: 10,
  },
  {
    clave: "dorsal",
    nombre: "Tu dorsal y QR para la recogida",
    descripcion: "El dorsal en grande y el enlace «Ver mi dorsal» con el QR que se escanea en la mesa de recogida. Solo a inscritos con dorsal.",
    asunto: "Tu dorsal {dorsal} para {carrera}",
    titulo: "Tu dorsal para la carrera",
    cuerpo: "Hola {nombre},\n\nYa tienes dorsal para **{carrera}**.\n\n[[tarjeta_dorsal]]\n\n[[boton_mi_dorsal]]\n> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.\n\n[[mensaje]]\n\n> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.",
    etiqueta_mensaje: "Recogida de dorsales",
    omitir_uno: false,
    orden: 20,
  },
  {
    clave: "track",
    nombre: "Camberas Track: instalar y activar el dorsal",
    descripcion: "Enlaces a las tiendas y el botón personal que vincula el dorsal al móvil. Solo recorridos con seguimiento GPS y dorsales GPS generados.",
    asunto: "Sigue {carrera} en directo con Camberas Track",
    titulo: "Sigue la carrera en directo",
    cuerpo: "Hola {nombre},\n\nEn **{carrera}** usamos **Camberas Track**: la organización sabe dónde estás durante la prueba y tu gente puede seguirte en el mapa en directo. Te lo explicamos en pocos pasos:\n\n## 1. Instala Camberas Track en tu móvil\nEs gratis y no pide registro.\n[[botones_tiendas]]\n\n## 2. Activa tu dorsal {dorsal}\nCon la app ya instalada, pulsa este botón **desde ese mismo móvil**: tu dorsal queda vinculado a él. Este enlace es personal, no lo compartas.\n[[boton_activar]]\n\n## 3. En la salida, activa el seguimiento\n- Abre la app y pulsa **ACTIVAR SEGUIMIENTO**. No empieza solo: si no lo pulsas, la organización no te ve.\n- Cuando te pida permiso de ubicación, acéptalo. En iPhone, si te pregunta, elige **Permitir siempre**.\n- En Android, si aparece «Optimización de batería», pulsa **Abrir Ajustes** y marca Camberas Track como **Sin restricciones**.\n- Después bloquea la pantalla y guarda el móvil: la app sigue enviando tu posición.\n\n## 4. Consejos para que no se corte\n- Sal con el móvil **cargado al 100 %** y desactiva el **modo ahorro de energía** mientras dure la prueba.\n- **No cierres la app** desde la lista de apps abiertas.\n- Si te quedas sin cobertura, no pasa nada: la app guarda tus posiciones y las envía en cuanto vuelve la señal.\n- Si el móvil se apaga o se reinicia, abre la app y pulsa otra vez **ACTIVAR SEGUIMIENTO**.\n- Al llegar a meta, para el seguimiento deslizando **DESLIZA PARA DETENER**.\n\n## 5. Que te sigan en directo\nTu familia y tus amigos pueden verte en el mapa mientras tengas el seguimiento activado. Pásales este enlace, no el correo entero: el botón de activar es solo tuyo.\n[[boton_seguir]]\n\n## 6. Si necesitas ayuda\nMantén pulsado **2 segundos** el botón rojo **SOS** de la app: la organización recibe tu aviso y tu posición exacta. **No sustituye al 112**: en una emergencia grave, llama también al 112.\n\n> Sin registro ni datos personales: solo tu dorsal y tu posición durante la carrera.\n\n[[mensaje]]",
    etiqueta_mensaje: "De la organización",
    omitir_uno: false,
    orden: 30,
  },
  {
    clave: "recordatorio_pago",
    nombre: "Recordatorio de pago",
    descripcion: "Para quien empezó la inscripción y no terminó de pagar: enlace para completar el pago donde lo dejó. Solo a pendientes de pago por la pasarela; tras enviarlo, el aviso automático ya no se repite.",
    asunto: "⛰️ ¡Te queda un paso para correr {carrera}!",
    titulo: "¡Estás a un paso de la salida!",
    cuerpo: "¡Hola {nombre}!\n\nEmpezaste tu inscripción en **{carrera}** y solo falta el pago. Tus datos siguen guardados: en un minuto lo tienes hecho.\n\n[[boton_pagar]]\n\n> Tu plaza no queda reservada hasta que pagues, ¡que no se te escape! El importe es el vigente al pagar: si la carrera tiene tramos de precio, puede haber cambiado.\n\n> ¿Ya lo hiciste o has cambiado de planes? No pasa nada: ignora este correo.\n\n[[mensaje]]\n\n## ¡Nos vemos en la línea de salida!",
    etiqueta_mensaje: "De la organización",
    omitir_uno: false,
    orden: 40,
  },
].map((p) => ({ ...p, es_sistema: true, activa: true }));

export const VARIABLES_EMAIL: { clave: string; descripcion: string }[] = [
  { clave: "nombre", descripcion: "Nombre y apellidos del corredor" },
  { clave: "carrera", descripcion: "Nombre de la carrera" },
  { clave: "dorsal", descripcion: "Número de dorsal (la plantilla solo irá a quien lo tenga)" },
  { clave: "recorrido", descripcion: "Recorrido en el que está inscrito" },
  { clave: "fecha", descripcion: "Fecha de la carrera, en largo" },
  { clave: "lugar", descripcion: "Localidad de la carrera" },
  { clave: "importe", descripcion: "Importe (pagado en el comprobante; pendiente en el recordatorio de pago)" },
];

export const BLOQUES_EMAIL: { clave: string; descripcion: string; requisito?: string }[] = [
  { clave: "tarjeta_dorsal", descripcion: "El dorsal en grande, con recorrido, fecha y lugar", requisito: "Solo a inscritos con dorsal" },
  { clave: "boton_mi_dorsal", descripcion: "Botón «Ver mi dorsal»: la página con el QR para la mesa de recogida" },
  { clave: "resumen_inscripcion", descripcion: "Tabla del comprobante: carrera, recorrido, fecha, estado, importe y referencia" },
  { clave: "datos_inscripcion", descripcion: "Datos de su inscripción: documento, club, talla y preguntas de la carrera" },
  { clave: "botones_tiendas", descripcion: "Botones de App Store y Google Play de Camberas Track" },
  { clave: "boton_activar", descripcion: "Botón personal «Activar mi dorsal» en Camberas Track", requisito: "Solo recorridos con GPS y dorsal GPS generado" },
  { clave: "boton_seguir", descripcion: "Botón «Ver mi posición en directo» y el enlace para compartir: el mapa de la carrera siguiendo a ese dorsal", requisito: "Solo a inscritos con dorsal" },
  { clave: "boton_pagar", descripcion: "Botón «Completar el pago», con el importe pendiente", requisito: "Solo a pendientes de pago por la pasarela" },
  { clave: "mensaje", descripcion: "El texto que escribas al enviar; si lo dejas vacío, no aparece" },
];

/** El mismo patrón que la función: un bloque es [[nombre]] SOLO en su línea */
const BLOQUE_EN_LINEA = /^\[\[([^\]]*)\]\]$/;
const lineas = (texto: string) => texto.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());

/** Longitud máxima de una línea (la función no da formato a las más largas) */
export const MAX_LINEA = 2000;

/** Bloques [[...]] del texto que no existen: el editor avisa antes de guardar */
export function bloquesDesconocidos(cuerpo: string): string[] {
  const validos = new Set(BLOQUES_EMAIL.map((b) => b.clave));
  const vistos = new Set<string>();
  for (const l of lineas(cuerpo)) {
    const m = l.match(BLOQUE_EN_LINEA);
    if (m && !validos.has(m[1].trim())) vistos.add(l);
  }
  return [...vistos];
}

/**
 * Bloques metidos en una línea con más texto ("Pulsa [[boton_mi_dorsal]]"):
 * la función solo los pinta si van solos, así que llegarían literales
 */
export function bloquesFueraDeLinea(cuerpo: string): string[] {
  const vistos = new Set<string>();
  for (const l of lineas(cuerpo)) {
    if (l.includes("[[") && !BLOQUE_EN_LINEA.test(l)) {
      for (const m of l.matchAll(/\[\[[^\]\n]*\]\]/g)) vistos.add(m[0]);
    }
  }
  return [...vistos];
}

/** ¿Es un recordatorio de pago? (usa el bloque [[boton_pagar]]) */
export const usaBotonPagar = (p: Pick<PlantillaEmail, "cuerpo">) =>
  lineas(p.cuerpo).some((l) => l.match(BLOQUE_EN_LINEA)?.[1].trim() === "boton_pagar");

/** Líneas más largas de lo que la función formatea */
export const lineasLargas = (cuerpo: string) => lineas(cuerpo).filter((l) => l.length > MAX_LINEA).length;

/** Variables {...} que no existen (se quedarían tal cual en el email) */
export function variablesDesconocidas(texto: string): string[] {
  const validas = new Set(VARIABLES_EMAIL.map((v) => v.clave));
  const vistas = new Set<string>();
  // {Nombre}, { dorsal } o {DORSAL} se quedarían tal cual en el email: la
  // función solo sustituye la forma exacta, en minúsculas y sin espacios
  for (const m of texto.matchAll(/\{([^{}\n]{1,40})\}/g)) {
    if (!validas.has(m[1])) vistas.add(m[0]);
  }
  return [...vistas];
}

/** ¿Pide la plantilla un texto al enviar? (usa el bloque [[mensaje]]) */
export const usaMensaje = (p: Pick<PlantillaEmail, "cuerpo">) =>
  lineas(p.cuerpo).some((l) => l.match(BLOQUE_EN_LINEA)?.[1].trim() === "mensaje");

/** Clave para una plantilla nueva a partir de su nombre: "Info día de carrera" → "info-dia-de-carrera" */
export function claveDesdeNombre(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base.length >= 2 ? base : `plantilla-${base || "nueva"}`;
}
