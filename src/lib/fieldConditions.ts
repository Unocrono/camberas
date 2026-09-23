/**
 * Campos condicionales del formulario de inscripción.
 *
 * Un campo con depends_on_field_id solo se muestra cuando el campo del que
 * depende (el "controlador") está a la vista Y tiene el valor
 * depends_on_value. Ejemplo: "Unidad de destino" depende de
 * "¿Eres militar?" = "Sí".
 *
 * Reglas:
 *  - Un campo oculto por condición no se pinta, no cuenta como obligatorio
 *    y su valor se vacía (así no se guarda: los tres puntos de guardado
 *    descartan valores vacíos).
 *  - Si el controlador no está entre los campos cargados (lo han ocultado
 *    en el panel o es de otro recorrido), la pregunta no se ha hecho y el
 *    dependiente se oculta: si no se pregunta "¿Eres militar?", no puede
 *    ser "Sí".
 *  - Las cadenas funcionan solas: si A oculta a B, B está oculto y oculta a
 *    su vez a C. Un ciclo (A depende de B y B de A) oculta ambos en vez de
 *    colgar el navegador.
 *  - Casilla (checkbox) como controlador: "true" = marcada, "false" = sin
 *    marcar; una casilla que nadie ha tocado cuenta como sin marcar.
 */

export interface ConditionalField {
  id: string;
  field_name: string;
  field_type?: string;
  depends_on_field_id?: string | null;
  depends_on_value?: string | null;
}

/** Tipos de campo que pueden gobernar a otro */
export const TIPOS_CONTROLADOR = ["select", "radio", "checkbox"];

/** Valor de la casilla normalizado a "true" / "false" */
const valorCasilla = (v: unknown): string =>
  v === true || v === "true" || v === "on" || v === "1" ? "true" : "false";

/** Valor del controlador en forma comparable con depends_on_value */
export const valorComparable = (controlador: ConditionalField, v: unknown): string => {
  if (controlador.field_type === "checkbox") return valorCasilla(v);
  if (v == null) return "";
  return String(v).trim();
};

/** ¿El valor está vacío a efectos de guardarlo? */
export const estaVacio = (v: unknown): boolean =>
  v == null || v === "" || v === false || (Array.isArray(v) && v.length === 0);

/**
 * Filtra los campos que deben verse con las respuestas actuales.
 * `valores` va indexado por field_name, como el formData del formulario.
 */
export function camposVisibles<T extends ConditionalField>(
  campos: T[],
  valores: Record<string, unknown>,
): T[] {
  const porId = new Map(campos.map((c) => [c.id, c]));
  const memo = new Map<string, boolean>();

  const visible = (campo: T, enCurso: Set<string>): boolean => {
    if (!campo.depends_on_field_id) return true;
    const guardado = memo.get(campo.id);
    if (guardado !== undefined) return guardado;
    if (enCurso.has(campo.id)) return false; // ciclo

    const controlador = porId.get(campo.depends_on_field_id);
    let resultado = false;
    if (controlador) {
      enCurso.add(campo.id);
      resultado =
        visible(controlador, enCurso) &&
        valorComparable(controlador, valores[controlador.field_name]) ===
          String(campo.depends_on_value ?? "").trim();
      enCurso.delete(campo.id);
    }
    memo.set(campo.id, resultado);
    return resultado;
  };

  return campos.filter((c) => visible(c, new Set()));
}

/**
 * Ids de los campos que dependen, directa o indirectamente, de `campoId`.
 * El panel los excluye como posibles controladores de `campoId`, para que
 * no se pueda montar un ciclo.
 */
export function dependientesDe(campoId: string, campos: ConditionalField[]): Set<string> {
  const resultado = new Set<string>();
  const pendientes = [campoId];
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    for (const c of campos) {
      if (c.depends_on_field_id === actual && !resultado.has(c.id)) {
        resultado.add(c.id);
        pendientes.push(c.id);
      }
    }
  }
  return resultado;
}

/** Texto legible de la condición: «¿Eres militar?» es «Sí» */
export function textoCondicion(
  campo: ConditionalField,
  campos: (ConditionalField & { field_label?: string })[],
): string | null {
  if (!campo.depends_on_field_id) return null;
  const controlador = campos.find((c) => c.id === campo.depends_on_field_id);
  if (!controlador) return "depende de un campo que ya no existe";
  const valor =
    controlador.field_type === "checkbox"
      ? campo.depends_on_value === "true"
        ? "está marcada"
        : "está sin marcar"
      : `es «${campo.depends_on_value}»`;
  return `solo si «${controlador.field_label ?? controlador.field_name}» ${valor}`;
}
