/**
 * Suplementos por campo del formulario de inscripción.
 *
 * La configuración vive en registration_form_fields.field_options (JSONB):
 *  - select/radio: { options: [...], fee_enabled: true, fees: [20, 0, -5] }
 *  - checkbox:     { fee_enabled: true, fee_amount: 10 }  → si se marca
 *  - number:       { fee_enabled: true, fee_amount: 5 }   → importe × valor
 *
 * El importe puede ser negativo (descuento). El total autoritativo se
 * recalcula SIEMPRE en servidor (guest-register / redsys-init-payment);
 * este helper existe para mostrar el desglose en pantalla.
 */

export interface FeeConfigField {
  field_name: string;
  field_type: string;
  field_options?: any;
}

const cfg = (field: FeeConfigField) => {
  const o = field.field_options;
  return o && !Array.isArray(o) && o.fee_enabled === true ? o : null;
};

/** Importe de una opción concreta de un select/radio (0 si no tiene). */
export const getOptionFee = (field: FeeConfigField, option: string): number => {
  const o = cfg(field);
  if (!o || !Array.isArray(o.options) || !Array.isArray(o.fees)) return 0;
  const idx = o.options.indexOf(option);
  return idx >= 0 ? Number(o.fees[idx]) || 0 : 0;
};

/** Etiqueta de opción con su importe: "Autobús (+10€)". */
export const optionLabelWithFee = (field: FeeConfigField, option: string): string => {
  const fee = getOptionFee(field, option);
  if (!fee) return option;
  return `${option} (${fee > 0 ? "+" : ""}${fee}€)`;
};

/** Suplemento que aporta un campo según el valor introducido. */
export const getFieldFee = (field: FeeConfigField, value: unknown): number => {
  const o = cfg(field);
  if (!o || value == null || value === "") return 0;

  if (Array.isArray(o.options) && Array.isArray(o.fees)) {
    return getOptionFee(field, String(value));
  }
  const amount = Number(o.fee_amount) || 0;
  if (field.field_type === "number") {
    const n = parseFloat(String(value));
    return isNaN(n) ? 0 : amount * n;
  }
  // checkbox (y cualquier otro tipo con importe fijo)
  const checked = value === true || value === "true" || value === "on" || value === "1";
  return checked ? amount : 0;
};

/** Suplemento total del formulario. */
export const computeSupplement = (
  fields: FeeConfigField[],
  formData: Record<string, unknown>
): number => {
  const total = fields.reduce((sum, f) => sum + getFieldFee(f, formData[f.field_name]), 0);
  return Math.round(total * 100) / 100;
};
