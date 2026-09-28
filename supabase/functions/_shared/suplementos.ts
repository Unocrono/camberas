/**
 * Suplementos de los campos con importe del formulario de inscripción
 * (fee_enabled en field_options), con campos condicionales.
 *
 * Lo usan las cinco funciones que calculan el precio: guest-register,
 * team-register, validate-coupon, redsys-init-payment y team-init-payment.
 * Antes cada una llevaba su copia de fieldFee y ninguna sabía de
 * condiciones; por eso un campo condicional no podía llevar importe
 * (alguien que manipulara la petición podía colar el valor de un campo
 * oculto con importe negativo). Ahora un campo solo suma o resta si está a
 * la vista con las respuestas dadas, con la MISMA regla que el formulario
 * (src/lib/fieldConditions.ts, camposVisibles):
 *
 *  - Un campo con depends_on_field_id se ve solo si su controlador se ve y
 *    tiene el valor depends_on_value.
 *  - Controlador que no está entre los campos cargados → el dependiente no
 *    se ve (la pregunta no se ha hecho).
 *  - Casilla como controlador: "true" = marcada, "false" = sin marcar; una
 *    casilla sin tocar cuenta como sin marcar. Por eso hay que cargar TODOS
 *    los campos del recorrido y no solo los que tienen respuesta guardada:
 *    una casilla sin marcar no se guarda.
 *  - Cadenas y ciclos como en el formulario.
 */

export interface CampoFormulario {
  id?: string;
  field_name: string;
  field_type: string;
  // deno-lint-ignore no-explicit-any
  field_options: any;
  depends_on_field_id?: string | null;
  depends_on_value?: string | null;
}

/** Columnas que hay que pedir de registration_form_fields para calcular */
export const COLUMNAS_CAMPO = "id, field_name, field_type, field_options, depends_on_field_id, depends_on_value";

const valorCasilla = (v: unknown): string => (v === true || v === "true" || v === "on" || v === "1" ? "true" : "false");

const valorComparable = (controlador: CampoFormulario, v: unknown): string => {
  if (controlador.field_type === "checkbox") return valorCasilla(v);
  if (v == null) return "";
  return String(v).trim();
};

/** Campos que se ven con estas respuestas (valores por field_name) */
export function camposVisibles<T extends CampoFormulario>(campos: T[], valores: Record<string, unknown>): T[] {
  const porId = new Map(campos.filter((c) => c.id).map((c) => [c.id as string, c]));
  const memo = new Map<string, boolean>();
  const visible = (campo: T, enCurso: Set<string>): boolean => {
    if (!campo.depends_on_field_id) return true;
    const id = campo.id ?? campo.field_name;
    const guardado = memo.get(id);
    if (guardado !== undefined) return guardado;
    if (enCurso.has(id)) return false; // ciclo
    const controlador = porId.get(campo.depends_on_field_id);
    let resultado = false;
    if (controlador) {
      enCurso.add(id);
      resultado =
        visible(controlador, enCurso) &&
        valorComparable(controlador, valores[controlador.field_name]) === String(campo.depends_on_value ?? "").trim();
      enCurso.delete(id);
    }
    memo.set(id, resultado);
    return resultado;
  };
  return campos.filter((c) => visible(c, new Set()));
}

/**
 * Importe de un campo según su respuesta:
 *  - select/radio: fees[] paralelo a options
 *  - number: fee_amount × valor · checkbox/otros: fee_amount si se marca
 */
export function importeCampo(f: CampoFormulario | null | undefined, value: unknown): number {
  const o = f?.field_options;
  if (!f || !o || Array.isArray(o) || o.fee_enabled !== true || value == null || value === "") return 0;
  if (Array.isArray(o.options) && Array.isArray(o.fees)) {
    const idx = o.options.indexOf(String(value));
    return idx >= 0 ? Number(o.fees[idx]) || 0 : 0;
  }
  const amount = Number(o.fee_amount) || 0;
  if (f.field_type === "number") {
    const n = parseFloat(String(value));
    return isNaN(n) ? 0 : amount * n;
  }
  const checked = value === true || value === "true" || value === "on" || value === "1";
  return checked ? amount : 0;
}

/**
 * Suplemento total de las respuestas y su parte descontable por cupón
 * (positiva y sin discountable=false: los negativos ya son descuento y no
 * se amplifican). Solo cuentan los campos a la vista.
 */
export function suplementos(campos: CampoFormulario[], valores: Record<string, unknown>): { total: number; descontable: number } {
  let total = 0;
  let descontable = 0;
  for (const f of camposVisibles(campos, valores)) {
    const fee = importeCampo(f, valores[f.field_name]);
    total += fee;
    if (fee > 0 && f.field_options?.discountable !== false) descontable += fee;
  }
  return { total, descontable };
}

/**
 * Para las funciones de pago, que parten de las respuestas guardadas: une
 * los campos del recorrido con los de las respuestas (por si alguno es de
 * otro ámbito) y da los valores por field_name.
 */
export function camposYValoresDeRespuestas(
  camposRecorrido: CampoFormulario[],
  respuestas: { field_value: unknown; registration_form_fields: CampoFormulario | CampoFormulario[] | null }[],
): { campos: CampoFormulario[]; valores: Record<string, unknown> } {
  const porClave = new Map<string, CampoFormulario>();
  for (const c of camposRecorrido) porClave.set(c.id ?? c.field_name, c);
  const valores: Record<string, unknown> = {};
  for (const r of respuestas) {
    const campo = Array.isArray(r.registration_form_fields) ? r.registration_form_fields[0] : r.registration_form_fields;
    if (!campo) continue;
    const clave = campo.id ?? campo.field_name;
    if (!porClave.has(clave)) porClave.set(clave, campo);
    valores[campo.field_name] = r.field_value;
  }
  return { campos: Array.from(porClave.values()), valores };
}
