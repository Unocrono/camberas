// Reenvía por email el comprobante de inscripción de las inscripciones que el
// gestor selecciona en el panel (acción masiva "Reenviar comprobante").
//
// Por qué una función nueva y no reutilizar las que hay:
//  - send-payment-confirmation es interna del webhook de Redsys: solo acepta
//    la clave de servicio, recibe el contenido ya montado y además manda copia
//    al organizador (un reenvío masivo le llenaría el buzón).
//  - send-registration-confirmation dice siempre "pago pendiente" y acepta
//    cualquier destinatario: no sirve de comprobante.
// Aquí todo se lee de la base de datos en el servidor: del navegador solo
// llegan los ids. Ni el email ni el importe se aceptan del cliente.
//
// Quién puede: admin, o el organizador de TODAS las carreras de las
// inscripciones pedidas. Si falla una, no se manda nada.
//
// Qué se manda y qué no:
//  - pagada (paid) → comprobante con importe (si se conoce) y referencia.
//  - gratuita (not_required) y confirmada → comprobante sin bloque de pago.
//  - pendiente de pago, gratuita sin confirmar, cancelada o reembolsada →
//    no hay comprobante que mandar: se omite y se dice por qué.
//  - importada de uno.es (EventBooking) → se omite salvo que se pida: uno.es
//    ya les mandó el suyo.
//  - sin email → se omite. El email sale de la inscripción; si está vacío
//    (las inscripciones hechas con cuenta se guardan sin él), del usuario o
//    de su perfil.
//
// Los datos del corredor (nombre, DNI, club, talla) salen de las columnas de
// la inscripción, que son las que corrige el panel; de las respuestas del
// formulario solo se enseñan las preguntas propias de la carrera.
//
// dryRun: devuelve lo mismo sin mandar nada, para que el panel enseñe el
// recuento antes de confirmar. No escribe en la base de datos en ningún caso.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paleta Camberas (docs/paleta-camberas.md)
const VERDE = "#235940";
const CREMA = "#FAF6EC";
const NARANJA = "#EC7C2B";
const ARENA = "#FCEBD6";
const TINTA = "#0E2419";
const COLINA_OSCURA = "#1E5B38";

// Cabecera ilustrada (cielo arena, sol y las tres colinas de la casa). Imagen
// servida desde la web: las formas dibujadas con HTML no se ven igual en todos
// los correos; si se bloquean las imágenes queda la franja arena con el nombre.
const CABECERA = `${(globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("SITE_URL") ?? "https://camberas.com"}/email/cabecera-colinas.png`;

// Tope por llamada: con la pausa entre envíos, 50 caben de sobra en el
// tiempo máximo de una función. El panel trocea selecciones mayores.
const MAX_POR_LLAMADA = 50;
// Resend admite unas 2 peticiones por segundo por defecto
const PAUSA_MS = 550;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Respuestas por consulta: 10 inscripciones × ~25 respuestas queda muy por
// debajo del tope de 1000 filas de PostgREST, que corta sin avisar
const RESPUESTAS_POR_CONSULTA = 10;

// Campos que el panel corrige en las columnas de la inscripción y NO en
// registration_responses: su respuesta guardada puede estar desfasada (el
// organizador arregla un DNI y la respuesta sigue con el viejo). En el
// comprobante esos datos salen de la inscripción, nunca de las respuestas.
const CAMPOS_DE_LA_INSCRIPCION = new Set([
  "first_name", "last_name", "email", "phone", "document_number", "dni_passport",
  "birth_date", "gender", "gender_id", "category", "race_category_id", "tshirt_size",
  "address", "city", "province", "country", "autonomous_community", "club", "team",
]);

// Qué variante de datos lleva el email: comprobante de pagada o de gratuita,
// o recordatorio de una pendiente de pago
type Plantilla = "pagada" | "gratuita" | "pendiente";
// Qué email se manda lo decide una PLANTILLA (tabla plantillas_email, la
// edita el admin): texto con variables y bloques; el diseño lo pone esta
// función. Ver 20260923220000_plantillas_email.sql.
interface PlantillaEmail {
  clave: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  etiqueta_mensaje: string | null;
  omitir_uno: boolean;
}
type Motivo =
  | "cancelada"
  | "reembolsada"
  | "pendiente_de_pago"
  | "pendiente_de_confirmar"
  | "importada_de_uno_es"
  | "sin_email"
  | "sin_dorsal"
  | "sin_gps_en_recorrido"
  | "sin_dorsal_gps"
  // Recordatorio de pago ([[boton_pagar]])
  | "no_pendiente_de_pago"
  | "pago_fuera_de_pasarela"
  | "de_equipo"
  | "inscripciones_cerradas"
  | "recorrido_completo"
  | "sin_enlace_de_pago"
  | "ya_pagada"
  | "ya_inscrita_por_otra_fila"
  | "avisada_hace_poco"
  | "confirmada_sin_pago"
  | "estado_desconocido";

interface Resultado {
  registrationId: string;
  resultado: "enviado" | "se_enviaria" | "omitido" | "fallido";
  plantilla?: Plantilla;
  motivo?: Motivo;
  email?: string;
  error?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** 1.174,50 € (useGrouping explícito: no todos los runtimes agrupan) */
const euros = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) + " €";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Casillas del formulario: "true"/"false" se leen mejor como Sí/No */
const valorLegible = (v: string) => (v === "true" ? "Sí" : v === "false" ? "No" : v);

function fila(etiqueta: string, valor: string, destacado = false): string {
  return `<tr>
    <td style="padding: 6px 0; color: #4b5563; vertical-align: top;">${esc(etiqueta)}</td>
    <td style="padding: 6px 0 6px 12px; color: ${destacado ? VERDE : "#1f2937"}; text-align: right;${
      destacado ? " font-weight: bold;" : ""
    }">${esc(valor)}</td>
  </tr>`;
}

interface Datos {
  plantilla: Plantilla;
  /** Texto libre de la organización (lugar y horario de recogida, avisos) */
  mensaje: string | null;
  /** Título del recuadro del mensaje (de la plantilla) */
  etiquetaMensaje: string | null;
  /** Track: enlace de activación del dorsal en la app (gps_tokens) */
  activacionUrl: string | null;
  /** Recordatorio: enlace de retomar-pago (token de recuperacion_pagos) */
  pagoUrl: string | null;
  nombre: string | null;
  carrera: string;
  fecha: string | null;
  lugar: string | null;
  recorrido: string | null;
  dorsal: number | null;
  importe: number | null;
  referencia: string | null;
  miDorsalUrl: string | null;
  /** Mapa público en directo centrado en este dorsal (para familia y amigos) */
  seguirUrl: string | null;
  /** Datos de la inscripción (columnas, al día) + preguntas propias de la carrera */
  respuestas: { label: string; value: string }[];
}

const APP_STORE = "https://apps.apple.com/es/app/camberas-track/id6792264406";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.unocrono.camberastrack";

// Plantillas de fábrica: los MISMOS textos que siembra la migración
// 20260923220000_plantillas_email.sql. Se usan si la tabla aún no existe o si
// falta la fila de una de sistema; así el envío nunca depende de la migración.
const PLANTILLAS_BASE: Record<string, PlantillaEmail> = {
  recordatorio_pago: {
    clave: "recordatorio_pago",
    asunto: "⛰️ ¡Te queda un paso para correr {carrera}!",
    titulo: "¡Estás a un paso de la salida!",
    cuerpo: "¡Hola {nombre}!\n\nEmpezaste tu inscripción en **{carrera}** y solo falta el pago. Tus datos siguen guardados: en un minuto lo tienes hecho.\n\n[[boton_pagar]]\n\n> Tu plaza no queda reservada hasta que pagues, ¡que no se te escape! El importe es el vigente al pagar: si la carrera tiene tramos de precio, puede haber cambiado.\n\n> ¿Ya lo hiciste o has cambiado de planes? No pasa nada: ignora este correo.\n\n[[mensaje]]\n\n## ¡Nos vemos en la línea de salida!",
    etiqueta_mensaje: "De la organización",
    omitir_uno: false,
  },
  comprobante: {
    clave: "comprobante",
    asunto: "Comprobante de inscripción: {carrera}",
    titulo: "Comprobante de inscripción",
    cuerpo: "Hola {nombre},\n\nTe reenviamos, a petición de la organización, el comprobante de tu inscripción en **{carrera}**.\n\n[[resumen_inscripcion]]\n\n[[boton_mi_dorsal]]\n> Es tu código para la **recogida de dorsales**: enséñalo en el móvil.\n\n[[datos_inscripcion]]\n\n> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.",
    etiqueta_mensaje: null,
    omitir_uno: true,
  },
  dorsal: {
    clave: "dorsal",
    asunto: "Tu dorsal {dorsal} para {carrera}",
    titulo: "Tu dorsal para la carrera",
    cuerpo: "Hola {nombre},\n\nYa tienes dorsal para **{carrera}**.\n\n[[tarjeta_dorsal]]\n\n[[boton_mi_dorsal]]\n> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.\n\n[[mensaje]]\n\n> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.",
    etiqueta_mensaje: "Recogida de dorsales",
    omitir_uno: false,
  },
  track: {
    clave: "track",
    asunto: "Sigue {carrera} en directo con Camberas Track",
    titulo: "Sigue la carrera en directo",
    cuerpo: "Hola {nombre},\n\nEn **{carrera}** usamos **Camberas Track**: la organización sabe dónde estás durante la prueba y tu gente puede seguirte en el mapa en directo. Te lo explicamos en pocos pasos:\n\n## 1. Instala Camberas Track en tu móvil\nEs gratis y no pide registro.\n[[botones_tiendas]]\n\n## 2. Activa tu dorsal {dorsal}\nCon la app ya instalada, pulsa este botón **desde ese mismo móvil**: tu dorsal queda vinculado a él. Este enlace es personal, no lo compartas.\n[[boton_activar]]\n\n## 3. En la salida, activa el seguimiento\n- Abre la app y pulsa **ACTIVAR SEGUIMIENTO**. No empieza solo: si no lo pulsas, la organización no te ve.\n- Cuando te pida permiso de ubicación, acéptalo. En iPhone, si te pregunta, elige **Permitir siempre**.\n- En Android, si aparece «Optimización de batería», pulsa **Abrir Ajustes** y marca Camberas Track como **Sin restricciones**.\n- Después bloquea la pantalla y guarda el móvil: la app sigue enviando tu posición.\n\n## 4. Consejos para que no se corte\n- Sal con el móvil **cargado al 100 %** y desactiva el **modo ahorro de energía** mientras dure la prueba.\n- **No cierres la app** desde la lista de apps abiertas.\n- Si te quedas sin cobertura, no pasa nada: la app guarda tus posiciones y las envía en cuanto vuelve la señal.\n- Si el móvil se apaga o se reinicia, abre la app y pulsa otra vez **ACTIVAR SEGUIMIENTO**.\n- Al llegar a meta, para el seguimiento deslizando **DESLIZA PARA DETENER**.\n\n## 5. Que te sigan en directo\nTu familia y tus amigos pueden verte en el mapa mientras tengas el seguimiento activado. Pásales este enlace, no el correo entero: el botón de activar es solo tuyo.\n[[boton_seguir]]\n\n## 6. Si necesitas ayuda\nMantén pulsado **2 segundos** el botón rojo **SOS** de la app: la organización recibe tu aviso y tu posición exacta. **No sustituye al 112**: en una emergencia grave, llama también al 112.\n\n> Sin registro ni datos personales: solo tu dorsal y tu posición durante la carrera.\n\n[[mensaje]]",
    etiqueta_mensaje: "De la organización",
    omitir_uno: false,
  },
};

/** Un bloque [[nombre]] solo en su línea (sin \s* solapados: sin retroceso) */
const BLOQUE_EN_LINEA = /^\[\[([^\]]*)\]\]$/;
/** Longitud máxima de una línea con formato; el editor rechaza las más largas */
const MAX_LINEA = 2000;

const ESTILO_P = "color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 16px;";
const ESTILO_NOTA = "color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 16px;";
const ESTILO_LISTA = "color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 16px; padding-left: 22px;";

function variables(d: Datos): Record<string, string> {
  return {
    nombre: d.nombre ?? "",
    carrera: d.carrera,
    dorsal: d.dorsal != null ? String(d.dorsal) : "",
    recorrido: d.recorrido ?? "",
    fecha: d.fecha ? fechaLarga(d.fecha) : "",
    lugar: d.lugar ?? "",
    importe: d.importe != null ? euros(d.importe) : "",
  };
}

/** {variable} → su valor; las que no existen se quedan tal cual */
const sustituir = (texto: string, vars: Record<string, string>, escapar: boolean) =>
  texto.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? (escapar ? esc(vars[k]) : vars[k]) : m));

/** "Hola ," cuando falta el nombre → "Hola,"; y sin dobles espacios */
const limpiar = (s: string) => s.replace(/[ \t]+([,.;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

/**
 * Una línea de texto de la plantilla a HTML. Primero se escapa el texto del
 * admin, luego el formato (**negrita**, [texto](https://...)) y al final las
 * variables, ya escapadas: un nombre con asteriscos o corchetes no se
 * convierte en formato ni en enlace.
 */
function enLinea(texto: string, vars: Record<string, string>): string {
  // Una línea desmesurada (el editor no deja guardarla, pero la vista previa
  // la recibe tal cual) va sin formato: las regex de formato y de limpieza
  // son cuadráticas y no deben poder colgar la función
  if (texto.length > MAX_LINEA) return sustituir(esc(texto), vars, true);
  let h = esc(texto);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, t, url) => `<a href="${url}" style="color: ${VERDE}; font-weight: bold;">${t}</a>`,
  );
  return limpiar(sustituir(h, vars, true));
}

const boton = (href: string, texto: string) =>
  `<div style="text-align: center; margin: 24px 0 12px;">
    <a href="${esc(href)}"
       style="display: inline-block; background: ${NARANJA}; color: #ffffff; text-decoration: none;
              padding: 16px 34px; border-radius: 30px; font-size: 17px; font-weight: bold;">${esc(texto)}</a>
  </div>`;

const tienda = (href: string, texto: string) =>
  `<a href="${href}" style="display: inline-block; background: #1f2937; color: #ffffff; text-decoration: none;
      padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: bold; margin: 6px 8px 6px 0;">${texto}</a>`;

/** "## 1. Instala la app" → círculo verde con el número; "## Título" → subtítulo */
function subtitulo(texto: string, vars: Record<string, string>): string {
  const m = texto.match(/^(\d{1,2})\.\s+(.*)$/);
  if (!m) {
    return `<p style="margin: 24px 0 8px; color: #1f2937; font-size: 17px; font-weight: bold;">${enLinea(texto, vars)}</p>`;
  }
  return `<table style="width: 100%; border-collapse: collapse; margin: 24px 0 6px;"><tr>
    <td style="width: 34px; vertical-align: middle;">
      <div style="width: 34px; height: 34px; border-radius: 17px; background: ${VERDE}; color: ${CREMA};
                  font-weight: bold; font-size: 16px; text-align: center; line-height: 34px;">${m[1]}</div>
    </td>
    <td style="vertical-align: middle; padding-left: 12px; color: #1f2937; font-size: 16px; font-weight: bold;">${enLinea(m[2], vars)}</td>
  </tr></table>`;
}

/** Los bloques [[...]]: piezas de diseño que el admin coloca, no escribe */
function bloque(nombre: string, d: Datos, vistaPrevia: boolean): string {
  switch (nombre) {
    case "tarjeta_dorsal": {
      const linea = [d.recorrido, d.fecha ? fechaLarga(d.fecha) : null, d.lugar]
        .filter((x): x is string => !!x)
        .map((x) => esc(x))
        .join(" · ");
      return `<div style="background: ${VERDE}; color: ${CREMA}; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85;">Dorsal</p>
        <p style="margin: 6px 0 0; font-size: 56px; font-weight: bold; line-height: 1;">${d.dorsal ?? "—"}</p>
        ${linea ? `<p style="margin: 12px 0 0; font-size: 13px; opacity: 0.9;">${linea}</p>` : ""}
      </div>`;
    }
    case "boton_mi_dorsal":
      return d.miDorsalUrl ? boton(d.miDorsalUrl, "Ver mi dorsal") : "";
    case "resumen_inscripcion": {
      const estado = d.plantilla === "pagada" ? "Pagada" : "Confirmada (inscripción gratuita)";
      const filas = [
        d.nombre ? fila("Corredor/a", d.nombre) : "",
        d.dorsal != null ? fila("Dorsal", String(d.dorsal), true) : "",
        fila("Carrera", d.carrera),
        d.recorrido ? fila("Recorrido", d.recorrido) : "",
        d.fecha ? fila("Fecha", fechaLarga(d.fecha)) : "",
        d.lugar ? fila("Lugar", d.lugar) : "",
        fila("Estado", estado),
        d.plantilla === "pagada" && d.importe != null ? fila("Importe pagado", euros(d.importe), true) : "",
        d.plantilla === "pagada" && d.referencia ? fila("Referencia de pago", d.referencia) : "",
      ].join("");
      return `<div style="background: ${CREMA}; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 18px 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">${filas}</table>
      </div>`;
    }
    case "datos_inscripcion":
      return d.respuestas.length
        ? `<div style="background: #f9fafb; border-left: 4px solid #9ca3af; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
            <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 15px;">Datos de tu inscripción</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${d.respuestas.map((r) => fila(r.label, valorLegible(r.value))).join("")}
            </table>
          </div>`
        : "";
    case "botones_tiendas":
      return `<p style="margin: 4px 0 16px;">${tienda(APP_STORE, "App Store (iPhone)")}${tienda(PLAY_STORE, "Google Play (Android)")}</p>`;
    case "boton_activar":
      return d.activacionUrl ? boton(d.activacionUrl, `Activar mi dorsal ${d.dorsal ?? ""}`.trim()) : "";
    case "boton_seguir":
      // El enlace va también en texto: se comparte SOLO el mapa, sin reenviar
      // el correo (que lleva el enlace personal de activación)
      return d.seguirUrl
        ? `${boton(d.seguirUrl, "Ver mi posición en directo")}
          <p style="text-align: center; margin: -8px 0 20px; color: #6b7280; font-size: 13px; line-height: 1.5;">
            Copia este enlace y pásaselo a quien quieras:<br>
            <a href="${esc(d.seguirUrl)}" style="color: ${VERDE}; word-break: break-all;">${esc(d.seguirUrl)}</a>
          </p>`
        : "";
    case "boton_pagar":
      return d.pagoUrl
        ? `${d.importe != null
            ? `<p style="text-align: center; margin: 20px 0 0; color: #4b5563; font-size: 15px;">Te falta pagar <strong style="color: ${VERDE}; font-size: 18px;">${euros(d.importe)}</strong></p>`
            : ""}${boton(d.pagoUrl, "¡Completar mi inscripción!")}`
        : "";
    case "mensaje":
      return d.mensaje
        ? `<div style="background: #f9fafb; border-left: 4px solid ${VERDE}; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
            <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 15px;">${esc(d.etiquetaMensaje || "De la organización")}</h3>
            <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">${esc(d.mensaje).replace(/\n/g, "<br>")}</p>
          </div>`
        : "";
    default:
      // Un bloque que no existe no llega nunca a un corredor; en la vista
      // previa se enseña en rojo para que el admin vea la errata
      return vistaPrevia
        ? `<p style="color: #b91c1c; font-size: 13px; font-weight: bold; margin: 0 0 16px;">[[${esc(nombre)}]] — este bloque no existe</p>`
        : "";
  }
}

function envoltorio(titulo: string, interior: string): string {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: ${ARENA}; padding: 24px 30px 6px; text-align: center;">
      <h1 style="color: ${TINTA}; margin: 0; font-size: 28px; letter-spacing: 0.5px;">Camberas</h1>
      <p style="color: ${COLINA_OSCURA}; margin: 6px 0 0; font-size: 13px;">Carreras de trail y montaña</p>
    </div>
    <img src="${CABECERA}" width="600" alt=""
         style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; background: ${ARENA};">
    <div style="padding: 32px 30px 36px;">
      <h2 style="color: ${TINTA}; margin: 0 0 16px; font-size: 24px;">${esc(titulo)}</h2>
      ${interior}
    </div>
    <div style="background: ${CREMA}; padding: 18px 30px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Inscripción gestionada con <strong>camberas.com</strong>
      </p>
    </div>
  </div>`;
}

/**
 * El cuerpo de la plantilla a HTML, línea a línea:
 *   [[bloque]] sola en su línea · "## " subtítulo · "> " nota pequeña ·
 *   "- " lista · línea en blanco = párrafo nuevo · resto = texto (las líneas
 *   seguidas se unen con salto de línea).
 */
function renderCuerpo(p: PlantillaEmail, d: Datos, vistaPrevia = false): string {
  const vars = variables(d);
  const out: string[] = [];
  let parrafo: string[] = [];
  let nota: string[] = [];
  let lista: string[] = [];
  const cerrar = () => {
    if (parrafo.length) out.push(`<p style="${ESTILO_P}">${parrafo.map((l) => enLinea(l, vars)).join("<br>")}</p>`);
    if (nota.length) out.push(`<p style="${ESTILO_NOTA}">${nota.map((l) => enLinea(l, vars)).join("<br>")}</p>`);
    if (lista.length) out.push(`<ul style="${ESTILO_LISTA}">${lista.map((l) => `<li>${enLinea(l, vars)}</li>`).join("")}</ul>`);
    parrafo = [];
    nota = [];
    lista = [];
  };
  for (const cruda of p.cuerpo.replace(/\r\n?/g, "\n").split("\n")) {
    const linea = cruda.trim();
    if (!linea) { cerrar(); continue; }
    const b = linea.match(BLOQUE_EN_LINEA);
    if (b) { cerrar(); out.push(bloque(b[1].trim(), d, vistaPrevia)); continue; }
    if (linea.startsWith("## ")) { cerrar(); out.push(subtitulo(linea.slice(3).trim(), vars)); continue; }
    if (linea.startsWith("> ")) { if (parrafo.length || lista.length) cerrar(); nota.push(linea.slice(2)); continue; }
    if (linea.startsWith("- ")) { if (parrafo.length || nota.length) cerrar(); lista.push(linea.slice(2)); continue; }
    if (nota.length || lista.length) cerrar();
    parrafo.push(linea);
  }
  cerrar();
  return envoltorio(limpiar(sustituir(p.titulo, vars, false)), out.join("\n"));
}

const renderAsunto = (p: PlantillaEmail, d: Datos) =>
  limpiar(sustituir(p.asunto, variables(d), false).replace(/\s+/g, " "));

/** Lo que exige la plantilla según lo que usa */
function requisitos(p: PlantillaEmail) {
  // Los mismos bloques que pinta renderCuerpo: solo los que van solos en su línea
  const bloques = new Set(
    p.cuerpo
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trim().match(BLOQUE_EN_LINEA)?.[1].trim())
      .filter((x): x is string => !!x),
  );
  const track = bloques.has("boton_activar");
  // Recordatorio de pago: el destinatario es justo el que las demás omiten
  const pago = bloques.has("boton_pagar");
  const dorsal =
    track ||
    bloques.has("tarjeta_dorsal") ||
    bloques.has("boton_seguir") ||
    `${p.asunto}\n${p.titulo}\n${p.cuerpo}`.includes("{dorsal}");
  return { dorsal, track, pago };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://camberas.com";
    const service = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Quién llama ────────────────────────────────────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await service.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;

    // ── Qué pide ───────────────────────────────────────────────────────────
    let body: {
      registrationIds?: unknown;
      dryRun?: unknown;
      incluirExternas?: unknown;
      plantilla?: unknown;
      mensaje?: unknown;
      vistaPrevia?: unknown;
    } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Cuerpo de la petición no válido" }, 400);
    }
    const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim().slice(0, 1500) : "";

    // ── Vista previa del editor de plantillas: datos de ejemplo, no se
    //    envía nada ni se lee ninguna inscripción ──────────────────────────
    if (body.vistaPrevia && typeof body.vistaPrevia === "object") {
      const { data: rolesVp } = await service.from("user_roles").select("role").eq("user_id", uid);
      const puede = (rolesVp ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "organizer");
      if (!puede) return json({ error: "Sin permiso" }, 403);
      const vp = body.vistaPrevia as Record<string, unknown>;
      const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
      const plantillaVp: PlantillaEmail = {
        clave: "vista-previa",
        asunto: texto(vp.asunto, 200),
        titulo: texto(vp.titulo, 200),
        cuerpo: texto(vp.cuerpo, 20000),
        etiqueta_mensaje: texto(vp.etiqueta_mensaje, 80) || null,
        omitir_uno: false,
      };
      const cero = "00000000-0000-0000-0000-000000000000";
      const muestra: Datos = {
        plantilla: "pagada",
        mensaje: mensaje || "Aquí aparece el texto que escribas al enviar.",
        etiquetaMensaje: plantillaVp.etiqueta_mensaje,
        activacionUrl: `${SITE_URL}/activar.html?t=${cero}`,
        pagoUrl: `${SITE_URL}/retomar-pago/${cero}`,
        nombre: "Nombre Apellido",
        carrera: "Carrera de ejemplo",
        fecha: new Date().toISOString().slice(0, 10),
        lugar: "Localidad",
        recorrido: "Trail 21K",
        dorsal: 123,
        importe: 25,
        referencia: "260923123456",
        miDorsalUrl: `${SITE_URL}/mi-dorsal/${cero}`,
        seguirUrl: `${SITE_URL}/carrera-de-ejemplo/gps?dorsal=123`,
        respuestas: [
          { label: "Documento", value: "12345678Z" },
          { label: "Club", value: "Club de ejemplo" },
          { label: "Talla de camiseta", value: "M" },
        ],
      };
      return json({
        asunto: renderAsunto(plantillaVp, muestra),
        html: renderCuerpo(plantillaVp, muestra, true),
        requisitos: requisitos(plantillaVp),
      });
    }
    const ids = Array.isArray(body.registrationIds)
      ? [...new Set(body.registrationIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))]
      : [];
    if (ids.length === 0) return json({ error: "No hay inscripciones que reenviar" }, 400);
    if (ids.length > MAX_POR_LLAMADA) {
      return json({ error: `Como mucho ${MAX_POR_LLAMADA} inscripciones por llamada` }, 400);
    }
    const dryRun = body.dryRun === true;
    const incluirExternas = body.incluirExternas === true;

    // ── La plantilla, por su clave. Si la tabla aún no existe (migración sin
    //    aplicar) o falta una de sistema, la de fábrica; una desactivada no
    //    se manda. ──────────────────────────────────────────────────────────
    const clave = typeof body.plantilla === "string" && body.plantilla.trim() ? body.plantilla.trim() : "comprobante";
    let plantillaEmail: PlantillaEmail | null = null;
    {
      const { data: fila, error: errPlantilla } = await service
        .from("plantillas_email")
        .select("clave, asunto, titulo, cuerpo, etiqueta_mensaje, omitir_uno, activa")
        .eq("clave", clave)
        .maybeSingle();
      const sinTabla =
        !!errPlantilla &&
        (errPlantilla.code === "42P01" ||
          errPlantilla.code === "PGRST205" ||
          /does not exist|could not find the table/i.test(errPlantilla.message ?? ""));
      if (errPlantilla && !sinTabla) {
        // Un fallo pasajero NO debe mandar el texto de fábrica en lugar del
        // editado: el lote falla y el panel lo deja para reintentar
        throw new Error(`plantillas_email: ${errPlantilla.message}`);
      }
      if (sinTabla || !fila) {
        plantillaEmail = PLANTILLAS_BASE[clave] ?? null;
      } else if (fila.activa) {
        plantillaEmail = {
          clave: fila.clave,
          asunto: fila.asunto,
          titulo: fila.titulo,
          cuerpo: fila.cuerpo,
          etiqueta_mensaje: fila.etiqueta_mensaje,
          omitir_uno: fila.omitir_uno === true,
        };
      }
    }
    if (!plantillaEmail) return json({ error: `La plantilla «${clave}» no existe o está desactivada` }, 400);
    const pide = requisitos(plantillaEmail);
    // El recordatorio sin [[boton_pagar]] no se manda: en modo normal su "no
    // tienes plaza" llegaría a quien ya pagó, y en modo pago saldría sin
    // enlace y callaría al robot (el editor también exige el bloque)
    if (plantillaEmail.clave === "recordatorio_pago" && !pide.pago) {
      return json(
        { error: "El recordatorio de pago ha perdido el bloque [[boton_pagar]]: restaura su texto original en Plantillas de email" },
        400,
      );
    }

    // ── Las inscripciones y el permiso sobre sus carreras ─────────────────
    const { data: regs, error: regsErr } = await service
      .from("registrations")
      .select(
        "id, race_id, race_distance_id, user_id, team_id, email, first_name, last_name, bib_number, " +
          "status, payment_status, source, importe_manual, token_inscripcion, dni_passport, club, tshirt_size",
      )
      .in("id", ids);
    if (regsErr) throw new Error(`registrations: ${regsErr.message}`);
    if (!regs || regs.length !== ids.length) {
      return json({ error: "Alguna de las inscripciones no existe" }, 404);
    }

    const raceIds = [...new Set(regs.map((r: any) => r.race_id as string))];
    const [{ data: roles }, { data: races, error: racesErr }] = await Promise.all([
      service.from("user_roles").select("role").eq("user_id", uid),
      service.from("races").select("id, name, date, location, organizer_id, slug").in("id", raceIds),
    ]);
    if (racesErr) throw new Error(`races: ${racesErr.message}`);
    const esAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!esAdmin && (races ?? []).some((ra: any) => ra.organizer_id !== uid)) {
      return json({ error: "Sin permiso sobre alguna de las carreras" }, 403);
    }
    const carreraPorId = new Map((races ?? []).map((ra: any) => [ra.id, ra]));

    // ── Todo lo demás, en bloque ──────────────────────────────────────────
    const distanceIds = [...new Set(regs.map((r: any) => r.race_distance_id as string).filter(Boolean))];
    const userIds = [...new Set(regs.map((r: any) => r.user_id as string | null).filter(Boolean))] as string[];

    const lotesRespuestas: string[][] = [];
    for (let i = 0; i < ids.length; i += RESPUESTAS_POR_CONSULTA) {
      lotesRespuestas.push(ids.slice(i, i + RESPUESTAS_POR_CONSULTA));
    }

    // Un fallo de lectura para el envío entero: mejor no mandar nada que
    // mandar comprobantes sin importe o sin datos
    const leer = async <T>(nombre: string, consulta: PromiseLike<{ data: T[] | null; error: any }>) => {
      const { data, error } = await consulta;
      if (error) throw new Error(`${nombre}: ${error.message}`);
      return data ?? [];
    };

    const [distancias, perfiles, respuestasPorLote, intents, items] = await Promise.all([
      leer<any>("race_distances", service.from("race_distances").select("id, name, gps_tracking_enabled, registration_closes").in("id", distanceIds)),
      userIds.length
        ? leer<any>("profiles", service.from("profiles").select("id, email, first_name, last_name").in("id", userIds))
        : Promise.resolve([] as any[]),
      Promise.all(
        lotesRespuestas.map((lote) =>
          leer<any>(
            "registration_responses",
            service
              .from("registration_responses")
              .select(
                "registration_id, field_value, registration_form_fields(field_name, field_label, field_order, " +
                  "is_system_field, is_visible, race_distance_id)",
              )
              .in("registration_id", lote),
          )
        ),
      ),
      // Pago individual: el último intento completado
      leer<any>(
        "payment_intents",
        service
          .from("payment_intents")
          .select("registration_id, amount, order_number, completed_at")
          .in("registration_id", ids)
          .eq("status", "completed")
          .order("completed_at", { ascending: false }),
      ),
      // Pago de equipo: el capitán paga el lote y cada inscripción tiene su parte
      leer<any>(
        "payment_intent_items",
        service
          .from("payment_intent_items")
          .select("registration_id, amount, payment_intents!inner(order_number, status, completed_at)")
          .in("registration_id", ids)
          .eq("payment_intents.status", "completed"),
      ),
    ]);
    const respuestas = respuestasPorLote.flat();

    const nombreDistancia = new Map(distancias.map((d: any) => [d.id, d.name as string]));
    const gpsEnRecorrido = new Map(distancias.map((d: any) => [d.id, d.gps_tracking_enabled === true]));

    // Track: el enlace de activación de cada dorsal es el token GPS activo de
    // ese evento + dorsal (los crea el panel en "Dorsales GPS (QR)")
    const activacionPorDorsal = new Map<string, string>();
    if (pide.track && distanceIds.length) {
      const toks = await leer<any>(
        "gps_tokens",
        service.from("gps_tokens").select("event_id, bib_number, token, active").in("event_id", distanceIds).eq("active", true),
      );
      for (const t of toks) {
        activacionPorDorsal.set(`${t.event_id}|${String(t.bib_number ?? "").trim()}`, `${SITE_URL}/activar.html?t=${t.token}`);
      }
    }
    const perfilPorId = new Map(perfiles.map((p: any) => [p.id, p]));

    // Recordatorio de pago: plazo, plazas e importe pendiente. Mismas reglas
    // que token_recuperacion_inscripcion (cierre = registration_closes o, si
    // no hay, el día de la carrera) y que el robot (plazas_libres, último
    // intento de pago). Solo lectura: el ensayo no escribe nada.
    const cierreDe = new Map(distancias.map((d: any) => [d.id, (d.registration_closes as string | null) ?? null]));
    const libresDe = new Map<string, number | null>();
    const importePendiente = new Map<string, number>();
    if (pide.pago) {
      for (const dId of distanceIds) {
        const { data: libres, error: errLibres } = await service.rpc("plazas_libres", { p_distance_id: dId });
        if (errLibres) throw new Error(`plazas_libres: ${errLibres.message}`);
        libresDe.set(dId, libres == null ? null : Number(libres));
      }
      const pis = await leer<any>(
        "payment_intents",
        service.from("payment_intents").select("registration_id, amount, created_at").in("registration_id", ids)
          .order("created_at", { ascending: false }),
      );
      for (const pi of pis) {
        if (!importePendiente.has(pi.registration_id) && pi.amount != null) {
          importePendiente.set(pi.registration_id, Number(pi.amount));
        }
      }
    }
    // Quien ya está dentro de la carrera por OTRA fila pagada o gratuita (la
    // misma regla que el robot, en SQL: inscripcion_ya_dentro), y cuándo se
    // le avisó por última vez (robot o manual)
    const yaDentro = new Set<string>();
    const ultimoAviso = new Map<string, number>();
    if (pide.pago) {
      const { data: dentro, error: errDentro } = await service.rpc("inscripciones_ya_dentro", { p_ids: ids });
      if (errDentro) throw new Error(`inscripciones_ya_dentro: ${errDentro.message}`);
      for (const x of (dentro ?? []) as unknown[]) {
        yaDentro.add(typeof x === "string" ? x : String((x as Record<string, unknown>).inscripciones_ya_dentro ?? x));
      }
      const avisadas = await leer<any>(
        "recuperacion_pagos",
        service.from("recuperacion_pagos").select("registration_id, aviso_1_at, aviso_2_at, recordatorio_manual_at")
          .eq("tipo", "individual").in("registration_id", ids),
      );
      for (const a of avisadas) {
        const t = Math.max(
          ...[a.aviso_1_at, a.aviso_2_at, a.recordatorio_manual_at].map((x) => (x ? Date.parse(x) : 0)),
        );
        if (t) ultimoAviso.set(a.registration_id, t);
      }
    }
    const ahora = Date.now();
    const VEINTE_HORAS = 20 * 3600 * 1000;
    const hoyUtc = new Date(ahora).toISOString().slice(0, 10);
    // Las mismas reglas que recuperacion_pago_info (la página del enlace)
    const plazoCerrado = (r: any) => {
      const fechaCarrera = carreraPorId.get(r.race_id)?.date as string | undefined;
      if (fechaCarrera && fechaCarrera < hoyUtc) return true;
      const cierre = cierreDe.get(r.race_distance_id) ?? (fechaCarrera ? `${fechaCarrera}T00:00:00Z` : null);
      return cierre ? new Date(cierre).getTime() <= ahora : false;
    };

    const pagoIndividual = new Map<string, { amount: number; order: string | null }>();
    for (const pi of intents) {
      if (!pagoIndividual.has(pi.registration_id)) {
        pagoIndividual.set(pi.registration_id, { amount: Number(pi.amount), order: pi.order_number ?? null });
      }
    }
    const pagoEquipo = new Map<string, { amount: number; order: string | null }>();
    for (const it of items) {
      const pi = Array.isArray(it.payment_intents) ? it.payment_intents[0] : it.payment_intents;
      if (!pagoEquipo.has(it.registration_id)) {
        pagoEquipo.set(it.registration_id, { amount: Number(it.amount), order: pi?.order_number ?? null });
      }
    }

    // Solo las preguntas propias de la carrera, del recorrido actual y a la
    // vista. Las de sistema (nombre, DNI, email…) pueden estar desfasadas; las
    // de otro recorrido se quedan huérfanas si se cambió de recorrido.
    const distanciaDe = new Map((regs as any[]).map((r) => [r.id, r.race_distance_id as string]));
    const respuestasPorInscripcion = new Map<string, { label: string; value: string; order: number }[]>();
    for (const r of respuestas) {
      const campo = Array.isArray(r.registration_form_fields) ? r.registration_form_fields[0] : r.registration_form_fields;
      if (!campo) continue;
      if (campo.is_system_field === true || campo.is_visible === false) continue;
      if (CAMPOS_DE_LA_INSCRIPCION.has(campo.field_name)) continue;
      if (campo.race_distance_id && campo.race_distance_id !== distanciaDe.get(r.registration_id)) continue;
      const label = campo.field_label ?? "";
      const value = (r.field_value ?? "").trim();
      if (!label || !value) continue;
      const lista = respuestasPorInscripcion.get(r.registration_id) ?? [];
      lista.push({ label, value, order: campo?.field_order ?? 999 });
      respuestasPorInscripcion.set(r.registration_id, lista);
    }

    // Email de la cuenta, solo para quien no lo tiene en la inscripción
    const emailCuenta = new Map<string, string>();
    for (const r of regs as any[]) {
      if (r.user_id && !(r.email ?? "").trim() && !emailCuenta.has(r.user_id)) {
        const { data } = await service.auth.admin.getUserById(r.user_id);
        if (data?.user?.email) emailCuenta.set(r.user_id, data.user.email);
      }
    }

    // ── Clasificar ────────────────────────────────────────────────────────
    const resend = dryRun ? null : new Resend(Deno.env.get("RESEND_API_KEY"));
    const resultados: Resultado[] = [];
    let primerEnvio = true;

    // Mismo orden que pidió el panel
    const porId = new Map((regs as any[]).map((r) => [r.id, r]));
    for (const id of ids) {
      const r = porId.get(id)!;
      const perfil = r.user_id ? perfilPorId.get(r.user_id) : null;

      let motivo: Motivo | null = null;
      let plantilla: Plantilla | null = null;
      if (pide.pago) {
        // El recordatorio va justo a quien las demás plantillas omiten
        const libres = libresDe.get(r.race_distance_id);
        if (r.status === "cancelled") motivo = "cancelada";
        else if (r.payment_status !== "pending") motivo = "no_pendiente_de_pago";
        // Confirmada a mano sin pagar: el enlace de pago no le sirve
        else if (r.status !== "pending") motivo = "confirmada_sin_pago";
        else if (r.source !== "gateway") motivo = "pago_fuera_de_pasarela";
        else if (r.team_id) motivo = "de_equipo";
        else if (pagoIndividual.has(id)) motivo = "ya_pagada";
        else if (yaDentro.has(id)) motivo = "ya_inscrita_por_otra_fila";
        else if (plazoCerrado(r)) motivo = "inscripciones_cerradas";
        else if (libres != null && libres < 1) motivo = "recorrido_completo";
        else if ((ultimoAviso.get(id) ?? 0) > ahora - VEINTE_HORAS) motivo = "avisada_hace_poco";
        else plantilla = "pendiente";
      } else if (r.status === "cancelled") motivo = "cancelada";
      else if (r.payment_status === "refunded") motivo = "reembolsada";
      else if (r.payment_status === "pending") motivo = "pendiente_de_pago";
      else if (plantillaEmail.omitir_uno && r.source === "external" && !incluirExternas) motivo = "importada_de_uno_es";
      else if (r.payment_status === "paid") plantilla = "pagada";
      // La gratuita dice "Confirmada": solo si lo está (el organizador puede
      // haberla dejado pendiente, p. ej. mientras revisa una licencia)
      else if (r.payment_status === "not_required" && r.status !== "confirmed") motivo = "pendiente_de_confirmar";
      else if (r.payment_status === "not_required") plantilla = "gratuita";
      else motivo = "estado_desconocido";

      // Si la plantilla usa el dorsal, solo a quien lo tiene; si usa el botón
      // de activación, además GPS en el recorrido y dorsal GPS generado
      if (!motivo && pide.dorsal && r.bib_number == null) motivo = "sin_dorsal";
      if (!motivo && pide.track) {
        if (!gpsEnRecorrido.get(r.race_distance_id)) motivo = "sin_gps_en_recorrido";
        else if (!activacionPorDorsal.has(`${r.race_distance_id}|${String(r.bib_number).trim()}`)) motivo = "sin_dorsal_gps";
      }

      const email = (
        (r.email ?? "").trim() ||
        (r.user_id ? emailCuenta.get(r.user_id) : "") ||
        (perfil?.email ?? "").trim()
      ).toLowerCase();

      if (!motivo && !EMAIL.test(email)) motivo = "sin_email";

      if (motivo || !plantilla) {
        resultados.push({ registrationId: id, resultado: "omitido", motivo: motivo ?? "estado_desconocido" });
        continue;
      }
      if (dryRun) {
        resultados.push({ registrationId: id, resultado: "se_enviaria", plantilla, email });
        continue;
      }

      // Recordatorio: el enlace se prepara ANTES de enviar y en una sola
      // transacción de servidor (preparar_recordatorio_pago): vuelve a mirar
      // si ya está dentro o si alguien avisó hace poco, y da por hechos los
      // avisos del robot. Si el email luego no sale, se deshace.
      let pagoUrl: string | null = null;
      let preparado: {
        id: string;
        sello: string;
        aviso_1_prev: string | null;
        aviso_2_prev: string | null;
        nueva: boolean;
        caduca_prev: string | null;
        caduca_nueva: string | null;
        manual_prev: string | null;
      } | null = null;
      if (pide.pago) {
        const { data: prep, error: errPrep } = await service.rpc("preparar_recordatorio_pago", {
          p_registration_id: id,
        });
        if (errPrep) {
          resultados.push({ registrationId: id, resultado: "fallido", plantilla, email, error: errPrep.message });
          continue;
        }
        const p = (prep ?? {}) as Record<string, unknown>;
        if (p.estado !== "ok" || typeof p.token !== "string") {
          const motivoPrep: Motivo =
            p.estado === "ya_dentro"
              ? "ya_inscrita_por_otra_fila"
              : p.estado === "avisada_hace_poco"
                ? "avisada_hace_poco"
                : "sin_enlace_de_pago";
          resultados.push({ registrationId: id, resultado: "omitido", motivo: motivoPrep });
          continue;
        }
        pagoUrl = `${SITE_URL}/retomar-pago/${p.token}`;
        preparado = {
          id: String(p.id),
          sello: String(p.sello),
          aviso_1_prev: (p.aviso_1_prev as string | null) ?? null,
          aviso_2_prev: (p.aviso_2_prev as string | null) ?? null,
          nueva: p.nueva === true,
          caduca_prev: (p.caduca_prev as string | null) ?? null,
          caduca_nueva: (p.caduca_nueva as string | null) ?? null,
          manual_prev: (p.manual_prev as string | null) ?? null,
        };
      }

      const carrera = carreraPorId.get(r.race_id);
      const nombre =
        [r.first_name, r.last_name].map((x: string | null) => (x ?? "").trim()).filter(Boolean).join(" ") ||
        [perfil?.first_name, perfil?.last_name].map((x: string | null) => (x ?? "").trim()).filter(Boolean).join(" ") ||
        null;
      const pago = pagoIndividual.get(id) ?? pagoEquipo.get(id) ?? null;
      const importe = pide.pago
        ? (importePendiente.get(id) ?? null)
        : pago?.amount ?? (r.importe_manual != null ? Number(r.importe_manual) : null);

      const datos: Datos = {
        plantilla,
        mensaje: mensaje || null,
        etiquetaMensaje: plantillaEmail.etiqueta_mensaje,
        activacionUrl: activacionPorDorsal.get(`${r.race_distance_id}|${String(r.bib_number ?? "").trim()}`) ?? null,
        pagoUrl,
        nombre,
        carrera: carrera?.name ?? "Carrera",
        fecha: carrera?.date ?? null,
        lugar: carrera?.location ?? null,
        recorrido: nombreDistancia.get(r.race_distance_id) ?? null,
        dorsal: r.bib_number ?? null,
        importe: importe != null && Number.isFinite(importe) ? importe : null,
        referencia: pago?.order ?? null,
        miDorsalUrl: r.token_inscripcion ? `${SITE_URL}/mi-dorsal/${r.token_inscripcion}` : null,
        seguirUrl:
          carrera?.slug && r.bib_number != null
            ? `${SITE_URL}/${carrera.slug}/gps?dorsal=${r.bib_number}&recorrido=${r.race_distance_id}`
            : null,
        respuestas: [
          // Lo que el panel mantiene al día, de las columnas de la inscripción
          ...[
            { label: "Documento", value: r.dni_passport },
            { label: "Club", value: r.club },
            { label: "Talla de camiseta", value: r.tshirt_size },
          ]
            .map(({ label, value }) => ({ label, value: String(value ?? "").trim() }))
            .filter((x) => x.value),
          // Y las preguntas propias de la carrera
          ...(respuestasPorInscripcion.get(id) ?? [])
            .sort((a, b) => a.order - b.order)
            .map(({ label, value }) => ({ label, value })),
        ],
      };

      if (!primerEnvio) await dormir(PAUSA_MS);
      primerEnvio = false;

      const mandar = () =>
        resend!.emails.send({
          from: "Camberas <noreply@camberas.com>",
          to: [email],
          subject: renderAsunto(plantillaEmail!, datos),
          html: renderCuerpo(plantillaEmail!, datos),
        });

      try {
        let { error } = await mandar();
        // Límite de Resend: un reintento tras una pausa larga
        if (error && ((error as any).statusCode === 429 || (error as any).name === "rate_limit_exceeded")) {
          await dormir(1500);
          ({ error } = await mandar());
        }
        if (error) throw new Error((error as any).message ?? String(error));
        resultados.push({ registrationId: id, resultado: "enviado", plantilla, email });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`reenviar-comprobantes: fallo con ${id}: ${msg}`);
        // El email no salió: se deshace lo suyo (lo que haya sellado el robot
        // se respeta) para que se pueda reintentar y el robot siga con lo suyo
        let nota = "";
        if (preparado) {
          const { error: errDeshacer } = await service.rpc("deshacer_recordatorio_pago", {
            p_id: preparado.id,
            p_sello: preparado.sello,
            p_prev1: preparado.aviso_1_prev,
            p_prev2: preparado.aviso_2_prev,
            p_nueva: preparado.nueva,
            p_caduca_prev: preparado.caduca_prev,
            p_caduca_nueva: preparado.caduca_nueva,
            p_manual_prev: preparado.manual_prev,
          });
          if (errDeshacer) {
            console.error(`recordatorio ${id}: no se pudo deshacer el sellado: ${errDeshacer.message}`);
            nota = " (y quedó marcada como avisada: no se podrá reintentar hasta dentro de 20 horas)";
          }
        }
        resultados.push({ registrationId: id, resultado: "fallido", plantilla, email, error: msg + nota });
      }
    }

    const cuenta = (t: Resultado["resultado"]) => resultados.filter((x) => x.resultado === t).length;
    const resumen = {
      ensayo: dryRun,
      // El panel lo comprueba: una función anterior a las plantillas no lo
      // devuelve y mandaría el comprobante en lugar de la plantilla pedida
      plantilla: plantillaEmail.clave,
      // Y si mandó en modo recordatorio: una función que no conozca
      // [[boton_pagar]] mandaría "no tienes plaza" a quien ya pagó
      pago: pide.pago,
      total: resultados.length,
      enviados: cuenta("enviado"),
      se_enviarian: cuenta("se_enviaria"),
      omitidos: cuenta("omitido"),
      fallidos: cuenta("fallido"),
      resultados,
    };
    console.log(
      `reenviar-comprobantes${dryRun ? " [ENSAYO]" : ""} por ${uid}: ` +
        `${resumen.enviados || resumen.se_enviarian} de ${resumen.total}, ${resumen.omitidos} omitidos, ${resumen.fallidos} fallidos`,
    );
    return json(resumen);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("reenviar-comprobantes:", msg);
    return json({ error: msg }, 500);
  }
});
